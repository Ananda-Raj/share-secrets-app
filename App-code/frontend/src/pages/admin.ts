import {
  getAdminAudit,
  getAdminStats,
  getAdminAuthSettings,
  updateAdminAuthSettings,
  configureIdp,
  createLocalUser,
  listAdminUsers,
  removeAdminUser,
  getAdminSettings,
  updateAdminSettings,
  sendSummaryPreview,
  ApiError,
  type AdminAuditItem,
  type SenderCount,
  type AuthSettings,
  type CognitoUserSummary,
} from "../api.js";
import { isLoggedIn, login } from "../auth.js";
import { renderNav, wireNav } from "../components.js";
import { escapeHtml } from "../html.js";
import { loadBrandingTab, loadSharingRulesTab } from "./adminSettings.js";

type Tab = "activity" | "auth" | "users" | "branding" | "rules";

/** Admin-only: activity, auth settings, users, branding and sharing rules, as tabs. Backend 403s
 * non-admins regardless of whether renderNav happened to show them the link. */
export async function renderAdminPage(root: HTMLElement): Promise<void> {
  if (!isLoggedIn()) {
    await login();
    return;
  }

  root.innerHTML = `
    ${renderNav("admin")}
    <div class="card">
      <h1>Admin</h1>
      <div class="tabs">
        <button type="button" class="tab active" data-tab="activity">Activity</button>
        <button type="button" class="tab" data-tab="auth">Auth settings</button>
        <button type="button" class="tab" data-tab="users">Users</button>
        <button type="button" class="tab" data-tab="branding">Branding</button>
        <button type="button" class="tab" data-tab="rules">Sharing rules</button>
      </div>
      <div id="tab-content"><p class="muted">Loading...</p></div>
    </div>
  `;
  wireNav(root, "admin");

  const tabContent = root.querySelector<HTMLElement>("#tab-content")!;
  const tabButtons = root.querySelectorAll<HTMLButtonElement>(".tab");

  async function showTab(tab: Tab): Promise<void> {
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    tabContent.innerHTML = `<p class="muted">Loading...</p>`;
    if (tab === "activity") await loadActivity(tabContent);
    if (tab === "auth") await loadAuthSettings(tabContent);
    if (tab === "users") await loadUsers(tabContent);
    if (tab === "branding") await loadBrandingTab(tabContent);
    if (tab === "rules") await loadSharingRulesTab(tabContent);
  }

  tabButtons.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab as Tab)));
  await showTab("activity");
}

async function loadActivity(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <p class="muted">Everyone's sharing activity and the top senders, for a date range.</p>
    <div class="report-row">
      <label class="checkbox"><input id="monthly-summary" type="checkbox" disabled /> Email admins a monthly summary</label>
      <button type="button" id="summary-preview" class="link-button">Send me a preview</button>
    </div>
    <p class="muted small">Sent on the 1st of each month for the month before: counts by status and the top senders.</p>
    <p id="summary-status" class="hint" role="status"></p>
    <div class="filter-row">
      <label for="from">From</label>
      <input id="from" type="date" />
      <label for="to">To</label>
      <input id="to" type="date" />
      <button id="refresh" class="link-button">Refresh</button>
      <button id="export-csv" class="link-button" disabled>Download CSV</button>
    </div>
    <div id="activity-content"><p class="muted">Loading...</p></div>
  `;

  const activityContent = container.querySelector<HTMLElement>("#activity-content")!;
  const fromInput = container.querySelector<HTMLInputElement>("#from")!;
  const toInput = container.querySelector<HTMLInputElement>("#to")!;
  const exportButton = container.querySelector<HTMLButtonElement>("#export-csv")!;
  let lastItems: AdminAuditItem[] = [];

  exportButton.addEventListener("click", () => downloadCsv(lastItems));

  async function load(): Promise<void> {
    exportButton.disabled = true;
    activityContent.innerHTML = `<p class="muted">Loading...</p>`;
    const fromEpoch = dateInputToEpoch(fromInput.value, "start");
    const toEpoch = dateInputToEpoch(toInput.value, "end");
    try {
      const [audit, stats] = await Promise.all([getAdminAudit(fromEpoch, toEpoch), getAdminStats(fromEpoch, toEpoch)]);
      activityContent.innerHTML = renderActivityContent(audit.items, stats.topSenders);
      lastItems = audit.items;
      exportButton.disabled = lastItems.length === 0;
    } catch (err) {
      activityContent.innerHTML =
        err instanceof ApiError && err.status === 403
          ? `<p class="error">You're not authorized to view this.</p>`
          : `<p class="error">Could not load admin data. Please try again.</p>`;
    }
  }

  container.querySelector<HTMLButtonElement>("#refresh")!.addEventListener("click", load);
  void wireMonthlySummary(container);
  await load();
}

