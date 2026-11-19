import { getBranding, type Branding, type Theme } from "./api.js";

// Admin-set name, logo, theme and footer. Cached so repeat visits paint branded at once.

const CACHE_KEY = "branding.v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Colors live in style.css under [data-theme="..."].
export const THEMES: { id: Theme; name: string; description: string }[] = [
  { id: "obsidian", name: "Obsidian", description: "Black, brushed gold and crimson" },
  { id: "midnight", name: "Midnight", description: "Navy, ice blue and sapphire" },
  { id: "racing", name: "Racing green", description: "Forest black, champagne and green" },
  { id: "heritage", name: "Heritage", description: "Graphite, powder blue and orange" },
];

export const DEFAULT_BRANDING: Branding = {
  appName: "SecretShare",
  logoDataUrl: "",
  theme: "obsidian",
  supportEmail: "",
  footerText: "",
};

function themeOf(b: Branding): Theme {
  return THEMES.some((t) => t.id === b.theme) ? b.theme : DEFAULT_BRANDING.theme;
}

let current: Branding = readCache() ?? DEFAULT_BRANDING;

export function currentBranding(): Branding {
  return current;
}

export function logoSrc(b: Branding = current): string {
  return b.logoDataUrl.startsWith("data:image/") ? b.logoDataUrl : `/logos/${themeOf(b)}.svg`;
}

/** Paints from cache right away, then refreshes from the server. */
export async function initBranding(): Promise<void> {
  applyBranding(current);
  try {
    applyBranding({ ...DEFAULT_BRANDING, ...(await getBranding()) });
  } catch {
    // keep whatever is showing
  }
}

export function applyBranding(b: Branding): void {
  current = b;
  writeCache(b);
  document.title = b.appName;
  document.documentElement.dataset.theme = themeOf(b);
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);

  document.querySelectorAll<HTMLImageElement>(".brand-logo").forEach((img) => (img.src = logoSrc(b)));
  document.querySelectorAll<HTMLElement>(".brand-name").forEach((el) => (el.textContent = b.appName));

  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.removeAttribute("type");
    icon.href = logoSrc(b);
  }

  renderFooter(b);
}

function renderFooter(b: Branding): void {
  const footer = document.querySelector<HTMLElement>("#site-footer");
  if (!footer) return;
  footer.replaceChildren();

  if (b.footerText) {
    const note = document.createElement("span");
    note.textContent = b.footerText;
    footer.append(note);
  }
  if (b.supportEmail && EMAIL_RE.test(b.supportEmail)) {
    const help = document.createElement("span");
    const link = document.createElement("a");
    link.href = `mailto:${b.supportEmail}`;
    link.textContent = b.supportEmail;
    help.append("Need help? ", link);
    footer.append(help);
  }
  footer.classList.toggle("hidden", footer.childElementCount === 0);
}

function readCache(): Branding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_BRANDING, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function writeCache(b: Branding): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    // storage full or blocked; branding still works without the cache
  }
}
