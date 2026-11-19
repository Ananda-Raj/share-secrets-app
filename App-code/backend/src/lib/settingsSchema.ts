import { ValidationError } from "./validation.js";

// Admin-editable settings. Pure functions only, so this file is unit-testable without AWS.

export const THEMES = ["obsidian", "midnight", "racing", "heritage"] as const;
export type Theme = (typeof THEMES)[number];

export interface Branding {
  appName: string;
  logoDataUrl: string; // "" = default logo
  theme: Theme;
  supportEmail: string; // "" = none
  footerText: string; // "" = none
}

export interface SharingPolicy {
  allowedSenderDomains: string[]; // empty = any signed-in user
  allowedRecipientDomains: string[]; // empty = any address
  maxTtlSeconds: number;
  defaultTtlSeconds: number;
  fileSharingEnabled: boolean;
}

export interface Reports {
  monthlySummary: boolean; // email admins on the 1st of each month
}

export interface AppSettings {
  branding: Branding;
  policy: SharingPolicy;
  reports: Reports;
}

// Must match the frontend's lifetime options.
export const TTL_CHOICES = [600, 3600, 86400, 259200, 604800];

export const SETTINGS_LIMITS = {
  MAX_APP_NAME_LEN: 60,
  MAX_FOOTER_LEN: 200,
  // ~100 KB image once base64-encoded; keeps the item well under DynamoDB's 400 KB.
  MAX_LOGO_DATA_URL_LEN: 140_000,
  MAX_DOMAINS: 50,
};

export const DEFAULT_SETTINGS: AppSettings = {
  branding: {
    appName: "SecretShare",
    logoDataUrl: "",
    theme: "obsidian",
    supportEmail: "",
    footerText: "",
  },
  policy: {
    allowedSenderDomains: [],
    allowedRecipientDomains: [],
    maxTtlSeconds: 604800,
    defaultTtlSeconds: 86400,
    fileSharingEnabled: true,
  },
  reports: {
    monthlySummary: false,
  },
};

const CONTROL_CHARS_RE = /[\r\n\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// No SVG: an SVG is a document, and a raster image is all a logo needs.
const LOGO_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function plainText(value: unknown, field: string, maxLen: number, required: boolean): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new ValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (required && trimmed.length === 0) throw new ValidationError(`${field} is required`);
  if (trimmed.length > maxLen) throw new ValidationError(`${field} is too long (max ${maxLen})`);
  if (CONTROL_CHARS_RE.test(trimmed)) throw new ValidationError(`${field} contains invalid characters`);
  return trimmed;
}

export function validateBranding(input: unknown): Branding {
  if (typeof input !== "object" || input === null) throw new ValidationError("branding must be an object");
  const b = input as Record<string, unknown>;

  const appName = plainText(b.appName, "appName", SETTINGS_LIMITS.MAX_APP_NAME_LEN, true);
  const footerText = plainText(b.footerText, "footerText", SETTINGS_LIMITS.MAX_FOOTER_LEN, false);

  const supportEmail = plainText(b.supportEmail, "supportEmail", 254, false);
  if (supportEmail && !EMAIL_RE.test(supportEmail)) throw new ValidationError("supportEmail is invalid");

  const theme = b.theme === undefined || b.theme === "" ? DEFAULT_SETTINGS.branding.theme : b.theme;
  if (!isTheme(theme)) throw new ValidationError(`theme must be one of: ${THEMES.join(", ")}`);

  const logoDataUrl = typeof b.logoDataUrl === "string" ? b.logoDataUrl : "";
  if (logoDataUrl) {
    if (logoDataUrl.length > SETTINGS_LIMITS.MAX_LOGO_DATA_URL_LEN) throw new ValidationError("logo is too large (max 100 KB)");
    if (!LOGO_RE.test(logoDataUrl)) throw new ValidationError("logo must be a PNG, JPEG, WebP or GIF image");
  }

  return { appName, logoDataUrl, theme, supportEmail, footerText };
}

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** Accepts a list or a comma/space/newline-separated string; "@acme.com" works too. */
export function parseDomainList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : null;
  if (raw === null) throw new ValidationError(`${field} must be a list of domains`);

  const domains = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") throw new ValidationError(`${field} must be a list of domains`);
    const domain = item.trim().toLowerCase().replace(/^@/, "");
    if (!domain) continue;
    if (!DOMAIN_RE.test(domain)) throw new ValidationError(`${field}: "${domain}" is not a valid domain`);
    domains.add(domain);
  }
  if (domains.size > SETTINGS_LIMITS.MAX_DOMAINS) {
    throw new ValidationError(`${field}: at most ${SETTINGS_LIMITS.MAX_DOMAINS} domains`);
  }
  return [...domains];
}

export function validatePolicy(input: unknown): SharingPolicy {
  if (typeof input !== "object" || input === null) throw new ValidationError("policy must be an object");
  const p = input as Record<string, unknown>;

  const maxTtlSeconds = Number(p.maxTtlSeconds);
  const defaultTtlSeconds = Number(p.defaultTtlSeconds);
  if (!TTL_CHOICES.includes(maxTtlSeconds)) throw new ValidationError("maxTtlSeconds is not an allowed value");
  if (!TTL_CHOICES.includes(defaultTtlSeconds)) throw new ValidationError("defaultTtlSeconds is not an allowed value");
  if (defaultTtlSeconds > maxTtlSeconds) {
    throw new ValidationError("The default lifetime can't be longer than the maximum");
  }
  if (typeof p.fileSharingEnabled !== "boolean") throw new ValidationError("fileSharingEnabled must be true or false");

  return {
    allowedSenderDomains: parseDomainList(p.allowedSenderDomains, "allowedSenderDomains"),
    allowedRecipientDomains: parseDomainList(p.allowedRecipientDomains, "allowedRecipientDomains"),
    maxTtlSeconds,
    defaultTtlSeconds,
    fileSharingEnabled: p.fileSharingEnabled,
  };
}

export function validateReports(input: unknown): Reports {
  if (typeof input !== "object" || input === null) throw new ValidationError("reports must be an object");
  const r = input as Record<string, unknown>;
  if (typeof r.monthlySummary !== "boolean") throw new ValidationError("monthlySummary must be true or false");
  return { monthlySummary: r.monthlySummary };
}

/** Empty list allows everything. A domain also covers its subdomains. */
export function emailMatchesDomains(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const host = email.slice(at + 1).toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Fills in anything missing from a stored item, so older items keep working. */
export function withDefaults(
  stored: Partial<{ branding: Partial<Branding>; policy: Partial<SharingPolicy>; reports: Partial<Reports> }> | undefined
): AppSettings {
  // Known fields only, so ones from older versions (like accentColor) are dropped.
  const b = { ...DEFAULT_SETTINGS.branding, ...(stored?.branding ?? {}) };
  return {
    branding: {
      appName: b.appName,
      logoDataUrl: b.logoDataUrl,
      theme: isTheme(b.theme) ? b.theme : DEFAULT_SETTINGS.branding.theme,
      supportEmail: b.supportEmail,
      footerText: b.footerText,
    },
    policy: { ...DEFAULT_SETTINGS.policy, ...(stored?.policy ?? {}) },
    reports: { ...DEFAULT_SETTINGS.reports, ...(stored?.reports ?? {}) },
  };
}

/** RFC 2047 encoded display name, safe for any characters: "Name" <addr>. */
export function formatFromAddress(displayName: string, address: string): string {
  if (!displayName) return address;
  const encoded = Buffer.from(displayName, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?= <${address}>`;
}
