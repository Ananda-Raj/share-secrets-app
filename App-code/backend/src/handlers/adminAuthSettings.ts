import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { getAuthSettings, setSelfSignupEnabled } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** GET /admin/auth-settings — current state for the admin settings screen: is native
 * self-signup open, and which identity providers Cognito already has configured. */
export async function getAdminAuthSettings(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const settings = await getAuthSettings();
    return json(200, settings, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    log("admin.auth_settings.get.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}

/** POST /admin/auth-settings {selfSignupEnabled} — toggles native username/password
 * sign-up. Doesn't touch any already-configured federated IdP either way. */
export async function updateAdminAuthSettings(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    if (typeof body.selfSignupEnabled !== "boolean") {
      throw new ValidationError("selfSignupEnabled must be a boolean");
    }
    await setSelfSignupEnabled(body.selfSignupEnabled);
    log("admin.auth_settings.updated", { selfSignupEnabled: body.selfSignupEnabled });
    return json(200, { ok: true }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("admin.auth_settings.update.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
