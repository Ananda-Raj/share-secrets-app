import { getAdminSettings, updateAdminSettings, getMe, ApiError, type AdminSettings, type Branding, type Theme } from "../api.js";
import { applyBranding, logoSrc, THEMES } from "../branding.js";
import { escapeHtml } from "../html.js";
import { TTL_LABELS } from "./create.js";

const MAX_LOGO_BYTES = 100 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

async function loadSettings(container: HTMLElement): Promise<AdminSettings | null> {
  try {
    return await getAdminSettings();
  } catch (err) {
    container.innerHTML =
      err instanceof ApiError && err.status === 403
        ? `<p class="error">You're not authorized to view this.</p>`
        : `<p class="error">Could not load settings. Please try again.</p>`;
    return null;
  }
}

function saveError(err: unknown): string {
  return err instanceof ApiError ? err.message : "Could not save. Please try again.";
}

export async function loadBrandingTab(container: HTMLElement): Promise<void> {
  const settings = await loadSettings(container);
  if (!settings) return;
  const b = settings.branding;
  let logoDataUrl = b.logoDataUrl;
  let theme = b.theme;

  container.innerHTML = `
    <p class="muted">How the app looks to everyone, including people receiving a secret. Also used in emails.</p>

    <label id="b-theme-title">Theme</label>
    <div class="theme-options" role="group" aria-labelledby="b-theme-title">
      ${THEMES.map(
        (t) => `
        <button type="button" class="theme-option" data-theme="${t.id}" aria-pressed="${t.id === theme}">
          <span class="theme-sample" aria-hidden="true">
            <span class="theme-sample-title">Aa</span>
            <span class="theme-sample-line"></span>
            <span class="theme-sample-button">Send</span>
          </span>
          <span class="theme-name">${t.name}</span>
          <span class="theme-desc">${t.description}</span>
        </button>`
      ).join("")}
    </div>

    <label for="b-name">Name</label>
    <input id="b-name" type="text" maxlength="60" value="${escapeHtml(b.appName)}" />

    <label for="b-logo">Logo <span class="muted small">(PNG, JPEG, WebP or GIF, up to 100 KB)</span></label>
    <div class="logo-row">
      <img id="b-logo-preview" class="logo-preview" alt="Logo preview" src="${escapeHtml(logoSrc(b))}" />
      <div class="file-picker">
        <input id="b-logo" type="file" accept="${LOGO_TYPES.join(",")}" class="sr-only" />
        <label for="b-logo" class="file-picker-btn">Choose image</label>
      </div>
      <button type="button" id="b-logo-reset" class="link-button">Use default logo</button>
    </div>
    <p id="b-logo-error" class="error" role="alert"></p>

    <label for="b-support">Support email <span class="muted small">(optional, shown in the footer and in emails)</span></label>
    <input id="b-support" type="email" placeholder="it-help@example.com" value="${escapeHtml(b.supportEmail)}" />

    <label for="b-footer">Footer note <span class="muted small">(optional, e.g. "For Example Corp staff only")</span></label>
    <input id="b-footer" type="text" maxlength="200" value="${escapeHtml(b.footerText)}" />

    <button id="b-save" class="primary">Save changes</button>
    <p id="b-error" class="error" role="alert"></p>
    <p id="b-success" class="hint hidden">Saved. Everyone sees the changes on their next page load.</p>
  `;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const preview = $<HTMLImageElement>("#b-logo-preview");
  const logoError = $<HTMLElement>("#b-logo-error");
  const themeButtons = container.querySelectorAll<HTMLButtonElement>(".theme-option");
  // the default logo matches the theme, so the preview follows the choice
  const showLogo = () => (preview.src = logoSrc({ ...b, logoDataUrl, theme }));

  $<HTMLInputElement>("#b-logo").addEventListener("change", (e) => {
    logoError.textContent = "";
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      logoError.textContent = "Use a PNG, JPEG, WebP or GIF image.";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      logoError.textContent = "That image is larger than 100 KB.";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = String(reader.result);
      showLogo();
    };
    reader.readAsDataURL(file);
  });

  $<HTMLButtonElement>("#b-logo-reset").addEventListener("click", () => {
    logoDataUrl = "";
    showLogo();
  });

  themeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      theme = button.dataset.theme as Theme;
      themeButtons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      showLogo();
    })
  );

  const saveButton = $<HTMLButtonElement>("#b-save");
  const errorEl = $<HTMLElement>("#b-error");
  const successEl = $<HTMLElement>("#b-success");
  saveButton.addEventListener("click", async () => {
    errorEl.textContent = "";
    successEl.classList.add("hidden");
    const branding: Branding = {
      appName: $<HTMLInputElement>("#b-name").value.trim(),
      logoDataUrl,
      theme,
      supportEmail: $<HTMLInputElement>("#b-support").value.trim(),
      footerText: $<HTMLInputElement>("#b-footer").value.trim(),
    };
    if (!branding.appName) {
      errorEl.textContent = "Enter a name.";
      return;
    }
    saveButton.disabled = true;
    try {
      const saved = await updateAdminSettings({ branding });
      applyBranding(saved.branding);
      successEl.classList.remove("hidden");
    } catch (err) {
      errorEl.textContent = saveError(err);
    } finally {
      saveButton.disabled = false;
    }
  });
}

