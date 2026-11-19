import { logout } from "./auth.js";
import { getMe } from "./api.js";
import { currentBranding, logoSrc } from "./branding.js";
import { escapeHtml } from "./html.js";

/** Logo + name (admin-configurable), shown on every page -- the masthead for pages
 * with no nav (unlock/result) and the leading element of .nav on authenticated pages.
 * Pass standalone=true when it's not inside .nav, so it gets its own row width/margin. */
export function renderBrand(standalone = false): string {
  const b = currentBranding();
  return `
    <a href="/" class="brand${standalone ? " brand-standalone" : ""}">
      <img class="brand-logo" src="${escapeHtml(logoSrc(b))}" alt="" height="28" />
      <span class="brand-name">${escapeHtml(b.appName)}</span>
    </a>
  `;
}

/** Shared nav for the three authenticated pages. Renders immediately, without waiting
 * on the role check -- the Admin link (admins only) is injected by wireNav once that
 * resolves, so the role check never delays first paint. */
export function renderNav(active: "create" | "history" | "admin"): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}" class="nav-link${key === active ? " active" : ""}">${label}</a>`;

  return `
    <nav class="nav">
      ${renderBrand()}
      ${link("/", "Share", "create")}
      ${link("/history", "My history", "history")}
      <span id="admin-nav-slot"></span>
      <button type="button" id="logout" class="nav-link nav-logout">Log out</button>
    </nav>
  `;
}

export function wireNav(root: ParentNode, active: "create" | "history" | "admin"): void {
  root.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click", () => logout());

  getMe()
    .then((me) => {
      if (me.role !== "admin") return;
      const slot = root.querySelector("#admin-nav-slot");
      if (slot) slot.outerHTML = `<a href="/admin" class="nav-link${active === "admin" ? " active" : ""}">Admin</a>`;
    })
    .catch(() => {}); // fail closed -- link just stays hidden
}
