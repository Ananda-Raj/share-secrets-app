import { fromBase64Url, decrypt } from "../crypto.js";
import { decodeFilePayload } from "../fileEnvelope.js";
import { getSecretMeta, verifyOtp, confirmBurn, resendOtp, ApiError } from "../api.js";
import { escapeHtml } from "../html.js";
import { renderBrand } from "../components.js";

/** Receivers never log in: the emailed link plus the OTP is the only way in. */
export async function renderUnlockPage(root: HTMLElement, id: string): Promise<void> {
  // The fragment key never left the receiver's browser — it travelled here as part of
  // the URL, which the browser never sends to any server.
  const fragmentKeyB64 = window.location.hash.slice(1);
  if (!fragmentKeyB64) {
    renderNotAvailable(root, "This link is missing its decryption key. Make sure you copied the whole link.");
    return;
  }

  root.innerHTML = `${renderBrand(true)}<div class="card"><p class="muted">Checking link...</p></div>`;

  let meta: Awaited<ReturnType<typeof getSecretMeta>>;
  try {
    meta = await getSecretMeta(id);
  } catch {
    renderNotAvailable(root, "Something went wrong. Please try again.");
    return;
  }

  if (!meta.exists) {
    renderNotAvailable(root, "This secret has already been viewed, or the link has expired.");
    return;
  }

  renderOtpForm(root, id, fromBase64Url(fragmentKeyB64));
}

function renderNotAvailable(root: HTMLElement, message: string): void {
  root.innerHTML = `
    ${renderBrand(true)}
    <div class="card">
      <h1>Not available</h1>
      <p class="muted">${message}</p>
      <a href="/" class="link-back">Share a secret instead</a>
    </div>
  `;
}

// The OTP form is never fetched/rendered automatically beyond checking existence above
// — the actual retrieval endpoint (which claims the one-time view) is only ever called
// from an explicit click below. That's both clearer for the person viewing it and a
// real defense against email security gateways that silently prefetch links.
function renderOtpForm(root: HTMLElement, id: string, fragmentKey: Uint8Array): void {
  root.innerHTML = `
    ${renderBrand(true)}
    <div class="card">
      <h1>Check your email</h1>
      <p class="muted">Enter the access code we emailed you.</p>
      <input id="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="123456" autofocus />
      <button id="unlock" class="primary">Unlock</button>
      <p id="error" class="error" role="alert"></p>
      <button type="button" id="resend" class="link-button">Didn't get a code? Resend</button>
      <p id="resend-note" class="hint hidden"></p>
    </div>
  `;

  const codeInput = root.querySelector<HTMLInputElement>("#code")!;
  const button = root.querySelector<HTMLButtonElement>("#unlock")!;
  const errorEl = root.querySelector<HTMLElement>("#error")!;
  const resendButton = root.querySelector<HTMLButtonElement>("#resend")!;
  const resendNote = root.querySelector<HTMLElement>("#resend-note")!;

  async function attempt(): Promise<void> {
    button.disabled = true;
    button.textContent = "Unlocking...";
    errorEl.textContent = "";
    try {
      const { ciphertext, iv } = await verifyOtp(id, codeInput.value.trim());
      const plaintext = await decrypt(fromBase64Url(ciphertext), fromBase64Url(iv), fragmentKey);
      showSecret(root, id, plaintext);
    } catch (err) {
      errorEl.textContent = describeError(err);
      button.disabled = false;
      button.textContent = "Unlock";
      codeInput.value = "";
      codeInput.focus();
    }
  }

  button.addEventListener("click", attempt);
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attempt();
  });

  resendButton.addEventListener("click", async () => {
    resendButton.disabled = true;
    resendNote.classList.add("hidden");
    errorEl.textContent = "";
    try {
      await resendOtp(id);
      resendNote.textContent = "A new code has been sent — use it in place of the earlier one.";
      resendNote.classList.remove("hidden");
      codeInput.value = "";
      codeInput.focus();
    } catch (err) {
      errorEl.textContent = describeError(err);
    } finally {
      resendButton.disabled = false;
    }
  });
}

function showSecret(root: HTMLElement, id: string, plaintext: string): void {
  const file = decodeFilePayload(plaintext);
  if (file) {
    const url = URL.createObjectURL(new Blob([fromBase64Url(file.data) as BlobPart], { type: file.mimeType }));
    root.innerHTML = `
      ${renderBrand(true)}
      <div class="card">
        <h1>Here's the file</h1>
        <p class="muted">This has been destroyed and cannot be viewed again — download it now.</p>
        <a href="${url}" download="${escapeHtml(file.filename)}" class="primary">Download ${escapeHtml(file.filename)}</a>
      </div>
    `;
  } else {
    root.innerHTML = `
      ${renderBrand(true)}
      <div class="card">
        <h1>Here's the secret</h1>
        <p class="muted">This has been destroyed and cannot be viewed again — copy it now.</p>
        <textarea id="secret-out" rows="5" readonly>${escapeHtml(plaintext)}</textarea>
        <button id="copy" class="primary">Copy</button>
        <p id="copied" class="hint hidden">Copied to clipboard.</p>
      </div>
    `;
    root.querySelector<HTMLButtonElement>("#copy")!.addEventListener("click", async () => {
      await navigator.clipboard.writeText(plaintext);
      root.querySelector<HTMLElement>("#copied")!.classList.remove("hidden");
    });
  }
  // Best-effort immediate burn; the server-side grace-window TTL is the backstop
  // if this call never lands (tab closed, offline, etc).
  confirmBurn(id).catch(() => {});
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "not_found":
      case "expired_or_viewed":
        return "This secret has already been viewed, or the link has expired.";
      case "otp_expired":
        return "The access code expired. Click \"Resend\" below to get a new one.";
      case "invalid_code":
        return err.attemptsRemaining !== undefined
          ? `Incorrect code. ${err.attemptsRemaining} attempt(s) left.`
          : "Incorrect code.";
      case "too_many_attempts":
        return "Too many incorrect attempts. This secret has been destroyed.";
      case "too_many_resends":
        return "This secret has already had a code resent the maximum number of times.";
      case "resend_cooldown":
        return "Please wait a bit before requesting another code.";
    }
  }
  return "Could not decrypt the secret. The link may be incomplete or corrupted.";
}
