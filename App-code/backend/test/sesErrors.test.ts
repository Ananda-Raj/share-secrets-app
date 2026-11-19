import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecipientRejected } from "../src/lib/sesErrors.js";

test("isRecipientRejected spots SES refusing the address", () => {
  const rejected = Object.assign(new Error("Email address is not verified."), { name: "MessageRejected" });
  assert.equal(isRecipientRejected(rejected), true);
});

test("isRecipientRejected ignores other failures", () => {
  const denied = Object.assign(new Error("not authorized"), { name: "AccessDeniedException" });
  assert.equal(isRecipientRejected(denied), false);
  assert.equal(isRecipientRejected(new Error("timeout")), false);
  assert.equal(isRecipientRejected(null), false);
  assert.equal(isRecipientRejected("MessageRejected"), false);
});
