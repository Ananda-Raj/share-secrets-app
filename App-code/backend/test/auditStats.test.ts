import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateTopSenders } from "../src/lib/auditStats.js";
import type { AuditRecord } from "../src/lib/audit.js";

function record(senderEmail: string): AuditRecord {
  return {
    secretId: "id",
    senderEmail,
    recipientEmail: "r@example.com",
    description: "test",
    mode: "email-otp",
    isFile: false,
    createdAt: 0,
    secretExpiresAt: 0,
    expiresAt: 0,
  };
}

test("aggregateTopSenders counts and sorts descending", () => {
  const records = [record("a@x.com"), record("b@x.com"), record("a@x.com"), record("a@x.com"), record("b@x.com")];
  assert.deepEqual(aggregateTopSenders(records), [
    { senderEmail: "a@x.com", count: 3 },
    { senderEmail: "b@x.com", count: 2 },
  ]);
});

test("aggregateTopSenders returns an empty array for no records", () => {
  assert.deepEqual(aggregateTopSenders([]), []);
});

test("aggregateTopSenders treats a single sender correctly", () => {
  assert.deepEqual(aggregateTopSenders([record("solo@x.com")]), [{ senderEmail: "solo@x.com", count: 1 }]);
});
