import { test } from "node:test";
import assert from "node:assert/strict";
import { roleChangeProblem } from "../src/lib/rolePolicy.js";
import { requireRecentSignIn, ReauthRequiredError, RECENT_SIGN_IN_SECONDS } from "../src/lib/auth.js";
import type { ApiEvent } from "../src/types.js";

const admins = new Set(["boss@acme.com", "second@acme.com"]);

test("roleChangeProblem blocks changing your own role, in any letter case", () => {
  assert.equal(roleChangeProblem("Boss@Acme.com", "boss@acme.com", false, admins), "cannot_change_self");
});

test("roleChangeProblem blocks removing the last admin", () => {
  assert.equal(roleChangeProblem("only@acme.com", "other@acme.com", false, new Set(["only@acme.com"])), "last_admin");
});

test("roleChangeProblem allows promoting and demoting someone else", () => {
  assert.equal(roleChangeProblem("new@acme.com", "boss@acme.com", true, admins), null);
  assert.equal(roleChangeProblem("second@acme.com", "boss@acme.com", false, admins), null);
});

function eventWithAuthTime(authTime?: string): ApiEvent {
  return { rawPath: "/", requestContext: { authorizer: { jwt: { claims: authTime ? { auth_time: authTime } : {} } } } };
}

test("requireRecentSignIn accepts a sign-in inside the window", () => {
  const now = 2_000_000_000;
  assert.doesNotThrow(() => requireRecentSignIn(eventWithAuthTime(String(now - 60)), now));
});

test("requireRecentSignIn rejects an old or missing sign-in time", () => {
  const now = 2_000_000_000;
  const old = String(now - RECENT_SIGN_IN_SECONDS - 1);
  assert.throws(() => requireRecentSignIn(eventWithAuthTime(old), now), ReauthRequiredError);
  assert.throws(() => requireRecentSignIn(eventWithAuthTime(), now), ReauthRequiredError);
  assert.throws(() => requireRecentSignIn(eventWithAuthTime("soon"), now), ReauthRequiredError);
});
