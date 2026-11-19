import {
  getAdminAudit,
  getAdminStats,
  getAdminAuthSettings,
  updateAdminAuthSettings,
  configureIdp,
  createLocalUser,
  listAdminUsers,
  removeAdminUser,
  setUserRole,
  getAdminSettings,
  updateAdminSettings,
  sendSummaryPreview,
  ApiError,
  type AdminAuditItem,
  type SenderCount,
  type AuthSettings,
  type CognitoUserSummary,
} from "../api.js";
import { isLoggedIn, login, logout } from "../auth.js";
import { renderNav, wireNav } from "../components.js";
import { escapeHtml } from "../html.js";
import { loadBrandingTab, loadSharingRulesTab } from "./adminSettings.js";

type Tab = "activity" | "auth" | "users" | "rules" | "customize";

/** Admin-only: activity, auth settings, users, sharing rules and customize, as tabs. Backend 403s
 * non-admins regardless of whether renderNav happened to show them the link. */
export async function renderAdminPage(root: HTMLElement): Promise<void> {
  if (!isLoggedIn()) {
    await login();
    return;
  }

  root.innerHTML = `
    ${renderNav("admin")}
    <div class="card card-wide">
      <h1>Admin</h1>
      <div class="tabs">
        <button type="button" class="tab active" data-tab="activity">Activity</button>
        <button type="button" class="tab" data-tab="auth">Auth settings</button>
        <button type="button" class="tab" data-tab="users">Users</button>
        <button type="button" class="tab" data-tab="rules">Sharing rules</button>
        <button type="button" class="tab" data-tab="customize">Customize</button>
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
    if (tab === "rules") await loadSharingRulesTab(tabContent);
    if (tab === "customize") await loadBrandingTab(tabContent);
  }

  tabButtons.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab as Tab)));
  await showTab("activity");
}

async function loadActivity(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <p class="muted">Everyone's sharing activity and the top senders, for a date range.</p>
    <div class="filter-row">
      <label for="from">From</label>
      <input id="from" type="date" />
      <label for="to">To</label>
      <input id="to" type="date" />
      <button id="refresh" class="link-button">Refresh</button>
      <span class="filter-row-end">
        <button id="export-csv" class="link-button" disabled>Download CSV</button>
        <button id="reset" type="button" class="link-button link-danger" aria-expanded="false" aria-controls="reset-panel">Reset</button>
      </span>
    </div>
    <div id="reset-panel" class="panel hidden"></div>
    <div id="activity-content"><p class="muted">Loading...</p></div>

    <h2>Monthly summary</h2>
    <div class="report-row">
      <label class="checkbox"><input id="monthly-summary" type="checkbox" disabled /> Email admins a monthly summary</label>
      <button type="button" id="summary-preview" class="link-button">Send me a preview</button>
    </div>
    <p class="muted small">Sent on the 1st of each month for the month before: counts by status and the top senders.</p>
    <p id="summary-status" class="hint" role="status"></p>
  `;

  const activityContent = container.querySelector<HTMLElement>("#activity-content")!;
  const fromInput = container.querySelector<HTMLInputElement>("#from")!;
  const toInput = container.querySelector<HTMLInputElement>("#to")!;
  const exportButton = container.querySelector<HTMLButtonElement>("#export-csv")!;
  let lastItems: AdminAuditItem[] = [];
  const table = { name: "AUDIT_TABLE_NAME", region: "" };

  exportButton.addEventListener("click", () => downloadCsv(lastItems));
  wireReset(container, table, fromInput, toInput);

  async function load(): Promise<void> {
    exportButton.disabled = true;
    activityContent.innerHTML = `<p class="muted">Loading...</p>`;
    const fromEpoch = dateInputToEpoch(fromInput.value, "start");
    const toEpoch = dateInputToEpoch(toInput.value, "end");
    try {
      const [audit, stats] = await Promise.all([getAdminAudit(fromEpoch, toEpoch), getAdminStats(fromEpoch, toEpoch)]);
      activityContent.innerHTML = renderActivityContent(audit.items, stats.topSenders);
      lastItems = audit.items;
      if (audit.auditTableName) table.name = audit.auditTableName;
      if (audit.region) table.region = audit.region;
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

const SAFE_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Reset shows AWS CLI commands instead of deleting: the app itself can't delete history. */
function wireReset(
  container: HTMLElement,
  table: { name: string; region: string },
  activityFrom: HTMLInputElement,
  activityTo: HTMLInputElement
): void {
  const button = container.querySelector<HTMLButtonElement>("#reset")!;
  const panel = container.querySelector<HTMLElement>("#reset-panel")!;
  panel.innerHTML = `
    <div class="panel-head">
      <p class="panel-title">Reset history</p>
      <button type="button" id="r-close" class="link-button">Close</button>
    </div>
    <p class="muted small">
      There's no delete button here on purpose. History is the app's audit trail: the app can add
      to it but never delete from it, so even a stolen admin login can't erase what was shared.
      Rows delete themselves after a year. To remove them sooner, someone with AWS access runs
      these commands.
    </p>
    <div class="reset-fields">
      <label>From<input id="r-from" type="date" /></label>
      <label>To<input id="r-to" type="date" /></label>
      <label>Sender<input id="r-sender" type="email" placeholder="Anyone" /></label>
    </div>
    <p id="r-scope" class="hint" role="status"></p>
    <div id="r-commands">
      <p class="step-title">1. Check what will be deleted</p>
      <div class="command"><pre id="r-check" class="code-hint"></pre><button type="button" class="link-button" data-copy="r-check">Copy</button></div>
      <p class="step-title">2. Delete it</p>
      <div class="command"><pre id="r-delete" class="code-hint"></pre><button type="button" class="link-button" data-copy="r-delete">Copy</button></div>
      <p class="muted small">
        Replace YOUR_PROFILE with your AWS CLI profile. For one day, pick the same date twice.
        Only delete activity older than 7 days, so no link that's still open loses its record.
        The table's point-in-time backups keep deleted rows for up to 35 days.
      </p>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const from = $<HTMLInputElement>("#r-from");
  const to = $<HTMLInputElement>("#r-to");
  const sender = $<HTMLInputElement>("#r-sender");
  const scope = $<HTMLElement>("#r-scope");
  const commands = $<HTMLElement>("#r-commands");

  const update = () => {
    const fromEpoch = dateInputToEpoch(from.value, "start");
    const toEpoch = dateInputToEpoch(to.value, "end");
    const who = sender.value.trim();
    const problem =
      who && !SAFE_EMAIL_RE.test(who)
        ? "Enter the sender's full email address."
        : fromEpoch !== undefined && toEpoch !== undefined && fromEpoch > toEpoch
          ? "The From date is after the To date."
          : "";
    commands.classList.toggle("hidden", problem !== "");
    scope.className = problem ? "error" : "hint";
    if (problem) {
      scope.textContent = problem;
      return;
    }
    const range =
      fromEpoch === undefined && toEpoch === undefined
        ? "all dates"
        : `${from.value || "the start"} to ${to.value || "today"}`;
    scope.textContent = `Matches shares sent ${who ? `by ${who}` : "by anyone"}, ${range}.${!who && fromEpoch === undefined && toEpoch === undefined ? " That's all history." : ""}`;
    const cmd = resetCommands(table.name, table.region, fromEpoch, toEpoch, who);
    $("#r-check").textContent = cmd.check;
    $("#r-delete").textContent = cmd.remove;
  };
  [from, to, sender].forEach((input) => input.addEventListener("input", update));

  const setOpen = (open: boolean) => {
    panel.classList.toggle("hidden", !open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => {
    const open = panel.classList.contains("hidden");
    if (open) {
      from.value = activityFrom.value;
      to.value = activityTo.value;
      update();
    }
    setOpen(open);
  });
  $<HTMLButtonElement>("#r-close").addEventListener("click", () => setOpen(false));

  panel.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((copy) =>
    copy.addEventListener("click", async () => {
      const text = $(`#${copy.dataset.copy}`).textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Select and copy";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    })
  );
}

/** Scan for matching rows, then delete each by its key. The values are typed into the page,
 * so the sender is checked against SAFE_EMAIL_RE first: no quotes can reach the shell. */
function resetCommands(rawTable: string, rawRegion: string, fromEpoch?: number, toEpoch?: number, sender?: string) {
  // These get pasted into a shell, so only allow characters a table name or region can have.
  const table = /^[A-Za-z0-9_.-]{3,255}$/.test(rawTable) ? rawTable : "AUDIT_TABLE_NAME";
  const region = /^[a-z0-9-]{1,30}$/.test(rawRegion) ? rawRegion : "";
  const target = `--table-name ${table}${region ? ` --region ${region}` : ""} --profile YOUR_PROFILE`;
  const filters: string[] = [];
  const values: Record<string, { N?: string; S?: string }> = {};
  if (fromEpoch !== undefined || toEpoch !== undefined) {
    filters.push("createdAt BETWEEN :from AND :to");
    values[":from"] = { N: String(fromEpoch ?? 0) };
    values[":to"] = { N: String(toEpoch ?? Math.floor(Date.now() / 1000)) };
  }
  if (sender) {
    filters.push("senderEmail = :sender");
    values[":sender"] = { S: sender };
  }
  const scan = [
    `aws dynamodb scan ${target}`,
    ...(filters.length
      ? [`  --filter-expression "${filters.join(" AND ")}"`, `  --expression-attribute-values '${JSON.stringify(values)}'`]
      : []),
  ];
  const check = [
    ...scan,
    `  --projection-expression "createdAt, senderEmail, recipientEmail"`,
    `  --query 'Items[].[createdAt.N, senderEmail.S, recipientEmail.S]' --output table`,
  ].join(" \\\n");
  const remove = [
    [...scan, `  --projection-expression secretId --query 'Items[].secretId.S' --output text |`].join(" \\\n"),
    `tr '\\t' '\\n' | while read -r id; do`,
    `  [ -n "$id" ] && aws dynamodb delete-item ${target} \\`,
    `    --key "{\\"secretId\\":{\\"S\\":\\"$id\\"}}" && echo "deleted $id"`,
    `done`,
  ].join("\n");
  return { check, remove };
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
  if (item.failedAt) return "Not sent";
  if (item.revokedAt) return "Revoked";
  if (item.confirmedAt) return "Viewed";
  if (item.claimedAt) return "Opened";
  if (isExpired(item)) return "Expired";
  return "Not yet opened";
}

function statusBadge(item: AdminAuditItem): string {
  const text = statusText(item);
  const cls =
    text === "Viewed" ? "badge-done" : text === "Opened" ? "badge-pending" : text === "Not sent" ? "badge-failed" : "badge-waiting";
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
    <p class="muted small">To add someone without SSO, use <strong>Users → Local accounts</strong>.</p>
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

}

/** created carries a new account's one-time password through the list refresh. */
async function loadUsers(
  container: HTMLElement,
  notice = "",
  created?: { email: string; temporaryPassword: string }
): Promise<void> {
  let users: CognitoUserSummary[];
  let yourEmail: string;
  try {
    ({ users, yourEmail } = await listAdminUsers());
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
    <p class="muted">
      Admins can make other people admins, or take it back. For safety, that needs a sign-in in
      the last 10 minutes, you can't change your own role, and every admin gets an email about
      each change.
    </p>
    <p id="users-status" class="hint" role="status"></p>

    <h2>SSO users</h2>
    ${sso.length === 0 ? `<p class="muted small">None yet.</p>` : userTableHtml(sso, yourEmail)}

    <h2>Local accounts</h2>
    <p class="muted small">For someone without SSO, e.g. a short-term contractor. You see a temporary password once; it isn't stored.</p>
    <div class="inline-form">
      <input id="local-user-email" type="email" placeholder="contractor@example.com" aria-label="Email for a new local account" />
      <button id="create-local-user" class="primary">Create account</button>
    </div>
    <p id="local-user-error" class="error" role="alert"></p>
    ${
      created
        ? `<div class="created-account">
            <p class="hint">Account created for <strong>${escapeHtml(created.email)}</strong>. Temporary password
            (shown once; send it to them another way, it can't be shown again):</p>
            <input type="text" id="temp-password-out" readonly value="${escapeHtml(created.temporaryPassword)}" />
          </div>`
        : ""
    }
    ${local.length === 0 ? `<p class="muted small">None yet.</p>` : userTableHtml(local, yourEmail)}
  `;

  const status = container.querySelector<HTMLElement>("#users-status")!;
  status.textContent = notice;

  // Wired here, not with onclick="": the CSP blocks inline scripts.
  container.querySelector<HTMLInputElement>("#temp-password-out")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLInputElement).select();
  });

  const localUserError = container.querySelector<HTMLElement>("#local-user-error")!;
  container.querySelector<HTMLButtonElement>("#create-local-user")!.addEventListener("click", async (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    localUserError.textContent = "";
    const email = container.querySelector<HTMLInputElement>("#local-user-email")!.value.trim();
    if (!email) {
      localUserError.textContent = "Enter an email address.";
      return;
    }
    button.disabled = true;
    try {
      const { temporaryPassword } = await createLocalUser(email);
      await loadUsers(container, "", { email, temporaryPassword });
    } catch (err) {
      button.disabled = false;
      localUserError.textContent =
        err instanceof ApiError && err.status === 409 ? "An account with that email already exists." : "Could not create this account.";
    }
  });
  const showError = (err: unknown, fallback: string) => {
    status.className = "error";
    if (err instanceof ApiError && err.code === "reauth_required") {
      status.innerHTML = `For safety, changing admins needs a fresh sign-in.
        <button type="button" id="reauth" class="link-button">Sign in again</button>, then come back to Admin → Users.`;
      status.querySelector("#reauth")!.addEventListener("click", () => logout());
      return;
    }
    const known: Record<string, string> = {
      cannot_change_self: "You can't change your own role.",
      cannot_remove_self: "You can't remove your own account.",
      last_admin: "You can't remove the last admin.",
      not_found: "That account no longer exists. Refresh the list.",
    };
    status.textContent = (err instanceof ApiError && err.code && known[err.code]) || fallback;
  };

  container.querySelectorAll<HTMLButtonElement>("[data-role-username]").forEach((button) => {
    button.addEventListener("click", async () => {
      const email = button.dataset.email!;
      const makeAdmin = button.dataset.role === "admin";
      const question = makeAdmin
        ? `Make ${email} an admin?\n\nThey'll be able to change settings, see everyone's activity and manage users. Every admin will be emailed.`
        : `Take admin away from ${email}?\n\nEvery admin will be emailed.`;
      if (!confirm(question)) return;
      button.disabled = true;
      try {
        await setUserRole(button.dataset.roleUsername!, makeAdmin ? "admin" : "user");
        await loadUsers(container, `${email} ${makeAdmin ? "is now an admin" : "is no longer an admin"}. Every admin was emailed.`);
      } catch (err) {
        button.disabled = false;
        showError(err, "Could not change this role. Please try again.");
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-remove-username]").forEach((button) => {
    button.addEventListener("click", async () => {
      const email = button.dataset.email!;
      const adminNote = button.dataset.admin === "true" ? "\n\nThey're an admin, so this also takes that away, and every admin is emailed." : "";
      if (!confirm(`Remove ${email}? This can't be undone.\n\nFor an SSO user, this only clears their Cognito record — it doesn't revoke access at the identity provider, and they'll just get a new one on next login.${adminNote}`)) {
        return;
      }
      button.disabled = true;
      try {
        await removeAdminUser(button.dataset.removeUsername!);
        await loadUsers(container, `${email} was removed.`);
      } catch (err) {
        button.disabled = false;
        showError(err, "Could not remove this account. Please try again.");
      }
    });
  });
}

function userTableHtml(users: CognitoUserSummary[], yourEmail: string): string {
  return `
    <table class="data-table">
      <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${users
          .map((u) => {
            const email = escapeHtml(u.email);
            const username = escapeHtml(u.username);
            const isYou = u.email.toLowerCase() === yourEmail.toLowerCase();
            return `
          <tr>
            <td>${email}</td>
            <td>${u.isAdmin ? `<span class="badge badge-pending">Admin</span>` : `<span class="muted small">User</span>`}</td>
            <td>${userStatusBadge(u)}</td>
            <td>${
              isYou
                ? `<span class="muted small">(you)</span>`
                : `<span class="row-actions">
                    <button type="button" class="link-button" data-role-username="${username}" data-email="${email}" data-role="${u.isAdmin ? "user" : "admin"}">${u.isAdmin ? "Remove admin" : "Make admin"}</button>
                    <button type="button" class="link-button link-danger" data-remove-username="${username}" data-email="${email}" data-admin="${u.isAdmin}">Remove</button>
                  </span>`
            }</td>
          </tr>`;
          })
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
