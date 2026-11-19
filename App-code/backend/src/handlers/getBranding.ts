import { getSettings } from "../lib/settings.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";

/** GET /branding — public. Receivers see the branding too, before anyone signs in. */
export async function getBranding() {
  try {
    const { branding } = await getSettings();
    return json(200, branding, config.frontendOrigin);
  } catch (err) {
    log("branding.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
