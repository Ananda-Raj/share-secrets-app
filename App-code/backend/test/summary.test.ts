import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, previousMonth, last30Days, summaryEmail } from "../src/lib/summary.js";
import type { AuditRecord } from "../src/lib/audit.js";

const NOW = 1_800_000_000;

function rec(overrides: Partial<AuditRecord>): AuditRecord {
  return {
    secretId: "id",
    senderEmail: "a@example.com",
    recipientEmail: "r@example.com",
    description: "d",
    mode: "email-otp",
    isFile: false,
    createdAt: NOW - 1000,
    secretExpiresAt: NOW + 1000,
    expiresAt: NOW + 1000,
    ...overrides,
  };
}

test("summarize counts each status once", () => {
  const s = summarize(
    [
      rec({ claimedAt: NOW - 10 }),
      rec({ claimedAt: NOW - 10, confirmedAt: NOW - 5, isFile: true }),
      rec({ revokedAt: NOW - 10, senderEmail: "b@example.com" }),
      rec({ secretExpiresAt: NOW - 1 }),
      rec({}),
    ],
    NOW
  );
  assert.deepEqual(
    { sent: s.sent, files: s.files, opened: s.opened, revoked: s.revoked, expired: s.expired, waiting: s.waiting, senders: s.senders },
    { sent: 5, files: 1, opened: 2, revoked: 1, expired: 1, waiting: 1, senders: 2 }
  );
  assert.deepEqual(s.topSenders[0], { senderEmail: "a@example.com", count: 4 });
});

test("summarize leaves out shares whose email was never sent", () => {
  const s = summarize([rec({}), rec({ failedAt: NOW - 10, senderEmail: "b@example.com" })], NOW);
  assert.equal(s.sent, 1);
  assert.equal(s.waiting, 1);
  assert.equal(s.senders, 1);
});

test("summarize keeps only the top 5 senders", () => {
  const records = ["a", "b", "c", "d", "e", "f"].map((x) => rec({ senderEmail: `${x}@example.com` }));
  const s = summarize(records, NOW);
  assert.equal(s.senders, 6);
  assert.equal(s.topSenders.length, 5);
});

test("previousMonth covers the whole previous UTC month", () => {
  const p = previousMonth(new Date(Date.UTC(2026, 11, 1, 8)));
  assert.equal(p.label, "November 2026");
  assert.equal(p.from, Date.UTC(2026, 10, 1) / 1000);
  assert.equal(p.to, Date.UTC(2026, 11, 1) / 1000 - 1);
});

test("previousMonth wraps from January to December", () => {
  const p = previousMonth(new Date(Date.UTC(2027, 0, 1, 8)));
  assert.equal(p.label, "December 2026");
  assert.equal(p.from, Date.UTC(2026, 11, 1) / 1000);
});

test("last30Days ends now", () => {
  const p = last30Days(new Date(NOW * 1000));
  assert.equal(p.to, NOW);
  assert.equal(p.to - p.from, 30 * 86400);
});

test("summaryEmail shows counts, never recipients", () => {
  const s = summarize([rec({ claimedAt: NOW - 10 })], NOW);
  const { subject, text } = summaryEmail(s, previousMonth(new Date(Date.UTC(2026, 11, 1))), "Acme", "https://x.example/admin", false);
  assert.equal(subject, "Acme activity for November 2026");
  assert.match(text, /Secrets sent: 1\n/);
  assert.match(text, /a@example\.com/);
  assert.doesNotMatch(text, /r@example\.com/);
  assert.match(text, /https:\/\/x\.example\/admin/);
});

test("summaryEmail handles a quiet period and marks previews", () => {
  const { subject, text } = summaryEmail(summarize([], NOW), last30Days(new Date()), "Acme", "https://x.example/admin", true);
  assert.equal(subject, "Preview: Acme activity for the last 30 days");
  assert.match(text, /No secrets were sent\./);
  assert.match(text, /This is a preview/);
});