async function wireMonthlySummary(container: HTMLElement): Promise<void> {
  const toggle = container.querySelector<HTMLInputElement>("#monthly-summary")!;
  const previewButton = container.querySelector<HTMLButtonElement>("#summary-preview")!;
  const status = container.querySelector<HTMLElement>("#summary-status")!;
  const show = (text: string, isError = false) => {
    status.textContent = text;
    status.className = isError ? "error" : "hint";
  };

  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    try {
      await updateAdminSettings({ reports: { monthlySummary: toggle.checked } });
      show(toggle.checked ? "On. Every admin gets the next summary on the 1st." : "Off.");
    } catch {
      toggle.checked = !toggle.checked;
      show("Could not save. Please try again.", true);
    } finally {
      toggle.disabled = false;
    }
  });

  previewButton.addEventListener("click", async () => {
    previewButton.disabled = true;
    try {
      const { sentTo } = await sendSummaryPreview();
      show(`Sent a summary of the last 30 days to ${sentTo}.`);
    } catch {
      show("Could not send the preview. If SES is in sandbox mode, your address must be verified there first.", true);
    } finally {
      previewButton.disabled = false;
    }
  });

  try {
    toggle.checked = (await getAdminSettings()).reports.monthlySummary;
    toggle.disabled = false;
  } catch {
    show("Could not load the monthly summary setting.", true);
  }
}

function renderActivityContent(audit: AdminAuditItem[], topSenders: SenderCount[]): string {
  return `
    <h2>Top senders</h2>
    ${topSenders.length === 0 ? `<p class="muted small">No activity in this range.</p>` : renderTopSenders(topSenders)}

    <h2>All activity</h2>
    ${audit.length === 0 ? `<p class="muted small">No activity in this range.</p>` : renderAuditTable(audit)}
  `;
}

function renderTopSenders(topSenders: SenderCount[]): string {
  return `
    <table class="data-table">
      <thead><tr><th>Sender</th><th>Secrets shared</th></tr></thead>
      <tbody>
        ${topSenders.map((s) => `<tr><td>${escapeHtml(s.senderEmail)}</td><td>${s.count}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderAuditTable(items: AdminAuditItem[]): string {
  return `
    <div class="table-scroll">
      <table class="data-table data-table-wide">
        <thead>
          <tr><th>Sent</th><th>Type</th><th>Sender</th><th>Recipient</th><th>Description</th><th>Status</th><th>Expires</th></tr>
        </thead>
        <tbody>
          ${items.map(auditRowHtml).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function auditRowHtml(item: AdminAuditItem): string {
  return `
    <tr>
      <td>${formatDate(item.createdAt)}</td>
      <td>${typeLabel(item)}</td>
      <td>${escapeHtml(item.senderEmail)}</td>
      <td>${escapeHtml(item.recipientEmail)}</td>
      <td>${item.description ? escapeHtml(item.description) : `<span class="muted small">—</span>`}</td>
      <td>${statusBadge(item)}</td>
      <td>${expiresLabel(item)}</td>
    </tr>
  `;
}

function expiresLabel(item: AdminAuditItem): string {
  if (item.secretExpiresAt === undefined) return `<span class="muted small">—</span>`;
  return formatDate(item.secretExpiresAt);
}

// Undefined (a record from before secretExpiresAt existed) can't be judged expired --
// same as it couldn't before this field was added.
function isExpired(item: AdminAuditItem): boolean {
  return (
    item.secretExpiresAt !== undefined &&
    !item.claimedAt &&
    !item.confirmedAt &&
    !item.revokedAt &&
    item.secretExpiresAt <= Math.floor(Date.now() / 1000)
  );
}

function typeLabel(item: AdminAuditItem): string {
  if (item.isFile === undefined) return `<span class="muted small">—</span>`;
  return item.isFile ? "File" : "Text";
}

function statusText(item: AdminAuditItem): string {
  if (item.revokedAt) return "Revoked";
  if (item.confirmedAt) return "Viewed";
  if (item.claimedAt) return "Opened";
  if (isExpired(item)) return "Expired";
  return "Not yet opened";
}

function statusBadge(item: AdminAuditItem): string {
  const text = statusText(item);
  const cls = text === "Viewed" ? "badge-done" : text === "Opened" ? "badge-pending" : "badge-waiting";
  return `<span class="badge ${cls}">${text}</span>`;
}

// Leading = + - @ would make a spreadsheet run the cell as a formula.
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function isoDate(epoch?: number | null): string {
  return epoch ? new Date(epoch * 1000).toISOString() : "";
}

function downloadCsv(items: AdminAuditItem[]): void {
  const header = ["Sent", "Type", "Sender", "Recipient", "Description", "Status", "Opened", "Viewed", "Revoked", "Expires"];
  const rows = items.map((i) => [
    isoDate(i.createdAt),
    i.isFile === undefined ? "" : i.isFile ? "File" : "Text",
    i.senderEmail,
    i.recipientEmail,
    i.description ?? "",
    statusText(i),
    isoDate(i.claimedAt),
    isoDate(i.confirmedAt),
    isoDate(i.revokedAt),
    isoDate(i.secretExpiresAt),
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// <input type="date"> gives a local yyyy-mm-dd with no time component — anchor it to
// the start/end of that local day so "To" includes the rest of that day.
function dateInputToEpoch(value: string, edge: "start" | "end"): number | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T${edge === "start" ? "00:00:00" : "23:59:59"}`);
  return Math.floor(d.getTime() / 1000);
}

