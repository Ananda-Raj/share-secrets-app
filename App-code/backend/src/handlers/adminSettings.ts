import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { validateBranding, validatePolicy, validateReports, TTL_CHOICES } from "../lib/settingsSchema.js";
import { json } from "../lib/response.js";
import { parseJsonBody, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

function errorResponse(err: unknown, logEvent: string) {
  if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
  if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
  if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
  log(logEvent, { error: String(err) });
  return json(500, { error: "internal_error" }, config.frontendOrigin);
}

/** GET /admin/settings — branding, sharing policy and reports. */
export async function getAdminSettings(event: ApiEvent) {
  try {
    await requireAdmin(getCallerEmail(event));
    const settings = await getSettings();
    return json(200, { ...settings, ttlChoices: TTL_CHOICES }, config.frontendOrigin);
  } catch (err) {
    return errorResponse(err, "admin.settings.get.error");
  }
}

/** POST /admin/settings {branding?, policy?, reports?} — each section given is replaced whole. */
export async function updateAdminSettings(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    if (body.branding === undefined && body.policy === undefined && body.reports === undefined) {
      throw new ValidationError("Nothing to update");
    }
    const changes = {
      branding: body.branding === undefined ? undefined : validateBranding(body.branding),
      policy: body.policy === undefined ? undefined : validatePolicy(body.policy),
      reports: body.reports === undefined ? undefined : validateReports(body.reports),
    };
    const saved = await saveSettings(changes, callerEmail);
    log("admin.settings.updated", { branding: !!changes.branding, policy: !!changes.policy, reports: !!changes.reports });
    return json(200, { ...saved, ttlChoices: TTL_CHOICES }, config.frontendOrigin);
  } catch (err) {
    return errorResponse(err, "admin.settings.update.error");
  }
}
