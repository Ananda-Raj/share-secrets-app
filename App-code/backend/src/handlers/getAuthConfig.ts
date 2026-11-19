import { getAuthSettings } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";

/** GET /auth-config — public, unauthenticated: the one thing the frontend needs to know
 * before anyone has logged in, so it can decide whether to skip Cognito's hosted-UI
 * chooser screen and jump straight to the IdP (only correct when self-signup is off) or
 * show both options. Not admin-gated like /admin/auth-settings -- nothing here is
 * sensitive, it's exactly what the public login page would show either way. */
export async function getAuthConfig() {
  try {
    const { selfSignupEnabled } = await getAuthSettings();
    return json(200, { selfSignupEnabled }, config.frontendOrigin);
  } catch (err) {
    log("auth_config.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
