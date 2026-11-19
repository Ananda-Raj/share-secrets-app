import { generateFragmentKey, encrypt, toBase64Url } from "../crypto.js";
import { encodeFilePayload, MAX_FILE_BYTES } from "../fileEnvelope.js";
import { createSecret, getMe, ApiError, AuthRequiredError, type MyPolicy } from "../api.js";
import { isLoggedIn, login } from "../auth.js";
import { renderNav, wireNav } from "../components.js";
import { escapeHtml } from "../html.js";
import { renderResultPage, type SendResult } from "./result.js";

export const TTL_LABELS: Record<number, string> = {
  600: "10 minutes",
  3600: "1 hour",
  86400: "1 day",
  259200: "3 days",
  604800: "7 days",
};

// Used if /me can't be read; the server enforces the real rules either way.
const FALLBACK_POLICY: MyPolicy = {
  canSend: true,
  allowedRecipientDomains: [],
  maxTtlSeconds: 604800,
  defaultTtlSeconds: 86400,
  fileSharingEnabled: true,
  ttlChoices: [600, 3600, 86400, 259200, 604800],
};

const MAX_SECRET_CHARS = 15000;
const MAX_FILE_KB = Math.round(MAX_FILE_BYTES / 1024);
const MAX_RECIPIENTS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma, semicolon, space or newline separated; duplicates dropped. */
function parseRecipients(value: string): string[] {
  const unique = new Map<string, string>();
  for (const email of value.split(/[\s,;]+/)) {
    if (email && !unique.has(email.toLowerCase())) unique.set(email.toLowerCase(), email);
  }
  return [...unique.values()];
}

