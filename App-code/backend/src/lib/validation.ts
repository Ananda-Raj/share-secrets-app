export const LIMITS = {
  MIN_TTL_SECONDS: 5 * 60, // 5 minutes
  MAX_TTL_SECONDS: 7 * 24 * 60 * 60, // 7 days
  // 280,000 chars covers a 150KB file (base64'd twice -- once into the file envelope,
  // once for transport -- plus AES-GCM's tag) with room to spare under DynamoDB's
  // 400KB item limit, the real ceiling here.
  MAX_CIPHERTEXT_B64_LEN: 280_000,
  MAX_IV_B64_LEN: 64,
  MAX_SALT_B64_LEN: 64,
  MAX_K1_B64_LEN: 64,
  MAX_SUBJECT_LEN: 200,
  MAX_DESCRIPTION_LEN: 200,
};

export class ValidationError extends Error {}

/** JSON.parse, but a malformed body becomes a 400 (ValidationError) instead of an
 * uncaught exception that would otherwise fall through to a generic 500. */
export function parseJsonBody(body: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new ValidationError("Malformed JSON body");
  }
}

/** Clamps (rather than rejects) out-of-range TTLs so a bad client value can't create an unexpirable secret. */
export function assertValidTtl(ttlSeconds: unknown): number {
  if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds)) {
    throw new ValidationError("ttlSeconds must be a number");
  }
  return Math.min(Math.max(ttlSeconds, LIMITS.MIN_TTL_SECONDS), LIMITS.MAX_TTL_SECONDS);
}

const B64_RE = /^[A-Za-z0-9+/_=-]+$/;

export function assertNonEmptyB64(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen || !B64_RE.test(value)) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertValidEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !EMAIL_RE.test(value)) {
    throw new ValidationError("recipientEmail is invalid");
  }
  return value;
}

// Rejects newlines/control characters defensively — the AWS SDK's structured
// Subject.Data field isn't raw-header text so header injection isn't really reachable
// this way, but there's no reason a subject line (or a description) should ever
// contain them anyway.
const CONTROL_CHARS_RE = /[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Shared shape for a required, plain-text, length-capped field. */
function sanitizeFreeText(value: unknown, fieldName: string, maxLen: number): string {
  if (typeof value !== "string") throw new ValidationError(`${fieldName} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`${fieldName} is required`);
  if (trimmed.length > maxLen) throw new ValidationError(`${fieldName} is too long`);
  if (CONTROL_CHARS_RE.test(trimmed)) throw new ValidationError(`${fieldName} contains invalid characters`);
  return trimmed;
}

export function sanitizeSubject(value: unknown): string {
  return sanitizeFreeText(value, "subject", LIMITS.MAX_SUBJECT_LEN);
}

/** Plaintext, server-visible label for what a secret is about (e.g. "AWS prod DB
 * password") — never encrypted, never shown to the receiver, same trust level as
 * subject. */
export function sanitizeDescription(value: unknown): string {
  return sanitizeFreeText(value, "description", LIMITS.MAX_DESCRIPTION_LEN);
}

/** Cognito identity provider names allow a fairly wide character set, but this app only
 * ever needs to round-trip its own generated names (or an admin's short label) through
 * URLs and the frontend's VITE_COGNITO_IDP_NAME — kept to a conservative, unambiguous
 * subset instead of matching Cognito's full allowance. */
const IDP_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function assertValidIdpName(value: unknown): string {
  if (typeof value !== "string" || !IDP_NAME_RE.test(value)) {
    throw new ValidationError("idpName must be 1-32 characters: letters, digits, underscore, hyphen");
  }
  return value;
}

/** Cognito's OIDC identity provider only ever calls out to this over HTTPS -- rejecting
 * anything else here is a real security boundary, not just tidiness. */
export function assertValidIssuerUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) {
    throw new ValidationError("issuerUrl is invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ValidationError("issuerUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new ValidationError("issuerUrl must use https");
  }
  return value;
}

/** Client id/secret from a third-party IdP -- opaque strings with no fixed format
 * across providers, so this only guards against empty values and pathological length. */
export function assertNonEmptyString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLen) {
    throw new ValidationError(`${field} is required`);
  }
  return value;
}
