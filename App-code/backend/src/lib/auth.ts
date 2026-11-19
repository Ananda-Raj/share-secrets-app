import type { ApiEvent } from "../types.js";

export class UnauthorizedError extends Error {}

/**
 * Reads the caller's email from the claims API Gateway's JWT authorizer attaches to
 * the event — never from anything the client sends directly, so a request can't just
 * claim to be someone else. By the time a Lambda invocation happens on an authenticated
 * route, API Gateway has already rejected anything without a valid Cognito-issued
 * token; this throwing at all should only be possible via a route misconfiguration
 * (missing the authorizer), not a real unauthenticated request — defensive, not the
 * primary access control.
 *
 */
export function getCallerEmail(event: ApiEvent): string {
  const email = event.requestContext?.authorizer?.jwt?.claims?.email;
  if (!email) throw new UnauthorizedError("Missing authenticated caller identity");
  return email;
}

export class ReauthRequiredError extends Error {}

/** Changing admins needs a sign-in this recent, so an old stolen token can't do it. */
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

/** auth_time is when the user last actually signed in; refreshing tokens doesn't change it. */
export function requireRecentSignIn(event: ApiEvent, nowSeconds = Math.floor(Date.now() / 1000)): void {
  const authTime = Number(event.requestContext?.authorizer?.jwt?.claims?.auth_time);
  if (!Number.isFinite(authTime) || nowSeconds - authTime > RECENT_SIGN_IN_SECONDS) {
    throw new ReauthRequiredError("A recent sign-in is required");
  }
}