export async function loadSharingRulesTab(container: HTMLElement): Promise<void> {
  const settings = await loadSettings(container);
  if (!settings) return;
  const p = settings.policy;
  const ttlOption = (s: number, selected: number) =>
    `<option value="${s}" ${s === selected ? "selected" : ""}>${TTL_LABELS[s] ?? `${Math.round(s / 60)} minutes`}</option>`;

  container.innerHTML = `
    <p class="muted">Rules for sending. The server enforces them, not just this page.</p>

    <label for="p-senders">Allowed sender domains <span class="muted small">(one per line or comma-separated; empty means anyone who can sign in)</span></label>
    <textarea id="p-senders" rows="3" placeholder="example.com">${escapeHtml(p.allowedSenderDomains.join("\n"))}</textarea>

    <label for="p-recipients">Allowed recipient domains <span class="muted small">(empty means any email address)</span></label>
    <textarea id="p-recipients" rows="3" placeholder="example.com&#10;partner.example">${escapeHtml(p.allowedRecipientDomains.join("\n"))}</textarea>
    <p class="muted small">A domain also covers its subdomains: example.com allows eu.example.com.</p>

    <label for="p-max">Longest time a link can stay available</label>
    <select id="p-max">${settings.ttlChoices.map((s) => ttlOption(s, p.maxTtlSeconds)).join("")}</select>

    <label for="p-default">Default for new secrets</label>
    <select id="p-default">${settings.ttlChoices.map((s) => ttlOption(s, p.defaultTtlSeconds)).join("")}</select>

    <label class="checkbox"><input id="p-files" type="checkbox" ${p.fileSharingEnabled ? "checked" : ""} /> Allow file attachments</label>
    <p class="muted small">Files are encrypted like text, so the server can't inspect them. Turning this off removes the
      option for senders.</p>

    <button id="p-save" class="primary">Save sharing rules</button>
    <p id="p-error" class="error" role="alert"></p>
    <p id="p-warning" class="error hidden" role="alert"></p>
    <p id="p-success" class="hint hidden">Saved.</p>
  `;

  const $ = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
  const saveButton = $<HTMLButtonElement>("#p-save");
  const errorEl = $<HTMLElement>("#p-error");
  const warningEl = $<HTMLElement>("#p-warning");
  const successEl = $<HTMLElement>("#p-success");

  saveButton.addEventListener("click", async () => {
    errorEl.textContent = "";
    warningEl.classList.add("hidden");
    successEl.classList.add("hidden");
    const maxTtlSeconds = Number($<HTMLSelectElement>("#p-max").value);
    const defaultTtlSeconds = Number($<HTMLSelectElement>("#p-default").value);
    if (defaultTtlSeconds > maxTtlSeconds) {
      errorEl.textContent = "The default can't be longer than the maximum.";
      return;
    }
    saveButton.disabled = true;
    try {
      const saved = await updateAdminSettings({
        policy: {
          allowedSenderDomains: splitDomains($<HTMLTextAreaElement>("#p-senders").value),
          allowedRecipientDomains: splitDomains($<HTMLTextAreaElement>("#p-recipients").value),
          maxTtlSeconds,
          defaultTtlSeconds,
          fileSharingEnabled: $<HTMLInputElement>("#p-files").checked,
        },
      });
      $<HTMLTextAreaElement>("#p-senders").value = saved.policy.allowedSenderDomains.join("\n");
      $<HTMLTextAreaElement>("#p-recipients").value = saved.policy.allowedRecipientDomains.join("\n");
      successEl.classList.remove("hidden");
      await warnIfSelfBlocked(saved.policy.allowedSenderDomains, warningEl);
    } catch (err) {
      errorEl.textContent = saveError(err);
    } finally {
      saveButton.disabled = false;
    }
  });
}

function splitDomains(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

async function warnIfSelfBlocked(senderDomains: string[], warningEl: HTMLElement): Promise<void> {
  if (senderDomains.length === 0) return;
  try {
    const { email } = await getMe();
    const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (!senderDomains.some((d) => host === d || host.endsWith(`.${d}`))) {
      warningEl.textContent = `Note: your own address (${email}) isn't in the allowed sender domains, so you can't send secrets yourself.`;
      warningEl.classList.remove("hidden");
    }
  } catch {
    // warning only
  }
}
