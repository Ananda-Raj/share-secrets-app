import { escapeHtml } from "../html.js";
import { renderBrand } from "../components.js";

export interface SendResult {
  recipientEmail: string;
  link?: string; // set when sent
  error?: string; // set when not sent
}

/** The links exist only here: built in this browser from keys that are never stored. */
export function renderResultPage(root: HTMLElement, results: SendResult[]): void {
  const sent = results.filter((r) => r.link);
  const failed = results.filter((r) => r.error);

  root.innerHTML = `
    ${renderBrand(true)}
    <div class="card">
      <h1>${failed.length ? `Sent to ${sent.length} of ${results.length}` : "Sent"}</h1>
      <p class="muted">${
        sent.length === 1
          ? `A one-time link and access code were emailed to <strong>${escapeHtml(sent[0].recipientEmail)}</strong>.`
          : `Each of the ${sent.length} recipients was emailed their own one-time link and access code.`
      }</p>

      ${
        failed.length
          ? `<p class="error">Not sent:</p>
      <ul class="send-failures">
        ${failed.map((r) => `<li><strong>${escapeHtml(r.recipientEmail)}</strong>: ${escapeHtml(r.error!)}</li>`).join("")}
      </ul>`
          : ""
      }

      <h2>Share the link another way</h2>
      <p class="muted small">If they'd rather get it in chat, send the link there too. The access code only goes to
        their email, so the link alone can't open the secret. Copy it now: links aren't stored, so they can't be shown again.</p>
      ${sent
        .map(
          (r, i) => `
      <label for="link-${i}">${escapeHtml(r.recipientEmail)}</label>
      <div class="link-box">
        <input id="link-${i}" type="text" readonly value="${escapeHtml(r.link!)}" />
        <button type="button" class="primary" data-copy="link-${i}">Copy</button>
      </div>`
        )
        .join("")}
      <p id="copy-error" class="hint hidden">Couldn't copy automatically. The link is selected, so copy it from there.</p>

      <a href="/" class="link-back">Share another secret</a>
    </div>
  `;

  const copyError = root.querySelector<HTMLElement>("#copy-error")!;
  root.querySelectorAll<HTMLInputElement>(".link-box input").forEach((input) => {
    input.addEventListener("click", () => input.select());
  });
  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = root.querySelector<HTMLInputElement>(`#${button.dataset.copy}`)!;
      try {
        await navigator.clipboard.writeText(input.value);
        copyError.classList.add("hidden");
        button.textContent = "Copied";
        setTimeout(() => (button.textContent = "Copy"), 2000);
      } catch {
        input.focus();
        input.select();
        copyError.classList.remove("hidden");
      }
    });
  });
}
