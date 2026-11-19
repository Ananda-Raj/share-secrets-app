import { test } from "node:test";
import assert from "node:assert/strict";
import { hashOtp, verifyOtp } from "../src/lib/otp.js";

test("verifyOtp accepts the correct code", () => {
  const { hash, salt } = hashOtp("123456");
  assert.equal(verifyOtp("123456", hash, salt), true);
});

test("verifyOtp rejects an incorrect code", () => {
  const { hash, salt } = hashOtp("123456");
  assert.equal(verifyOtp("000000", hash, salt), false);
});

test("hashOtp salts each hash independently", () => {
  const a = hashOtp("123456");
  const b = hashOtp("123456");
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.salt, b.salt);
});