async function loadAuthSettings(container: HTMLElement): Promise<void> {
  let settings: AuthSettings;
  try {
    settings = await getAdminAuthSettings();
  } catch (err) {
    container.innerHTML =
      err instanceof ApiError && err.status === 403
        ? `<p class="error">You're not authorized to view this.</p>`
        : `<p class="error">Could not load auth settings. Please try again.</p>`;
    return;
  }

  container.innerHTML = `
    <p>
      Native username/password sign-up:
      <strong>${settings.selfSignupEnabled ? "open" : "closed"}</strong>
      <button type="button" id="toggle-signup" class="link-button">
        ${settings.selfSignupEnabled ? "Close it" : "Open it"}
      </button>
    </p>
    <p class="muted small">
      ${
        settings.configuredIdps.length > 0
          ? `Configured identity providers: ${settings.configuredIdps.map(escapeHtml).join(", ")}`
          : "No identity provider configured yet."
      }
    </p>
    <p id="signup-error" class="error" role="alert"></p>

    <h2>Add or update an identity provider</h2>
    <p class="muted small">Works with any standard OIDC provider — Entra ID, Okta, Google Workspace, Auth0, Keycloak.</p>
    <label for="idp-name">Name</label>
    <input id="idp-name" type="text" placeholder="EntraID" maxlength="32" />
    <label for="idp-issuer">Issuer URL</label>
    <input id="idp-issuer" type="text" placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0" />
    <label for="idp-client-id">Client ID</label>
    <input id="idp-client-id" type="text" />
    <label for="idp-client-secret">Client secret</label>
    <input id="idp-client-secret" type="password" />
    <button id="save-idp" class="primary">Save identity provider</button>
    <p id="idp-error" class="error" role="alert"></p>
    <p id="idp-success" class="hint hidden"></p>

    <h2>Add a local account</h2>
    <p class="muted small">For someone without access to the identity provider above — e.g. a short-term contractor. Shows a one-time temporary password; nothing here stores it.</p>
    <label for="local-user-email">Email</label>
    <input id="local-user-email" type="email" placeholder="contractor@example.com" />
    <button id="create-local-user" class="primary">Create account</button>
    <p id="local-user-error" class="error" role="alert"></p>
    <div id="local-user-result"></div>
  `;

  const signupError = container.querySelector<HTMLElement>("#signup-error")!;
  container.querySelector<HTMLButtonElement>("#toggle-signup")!.addEventListener("click", async (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    button.disabled = true;
    signupError.textContent = "";
    try {
      await updateAdminAuthSettings(!settings.selfSignupEnabled);
      await loadAuthSettings(container);
    } catch {
      signupError.textContent = "Could not update this setting. Please try again.";
      button.disabled = false;
    }
  });

  const idpError = container.querySelector<HTMLElement>("#idp-error")!;
  const idpSuccess = container.querySelector<HTMLElement>("#idp-success")!;
  container.querySelector<HTMLButtonElement>("#save-idp")!.addEventListener("click", async () => {
    idpError.textContent = "";
    idpSuccess.classList.add("hidden");
    const idpName = (container.querySelector<HTMLInputElement>("#idp-name")!).value.trim();
    const issuerUrl = (container.querySelector<HTMLInputElement>("#idp-issuer")!).value.trim();
    const clientId = (container.querySelector<HTMLInputElement>("#idp-client-id")!).value.trim();
    const clientSecret = (container.querySelector<HTMLInputElement>("#idp-client-secret")!).value;
    if (!idpName || !issuerUrl || !clientId || !clientSecret) {
      idpError.textContent = "All four fields are required.";
      return;
    }
    try {
      await configureIdp({ idpName, issuerUrl, clientId, clientSecret });
      idpSuccess.textContent = `Saved. "${idpName}" is now available on the sign-in screen.`;
      idpSuccess.classList.remove("hidden");
      await loadAuthSettings(container);
    } catch (err) {
      idpError.textContent = err instanceof ApiError ? err.message : "Could not save this identity provider.";
    }
  });

  const localUserError = container.querySelector<HTMLElement>("#local-user-error")!;
  const localUserResult = container.querySelector<HTMLElement>("#local-user-result")!;
  container.querySelector<HTMLButtonElement>("#create-local-user")!.addEventListener("click", async () => {
    localUserError.textContent = "";
    localUserResult.innerHTML = "";
    const emailInput = container.querySelector<HTMLInputElement>("#local-user-email")!;
    const email = emailInput.value.trim();
    if (!email) {
      localUserError.textContent = "Enter an email address.";
      return;
    }
    try {
      const { temporaryPassword } = await createLocalUser(email);
      localUserResult.innerHTML = `
        <p class="hint">Account created for <strong>${escapeHtml(email)}</strong>. Temporary password
        (shown once — relay it out of band, it can't be retrieved again):</p>
        <input type="text" id="temp-password-out" readonly value="${escapeHtml(temporaryPassword)}" />
      `;
      // CSP has no 'unsafe-inline' for scripts, so this is wired up here rather than
      // via an onclick="" attribute (which the browser would silently refuse to run).
      localUserResult.querySelector<HTMLInputElement>("#temp-password-out")!.addEventListener("click", (e) => {
        (e.currentTarget as HTMLInputElement).select();
      });
      emailInput.value = "";
    } catch (err) {
      localUserError.textContent =
        err instanceof ApiError && err.status === 409
          ? "An account with that email already exists."
          : "Could not create this account.";
    }
  });
}

