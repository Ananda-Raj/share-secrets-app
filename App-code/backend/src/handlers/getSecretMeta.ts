import { getSecret } from "../lib/dynamo.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import type { ApiEvent } from "../types.js";

/** GET /secrets/{id}/meta — non-destructive; safe to call repeatedly (e.g. on page load)
 * without affecting the secret's one-time-view state. Reveals only existence, never
 * content. Every secret is email+OTP now (link-mode/password removed), so there's
 * nothing left to distinguish beyond exists/doesn't. */
export async function getSecretMeta(_event: ApiEvent, id: string) {
  const now = Math.floor(Date.now() / 1000);
  const item = await getSecret(id);
  const exists = !!item && item.expiresAt >= now;
  return json(200, { exists }, config.frontendOrigin);
}