function sendErrorText(err: unknown): string {
  if (err instanceof ApiError && err.status >= 500) return "Something went wrong. Please try again.";
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/** Same rule as the backend: empty allows all, a domain also covers its subdomains. */
function matchesDomains(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Senders must be logged in; receivers never are. Delivery is always email + OTP, one copy per recipient. */
export async function renderCreatePage(root: HTMLElement): Promise<void> {
  if (!isLoggedIn()) {
    await login();
    return; // the page is navigating away
  }

  root.innerHTML = `
    ${renderNav("create")}
    <div class="card" id="create-card"><p class="muted">Loading...</p></div>
  `;
  wireNav(root, "create");
  const card = root.querySelector<HTMLElement>("#create-card")!;

  let policy = FALLBACK_POLICY;
  let myEmail = "";
  try {
    const me = await getMe();
    myEmail = me.email;
    if (me.policy) policy = me.policy;
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      await login();
      return;
    }
  }

  if (!policy.canSend) {
    card.innerHTML = `
      <h1>Sending isn't available</h1>
      <p class="muted">Your account (<strong>${escapeHtml(myEmail)}</strong>) isn't on this site's list of
        allowed senders. Ask an administrator if you need access.</p>
    `;
    return;
  }

  const ttlOptions = policy.ttlChoices.filter((s) => s <= policy.maxTtlSeconds);
  const recipientDomains = policy.allowedRecipientDomains;

  card.innerHTML = `
    <h1>Share a secret</h1>
    <p class="muted">Encrypted in your browser before it ever leaves your device. Viewable once, then gone.</p>

    <label for="secret">Secret</label>
    <textarea id="secret" rows="5" placeholder="Paste an API key, password, or token..." maxlength="${MAX_SECRET_CHARS}"></textarea>

    ${
      policy.fileSharingEnabled
        ? `
    <label for="file">Or attach a small file instead <span class="muted small">(max ${MAX_FILE_KB} KB — not both)</span></label>
    <div class="file-picker">
      <input id="file" type="file" class="sr-only" />
      <label for="file" class="file-picker-btn">Choose file</label>
      <span id="file-name" class="file-picker-name">No file chosen</span>
      <button type="button" id="file-remove" class="file-picker-clear hidden" aria-label="Remove selected file">✕</button>
    </div>
    <p id="file-error" class="error" role="alert"></p>`
        : ""
    }

    <label for="ttl">Link available for <span class="muted small">(the emailed access code expires much sooner than this — see below)</span></label>
    <select id="ttl">
      ${ttlOptions
        .map(
          (s) =>
            `<option value="${s}" ${s === policy.defaultTtlSeconds ? "selected" : ""}>${TTL_LABELS[s] ?? `${Math.round(s / 60)} minutes`}</option>`
        )
        .join("")}
    </select>

    <label for="recipient">Recipients <span class="muted small">(up to ${MAX_RECIPIENTS}, separated by commas${
      recipientDomains.length ? `; must be at ${recipientDomains.map(escapeHtml).join(", ")}` : ""
    })</span></label>
    <textarea id="recipient" rows="2" autocomplete="off" spellcheck="false" placeholder="name@example.com, another@example.com"></textarea>

    <label for="description">Description <span class="muted small">(shown only in your own history, never to the receiver)</span></label>
    <input id="description" type="text" placeholder="e.g. AWS prod DB password" maxlength="200" />

    <label for="subject">Email subject</label>
    <input id="subject" type="text" placeholder="A secret was shared with you" maxlength="200" />

    <label class="checkbox"><input id="notify" type="checkbox" /> Email me when it's opened</label>

    <p class="muted small">Each recipient gets their own link and one-time access code by email, and can only open
      their own copy. The code expires quickly, separately from the link above; if it expires before they use it,
      they can request a new one from the same link, no need to resend the whole secret.</p>

    <button id="submit" class="primary">Send secure email</button>
    <p id="error" class="error" role="alert"></p>
  `;

  const secretInput = card.querySelector<HTMLTextAreaElement>("#secret")!;
  const fileInput = card.querySelector<HTMLInputElement>("#file");
  const submitButton = card.querySelector<HTMLButtonElement>("#submit")!;
  const errorEl = card.querySelector<HTMLElement>("#error")!;

  if (fileInput) wireFilePicker(card, fileInput);

  submitButton.addEventListener("click", async () => {
    errorEl.textContent = "";
    const secretText = secretInput.value;
    const file = fileInput?.files?.[0];
    const ttlSeconds = Number(card.querySelector<HTMLSelectElement>("#ttl")!.value);
    const recipients = parseRecipients(card.querySelector<HTMLTextAreaElement>("#recipient")!.value);
    const description = card.querySelector<HTMLInputElement>("#description")!.value.trim();
    const subject = card.querySelector<HTMLInputElement>("#subject")!.value.trim();
    const notifyOnOpen = card.querySelector<HTMLInputElement>("#notify")!.checked;

    if (secretText.trim() && file) {
      errorEl.textContent = "Choose either a secret or a file, not both.";
      return;
    }
    if (!secretText.trim() && !file) {
      errorEl.textContent = policy.fileSharingEnabled ? "Enter a secret or attach a file." : "Enter a secret.";
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      errorEl.textContent = `That file is too large — max ${MAX_FILE_KB} KB.`;
      return;
    }
    if (recipients.length === 0) {
      errorEl.textContent = "Enter at least one recipient email address.";
      return;
    }
    if (recipients.length > MAX_RECIPIENTS) {
      errorEl.textContent = `Up to ${MAX_RECIPIENTS} recipients per send.`;
      return;
    }
    const invalid = recipients.filter((r) => !EMAIL_RE.test(r));
    if (invalid.length) {
      errorEl.textContent = `Not a valid email address: ${invalid.join(", ")}`;
      return;
    }
    const outside = recipients.filter((r) => !matchesDomains(r, recipientDomains));
    if (outside.length) {
      errorEl.textContent = `Recipients must have an address at ${recipientDomains.join(", ")}. Not allowed: ${outside.join(", ")}`;
      return;
    }
    if (!description) {
      errorEl.textContent = "Enter a description.";
      return;
    }
    if (!subject) {
      errorEl.textContent = "Enter an email subject.";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Encrypting...";

    try {
      const plaintext = file
        ? encodeFilePayload({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            data: toBase64Url(new Uint8Array(await file.arrayBuffer())),
          })
        : secretText;

      // A separate key per recipient, so one person's link can't open another's copy.
      const results: SendResult[] = [];
      for (const [i, recipientEmail] of recipients.entries()) {
        submitButton.textContent = recipients.length > 1 ? `Sending ${i + 1} of ${recipients.length}...` : "Sending...";
        try {
          const fragmentKey = generateFragmentKey();
          const { ciphertext, iv } = await encrypt(plaintext, fragmentKey);
          const k1 = toBase64Url(fragmentKey);
          const { id } = await createSecret({
            ciphertext: toBase64Url(ciphertext),
            iv: toBase64Url(iv),
            k1,
            recipientEmail,
            ttlSeconds,
            subject,
            description,
            isFile: !!file,
            notifyOnOpen,
          });
          results.push({ recipientEmail, link: `${window.location.origin}/s/${id}#${k1}` });
        } catch (err) {
          if (!(err instanceof AuthRequiredError)) {
            results.push({ recipientEmail, error: sendErrorText(err) });
            continue;
          }
          if (results.length === 0) {
            await login();
            return;
          }
          const error = "Not sent: your session ended. Sign in again and send it.";
          results.push(...recipients.slice(i).map((r) => ({ recipientEmail: r, error })));
          break;
        }
      }

      const failures = results.filter((r) => r.error);
      if (failures.length === results.length) {
        errorEl.textContent =
          failures.length === 1
            ? failures[0].error!
            : `Nothing was sent. ${failures.map((f) => `${f.recipientEmail}: ${f.error}`).join(" ")}`;
        return;
      }
      renderResultPage(root, results);
    } catch (err) {
      errorEl.textContent = sendErrorText(err);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send secure email";
    }
  });
}

function wireFilePicker(card: HTMLElement, fileInput: HTMLInputElement): void {
  const fileNameEl = card.querySelector<HTMLElement>("#file-name")!;
  const fileRemove = card.querySelector<HTMLButtonElement>("#file-remove")!;
  const fileErrorEl = card.querySelector<HTMLElement>("#file-error")!;
  const NO_FILE_LABEL = "No file chosen";

  fileInput.addEventListener("change", () => {
    fileErrorEl.textContent = "";
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      fileErrorEl.textContent = `That file is too large — max ${MAX_FILE_KB} KB.`;
      fileInput.value = "";
      return;
    }
    fileNameEl.textContent = file.name;
    fileNameEl.classList.add("has-file");
    fileRemove.classList.remove("hidden");
  });

  fileRemove.addEventListener("click", () => {
    fileInput.value = "";
    fileErrorEl.textContent = "";
    fileNameEl.textContent = NO_FILE_LABEL;
    fileNameEl.classList.remove("has-file");
    fileRemove.classList.add("hidden");
  });
}
