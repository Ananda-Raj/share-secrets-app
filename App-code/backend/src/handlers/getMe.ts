import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { ensureFirstAdmin } from "../lib/roles.js";
import { getSettings } from "../lib/settings.js";
import { emailMatchesDomains, TTL_CHOICES } from "../lib/settingsSchema.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** GET /me — the caller's real role (so the frontend knows whether to show the Admin
 * nav link), the sharing rules that apply to them, and the one place
 * ensureFirstAdmin's bootstrap check runs. */
export async function getMe(event: ApiEvent) {
  try {
    const email = getCallerEmail(event);
    const [role, { policy }] = await Promise.all([ensureFirstAdmin(email), getSettings()]);
    return json(
      200,
      {
        email,
        role,
        policy: {
          canSend: emailMatchesDomains(email, policy.allowedSenderDomains),
          allowedRecipientDomains: policy.allowedRecipientDomains,
          maxTtlSeconds: policy.maxTtlSeconds,
          defaultTtlSeconds: policy.defaultTtlSeconds,
          fileSharingEnabled: policy.fileSharingEnabled,
          ttlChoices: TTL_CHOICES,
        },
      },
      config.frontendOrigin
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    log("me.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
