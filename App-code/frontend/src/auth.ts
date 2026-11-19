// OAuth2 Authorization Code + PKCE against Cognito's hosted UI — no auth library
// dependency, consistent with this app's zero-dependency approach; PKCE only needs
// Web Crypto, already used everywhere else in this app. Cognito federates with the IdP
// entirely server-side, so this app never sees the IdP's own credentials, and the
// "identity_provider" param below is just Cognito's name for that connection.
//
// Tokens live in sessionStorage (cleared when the tab closes) rather than localStorage
// — a deliberate, easy-to-revisit trade-off favoring a shorter exposure window over
// staying logged in across browser restarts, for a tool built by the security team.

import { randomBytes, toBase64Url } from "./crypto.js";

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const API_BASE = import.meta.env.VITE_API_BASE_URL;
// Name of the configured IdP, if any -- only used to decide whether skipping Cognito's
// hosted-UI chooser screen is even possible; see isSelfSignupEnabled below for whether
// it's also correct to.
const IDP_NAME = import.meta.env.VITE_COGNITO_IDP_NAME;
const SCOPES = "openid email profile";

// Checked at runtime, not baked into the build: self-signup can be toggled live from
// the Admin page without a frontend redeploy, so a build-time constant would go stale.
// Skipping straight to the IdP is only correct when self-signup is off -- otherwise the
// only way to reach the self-signup form would be a hand-built URL.
async function isSelfSignupEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth-config`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.selfSignupEnabled === true;
  } catch {
    return false; // fail closed to the old skip-straight-to-IdP behavior
  }
}

const STORAGE = {
  verifier: "auth.pkce_verifier",
  state: "auth.oauth_state",
  idToken: "auth.id_token",
  refreshToken: "auth.refresh_token",
  expiresAt: "auth.expires_at",
};

function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

// RFC 7636's own recommended construction: 32 random bytes, base64url-encoded (43
// chars, no padding) — satisfies PKCE's 43-128 character requirement and doubles as a
// fine CSRF "state" token.
function randomToken(): string {
  return toBase64Url(randomBytes(32));
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

/** Redirects the browser to Cognito's hosted UI to sign in. Nothing to await — the
 * page navigates away. */
export async function login(): Promise<void> {
  const verifier = randomToken();
  const state = randomToken();
  sessionStorage.setItem(STORAGE.verifier, verifier);
  sessionStorage.setItem(STORAGE.state, state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge: await codeChallengeFor(verifier),
    code_challenge_method: "S256",
    state,
  });
  if (IDP_NAME && !(await isSelfSignupEnabled())) params.set("identity_provider", IDP_NAME);

  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

interface TokenResponse {
  // Cognito's access token deliberately carries no "email" claim -- only client_id,
  // sub, and scope. The ID token is the one built from the "openid email profile"
  // scopes we request, so it's the ID token (not the access token) that this app sends
  // to the API as the bearer credential -- unusual for OAuth2 in general, but the only
  // way the backend's JWT authorizer can hand the Lambda a usable `email` claim without
  // a second round trip to a userinfo endpoint.
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function storeTokens(tokens: TokenResponse): void {
  sessionStorage.setItem(STORAGE.idToken, tokens.id_token);
  sessionStorage.setItem(STORAGE.expiresAt, String(Date.now() + tokens.expires_in * 1000));
  if (tokens.refresh_token) sessionStorage.setItem(STORAGE.refreshToken, tokens.refresh_token);
}

async function exchangeToken(body: URLSearchParams): Promise<TokenResponse | null> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Call this on the /callback route. Verifies `state` (CSRF protection) before
 * exchanging the authorization code for tokens — throws on any failure, including a
 * state mismatch, so the caller can show an error rather than silently proceed
 * unauthenticated.
 */
export async function handleLoginCallback(): Promise<void> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = sessionStorage.getItem(STORAGE.state);
  const verifier = sessionStorage.getItem(STORAGE.verifier);
  sessionStorage.removeItem(STORAGE.state);
  sessionStorage.removeItem(STORAGE.verifier);

  if (!code || !state || !verifier || state !== expectedState) {
    throw new Error("Login could not be verified. Please try signing in again.");
  }

  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
  );
  if (!tokens) throw new Error("Login failed. Please try signing in again.");
  storeTokens(tokens);
}

/**
 * Returns a valid ID token (see the TokenResponse comment above for why the ID token,
 * not the access token, is what the API expects), transparently refreshing it first if
 * it's expired or close to it — or null if there's no session to use, meaning the
 * caller should redirect to login().
 */
export async function getIdToken(): Promise<string | null> {
  const token = sessionStorage.getItem(STORAGE.idToken);
  const expiresAt = Number(sessionStorage.getItem(STORAGE.expiresAt) ?? 0);
  if (token && Date.now() < expiresAt - 30_000) return token; // 30s safety margin

  const refreshToken = sessionStorage.getItem(STORAGE.refreshToken);
  if (!refreshToken) return null;
  const tokens = await exchangeToken(
    new URLSearchParams({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: refreshToken })
  );
  if (!tokens) return null;
  // Cognito doesn't always re-issue a refresh token on refresh — keep the existing one.
  storeTokens({ ...tokens, refresh_token: tokens.refresh_token ?? refreshToken });
  return tokens.id_token;
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem(STORAGE.refreshToken) !== null || sessionStorage.getItem(STORAGE.idToken) !== null;
}

export function logout(): void {
  for (const key of Object.values(STORAGE)) sessionStorage.removeItem(key);
  const params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: window.location.origin });
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params.toString()}`;
}
