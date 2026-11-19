import { getBranding, type Branding } from "./api.js";

// Admin-set name, logo, color and footer. Cached so repeat visits paint branded at once.

const CACHE_KEY = "branding.v1";
const DEFAULT_LOGO = "/favicon.svg";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_BRANDING: Branding = {
  appName: "SecretShare",
  logoDataUrl: "",
  accentColor: "",
  supportEmail: "",
  footerText: "",
};

let current: Branding = readCache() ?? DEFAULT_BRANDING;

export function currentBranding(): Branding {
  return current;
}

export function logoSrc(b: Branding = current): string {
  return b.logoDataUrl.startsWith("data:image/") ? b.logoDataUrl : DEFAULT_LOGO;
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

  document.querySelectorAll<HTMLImageElement>(".brand-logo").forEach((img) => (img.src = logoSrc(b)));
  document.querySelectorAll<HTMLElement>(".brand-name").forEach((el) => (el.textContent = b.appName));

  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    icon.removeAttribute("type");
    icon.href = logoSrc(b);
  }

  applyAccent(b.accentColor);
  renderFooter(b);
}

const ACCENT_VARS = ["--primary", "--primary-hover", "--primary-text", "--focus-ring"];

function applyAccent(hex: string): void {
  const style = document.documentElement.style;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    ACCENT_VARS.forEach((v) => style.removeProperty(v));
    return;
  }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  style.setProperty("--primary", hex);
  style.setProperty("--primary-hover", toHex(r * 0.85, g * 0.85, b * 0.85));
  style.setProperty("--primary-text", prefersDarkText(r, g, b) ? "#111111" : "#ffffff");
  style.setProperty("--focus-ring", `rgba(${r}, ${g}, ${b}, 0.35)`);
}

function toHex(...channels: number[]): string {
  return "#" + channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

// Picks whichever text color has more contrast against the accent (WCAG luminance).
function prefersDarkText(r: number, g: number, b: number): boolean {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05);
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
