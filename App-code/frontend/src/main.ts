import "./style.css";
import { renderCreatePage } from "./pages/create.js";
import { renderUnlockPage } from "./pages/unlock.js";
import { renderHistoryPage } from "./pages/history.js";
import { renderAdminPage } from "./pages/admin.js";
import { handleLoginCallback, isLoggedIn } from "./auth.js";
import { initBranding } from "./branding.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root element");

const unlockMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{10,32})$/);

async function route(): Promise<void> {
  if (window.location.pathname === "/callback") {
    try {
      await handleLoginCallback();
      window.location.replace("/");
    } catch (err) {
      // A duplicate/prefetched hit on this one-time callback URL (the state/verifier it
      // checks are deleted on first read, win or lose) can fail this exact check even
      // though an earlier, real run of it already signed the user in. If a session
      // already exists by now, that's success, not failure -- don't scare them with an
      // error for something that already worked.
      if (isLoggedIn()) {
        window.location.replace("/");
        return;
      }
      app!.innerHTML = `<div class="card"><h1>Sign-in failed</h1><p class="error">${
        err instanceof Error ? err.message : "Something went wrong."
      }</p><a href="/" class="link-back">Back to start</a></div>`;
    }
    return;
  }

  if (unlockMatch) {
    await renderUnlockPage(app!, unlockMatch[1]);
    return;
  }

  if (window.location.pathname === "/history") {
    await renderHistoryPage(app!);
    return;
  }

  if (window.location.pathname === "/admin") {
    await renderAdminPage(app!);
    return;
  }

  await renderCreatePage(app!);
}

initBranding();
route();
