import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSecretId, generateOtp } from "../src/lib/ids.js";

test("generateSecretId returns distinct, URL-safe, high-entropy ids", () => {
  const a = generateSecretId();
  const b = generateSecretId();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{20,24}$/);
});

test("generateOtp returns a zero-padded 6-digit code", () => {
  for (let i = 0; i < 25; i++) {
    assert.match(generateOtp(), /^\d{6}$/);
  }
});
