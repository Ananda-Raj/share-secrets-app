import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertValidTtl,
  assertNonEmptyB64,
  assertValidEmail,
  sanitizeSubject,
  sanitizeDescription,
  assertValidIdpName,
  assertValidIssuerUrl,
  assertNonEmptyString,
  parseJsonBody,
  LIMITS,
  ValidationError,
} from "../src/lib/validation.js";

test("assertValidTtl clamps below the minimum", () => {
  assert.equal(assertValidTtl(1), LIMITS.MIN_TTL_SECONDS);
});

test("assertValidTtl clamps above the maximum", () => {
  assert.equal(assertValidTtl(999_999_999), LIMITS.MAX_TTL_SECONDS);
});

test("assertValidTtl rejects non-numbers", () => {
  assert.throws(() => assertValidTtl("1day"), ValidationError);
});

test("assertNonEmptyB64 rejects oversized input", () => {
  assert.throws(() => assertNonEmptyB64("A".repeat(100), "ciphertext", 10), ValidationError);
});

test("assertNonEmptyB64 rejects invalid characters", () => {
  assert.throws(() => assertNonEmptyB64("not base64!!", "iv", 100), ValidationError);
});

test("assertNonEmptyB64 accepts a well-formed value", () => {
  assert.equal(assertNonEmptyB64("QUJDRA==", "iv", 100), "QUJDRA==");
});

test("assertValidEmail accepts a normal address", () => {
  assert.equal(assertValidEmail("user@example.com"), "user@example.com");
});

test("assertValidEmail rejects garbage", () => {
  assert.throws(() => assertValidEmail("not-an-email"), ValidationError);
});

test("parseJsonBody parses a well-formed body", () => {
  assert.deepEqual(parseJsonBody('{"code":"123456"}'), { code: "123456" });
});

test("parseJsonBody treats a missing body as an empty object", () => {
  assert.deepEqual(parseJsonBody(undefined), {});
  assert.deepEqual(parseJsonBody(null), {});
});

test("parseJsonBody rejects malformed JSON instead of throwing a raw SyntaxError", () => {
  assert.throws(() => parseJsonBody("{not json"), ValidationError);
});

test("sanitizeSubject rejects absent/blank input", () => {
  assert.throws(() => sanitizeSubject(undefined), ValidationError);
  assert.throws(() => sanitizeSubject(null), ValidationError);
  assert.throws(() => sanitizeSubject("   "), ValidationError);
});

test("sanitizeSubject trims and accepts a normal subject", () => {
  assert.equal(sanitizeSubject("  Here's your access  "), "Here's your access");
});

test("sanitizeSubject rejects a non-string", () => {
  assert.throws(() => sanitizeSubject(123), ValidationError);
});

test("sanitizeSubject rejects an oversized subject", () => {
  assert.throws(() => sanitizeSubject("a".repeat(LIMITS.MAX_SUBJECT_LEN + 1)), ValidationError);
});

test("sanitizeSubject rejects control characters", () => {
  assert.throws(() => sanitizeSubject("Subject\r\nBcc: evil@example.com"), ValidationError);
});

test("sanitizeDescription rejects absent/blank input", () => {
  assert.throws(() => sanitizeDescription(undefined), ValidationError);
  assert.throws(() => sanitizeDescription(null), ValidationError);
  assert.throws(() => sanitizeDescription("   "), ValidationError);
});

test("sanitizeDescription trims and accepts a normal description", () => {
  assert.equal(sanitizeDescription("  AWS prod DB password  "), "AWS prod DB password");
});

test("sanitizeDescription rejects a non-string", () => {
  assert.throws(() => sanitizeDescription(123), ValidationError);
});

test("sanitizeDescription rejects an oversized description", () => {
  assert.throws(() => sanitizeDescription("a".repeat(LIMITS.MAX_DESCRIPTION_LEN + 1)), ValidationError);
});

test("sanitizeDescription rejects control characters", () => {
  assert.throws(() => sanitizeDescription("desc\r\nwith injected newline"), ValidationError);
});

test("assertValidIdpName accepts a normal name", () => {
  assert.equal(assertValidIdpName("EntraID"), "EntraID");
});

test("assertValidIdpName rejects spaces and punctuation", () => {
  assert.throws(() => assertValidIdpName("Entra ID!"), ValidationError);
});

test("assertValidIdpName rejects an oversized name", () => {
  assert.throws(() => assertValidIdpName("a".repeat(33)), ValidationError);
});

test("assertValidIssuerUrl accepts a valid https URL", () => {
  const url = "https://login.microsoftonline.com/tenant-id/v2.0";
  assert.equal(assertValidIssuerUrl(url), url);
});

test("assertValidIssuerUrl rejects http (non-TLS)", () => {
  assert.throws(() => assertValidIssuerUrl("http://example.com"), ValidationError);
});

test("assertValidIssuerUrl rejects a malformed URL", () => {
  assert.throws(() => assertValidIssuerUrl("not a url"), ValidationError);
});

test("assertNonEmptyString accepts a normal value", () => {
  assert.equal(assertNonEmptyString("abc123", "clientId", 256), "abc123");
});

test("assertNonEmptyString rejects blank/whitespace-only input", () => {
  assert.throws(() => assertNonEmptyString("   ", "clientId", 256), ValidationError);
});

test("assertNonEmptyString rejects an oversized value", () => {
  assert.throws(() => assertNonEmptyString("a".repeat(300), "clientId", 256), ValidationError);
});
