import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateRange } from "../src/lib/dateRange.js";
import { ValidationError } from "../src/lib/validation.js";

test("parseDateRange defaults to the last 30 days when no query is given", () => {
  const now = Math.floor(Date.now() / 1000);
  const { from, to } = parseDateRange(null);
  assert.ok(to - from === 30 * 24 * 60 * 60);
  assert.ok(Math.abs(to - now) < 5);
});

test("parseDateRange uses the provided range", () => {
  assert.deepEqual(parseDateRange({ from: "100", to: "200" }), { from: 100, to: 200 });
});

test("parseDateRange rejects a range where from is after to", () => {
  assert.throws(() => parseDateRange({ from: "200", to: "100" }), ValidationError);
});

test("parseDateRange rejects non-numeric values", () => {
  assert.throws(() => parseDateRange({ from: "not-a-number", to: "200" }), ValidationError);
});