async function loadUsers(container: HTMLElement): Promise<void> {
  let users: CognitoUserSummary[];
  let yourEmail: string;
  let rolesTableName: string;
  try {
    ({ users, yourEmail, rolesTableName } = await listAdminUsers());
  } catch (err) {
    container.innerHTML =
      err instanceof ApiError && err.status === 403
        ? `<p class="error">You're not authorized to view this.</p>`
        : `<p class="error">Could not load users. Please try again.</p>`;
    return;
  }

  const sso = users.filter((u) => u.isFederated);
  const local = users.filter((u) => !u.isFederated);

  container.innerHTML = `
    <p class="hint">
      To make someone admin (or take it back), run one of these — there's no button for
      it on purpose, so changing who's an admin always needs real AWS access, not just
      another admin's say-so:
    </p>
    <pre class="code-hint"># Promote
aws dynamodb put-item --table-name ${escapeHtml(rolesTableName)} \\
  --item '{"email": {"S": "someone@example.com"}, "role": {"S": "admin"}}'

# Demote back to a normal user
aws dynamodb delete-item --table-name ${escapeHtml(rolesTableName)} \\
  --key '{"email": {"S": "someone@example.com"}}'</pre>

    <h2>SSO users</h2>
    ${sso.length === 0 ? `<p class="muted small">None yet.</p>` : userTableHtml(sso, yourEmail)}

    <h2>Local accounts</h2>
    ${local.length === 0 ? `<p class="muted small">None yet.</p>` : userTableHtml(local, yourEmail)}
  `;

  container.querySelectorAll<HTMLButtonElement>("[data-remove-username]").forEach((button) => {
    button.addEventListener("click", async () => {
      const username = button.dataset.removeUsername!;
      const email = button.dataset.removeEmail!;
      if (!confirm(`Remove ${email}? This can't be undone.\n\nFor an SSO user, this only clears their Cognito record — it doesn't revoke access at the identity provider, and they'll just get a new one on next login.`)) {
        return;
      }
      button.disabled = true;
      try {
        await removeAdminUser(username, email);
        await loadUsers(container);
      } catch (err) {
        button.disabled = false;
        alert(
          err instanceof ApiError && err.code === "cannot_remove_self"
            ? "You can't remove your own account."
            : "Could not remove this account. Please try again."
        );
      }
    });
  });
}

function userTableHtml(users: CognitoUserSummary[], yourEmail: string): string {
  return `
    <table class="data-table">
      <thead><tr><th>Email</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${users
          .map(
            (u) => `
          <tr>
            <td>${escapeHtml(u.email)}${u.isAdmin ? ` <span class="muted small">(Admin)</span>` : ""}</td>
            <td>${userStatusBadge(u)}</td>
            <td>${
              u.email === yourEmail
                ? `<span class="muted small">(you)</span>`
                : `<button type="button" class="link-button" data-remove-username="${escapeHtml(u.username)}" data-remove-email="${escapeHtml(u.email)}">Remove</button>`
            }</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function userStatusBadge(u: CognitoUserSummary): string {
  if (!u.enabled) return `<span class="badge badge-waiting">Disabled</span>`;
  if (u.status === "FORCE_CHANGE_PASSWORD") return `<span class="badge badge-pending">Invitation pending</span>`;
  if (u.status === "CONFIRMED") return `<span class="badge badge-done">Active</span>`;
  return `<span class="badge badge-waiting">${escapeHtml(u.status)}</span>`;
}

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString();
}
