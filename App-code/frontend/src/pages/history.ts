import { getMyHistory, revokeSecret, ApiError, type HistoryItem } from "../api.js";
import { isLoggedIn, login } from "../auth.js";
import { renderNav, wireNav } from "../components.js";
import { escapeHtml } from "../html.js";

/** Every sender's own send history — description and read status only, never the
 * secret itself (which no longer exists server-side by the time this is viewed). A
 * pending (not yet opened) send can be revoked here -- sender-only, and only before the
 * recipient claims it; nothing to take back after that. */
export async function renderHistoryPage(root: HTMLElement): Promise<void> {
  if (!isLoggedIn()) {
    await login();
    return;
  }

  root.innerHTML = `${renderNav("history")}<div class="card card-wide"><p class="muted">Loading...</p></div>`;
  wireNav(root, "history");

  await loadHistory(root.querySelector<HTMLElement>(".card")!);
}

async function loadHistory(card: HTMLElement): Promise<void> {
  let items: HistoryItem[];
  try {
    ({ items } = await getMyHistory());
  } catch {
    card.innerHTML = `<h1>My history</h1><p class="error">Could not load your history. Please try again.</p>`;
    return;
  }

  card.innerHTML = `
    <h1>My history</h1>
    <p class="muted">What you've shared and whether it's been opened. Only you can see this.</p>
    ${items.length === 0 ? `<p class="muted small">You haven't shared anything yet.</p>` : renderTable(items)}
  `;

  card.querySelectorAll<HTMLButtonElement>("[data-revoke-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const secretId = button.dataset.revokeId!;
      if (!confirm("Revoke this secret? The link will stop working immediately — this can't be undone.")) return;
      button.disabled = true;
      button.textContent = "Revoking...";
      try {
        await revokeSecret(secretId);
        await loadHistory(card);
      } catch (err) {
        button.disabled = false;
        button.textContent = "Revoke";
        alert(
          err instanceof ApiError && err.status === 409
            ? "Too late — the recipient already opened it."
            : "Could not revoke this secret. Please try again."
        );
      }
    });
  });
}

function renderTable(items: HistoryItem[]): string {
  return `
    <table class="data-table">
      <thead>
        <tr><th>Sent</th><th>Type</th><th>Recipient</th><th>Description</th><th>Status</th><th>Expires</th><th></th></tr>
      </thead>
      <tbody>
        ${items.map(rowHtml).join("")}
      </tbody>
    </table>
  `;
}

function rowHtml(item: HistoryItem): string {
  const pending = !item.claimedAt && !item.confirmedAt && !item.revokedAt && !item.failedAt && !isExpired(item);
  return `
    <tr>
      <td>${formatDate(item.createdAt)}</td>
      <td>${typeLabel(item)}</td>
      <td>${escapeHtml(item.recipientEmail)}</td>
      <td>${item.description ? escapeHtml(item.description) : `<span class="muted small">—</span>`}</td>
      <td>${statusBadge(item)}</td>
      <td>${expiresLabel(item)}</td>
      <td>${pending ? `<button type="button" class="link-button" data-revoke-id="${item.secretId}">Revoke</button>` : ""}</td>
    </tr>
  `;
}

function expiresLabel(item: HistoryItem): string {
  if (item.secretExpiresAt === undefined) return `<span class="muted small">—</span>`;
  return formatDate(item.secretExpiresAt);
}

// Undefined (a record from before secretExpiresAt existed) can't be judged expired --
// same as it couldn't before this field was added.
function isExpired(item: HistoryItem): boolean {
  return (
    item.secretExpiresAt !== undefined &&
    !item.claimedAt &&
    !item.confirmedAt &&
    !item.revokedAt &&
    item.secretExpiresAt <= Math.floor(Date.now() / 1000)
  );
}

function typeLabel(item: HistoryItem): string {
  if (item.isFile === undefined) return `<span class="muted small">—</span>`;
  return item.isFile ? "File" : "Text";
}

function statusBadge(item: HistoryItem): string {
  if (item.failedAt) return `<span class="badge badge-failed">Not sent</span>`;
  if (item.revokedAt) return `<span class="badge badge-waiting">Revoked</span>`;
  if (item.confirmedAt) return `<span class="badge badge-done">Viewed</span>`;
  if (item.claimedAt) return `<span class="badge badge-pending">Opened</span>`;
  if (isExpired(item)) return `<span class="badge badge-waiting">Expired</span>`;
  return `<span class="badge badge-waiting">Not yet opened</span>`;
}

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}
