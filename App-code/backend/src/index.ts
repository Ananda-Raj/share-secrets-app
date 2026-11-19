import { createSecret } from "./handlers/createSecret.js";
import { getSecretMeta } from "./handlers/getSecretMeta.js";
import { verifyOtpHandler } from "./handlers/verifyOtp.js";
import { confirmBurn } from "./handlers/confirmBurn.js";
import { resendOtpHandler } from "./handlers/resendOtp.js";
import { revokeSecretHandler } from "./handlers/revokeSecret.js";
import { getMyHistory } from "./handlers/getMyHistory.js";
import { getAdminAudit } from "./handlers/getAdminAudit.js";
import { getAdminStats } from "./handlers/getAdminStats.js";
import { getMe } from "./handlers/getMe.js";
import { getAdminAuthSettings, updateAdminAuthSettings } from "./handlers/adminAuthSettings.js";
import { adminConfigureIdp } from "./handlers/adminConfigureIdp.js";
import { adminCreateLocalUser } from "./handlers/adminCreateLocalUser.js";
import { getAdminUsers } from "./handlers/getAdminUsers.js";
import { adminRemoveUser } from "./handlers/adminRemoveUser.js";
import { getAuthConfig } from "./handlers/getAuthConfig.js";
import { getBranding } from "./handlers/getBranding.js";
import { getAdminSettings, updateAdminSettings } from "./handlers/adminSettings.js";
import { runMonthlySummary, previewSummary } from "./handlers/activitySummary.js";
import { json } from "./lib/response.js";
import { config } from "./lib/config.js";
import { log } from "./lib/logger.js";
import type { ApiEvent, ScheduledTask } from "./types.js";

// Single Lambda ("lambdalith") behind API Gateway HTTP API, routed here by hand — a
// handful of small routes don't justify a routing framework dependency or one function
// per route (which would only add cold starts and Terraform surface area).
//
// Two trust boundaries: /secrets (create), /secrets/{id}/revoke, /my/history, /me, and
// /admin/* require an authenticated caller (API Gateway's JWT authorizer, validated
// before Lambda ever runs) and never receive one from a link recipient. /secrets/{id}/
// {meta,verify-otp,confirm,resend} stay open to anyone with the link — receivers never
// log in. /auth-config and /branding are public too.
const ID_SEGMENT = "([A-Za-z0-9_-]{10,32})";
const ROUTES: Array<{ method: string; pattern: RegExp; handle: (e: ApiEvent, id: string) => Promise<unknown> }> = [
  { method: "POST", pattern: /^\/secrets$/, handle: (e) => createSecret(e) },
  { method: "GET", pattern: new RegExp(`^/secrets/${ID_SEGMENT}/meta$`), handle: (e, id) => getSecretMeta(e, id) },
  { method: "POST", pattern: new RegExp(`^/secrets/${ID_SEGMENT}/verify-otp$`), handle: (e, id) => verifyOtpHandler(e, id) },
  { method: "POST", pattern: new RegExp(`^/secrets/${ID_SEGMENT}/confirm$`), handle: (e, id) => confirmBurn(e, id) },
  { method: "POST", pattern: new RegExp(`^/secrets/${ID_SEGMENT}/resend$`), handle: (e, id) => resendOtpHandler(e, id) },
  { method: "POST", pattern: new RegExp(`^/secrets/${ID_SEGMENT}/revoke$`), handle: (e, id) => revokeSecretHandler(e, id) },
  { method: "GET", pattern: /^\/my\/history$/, handle: (e) => getMyHistory(e) },
  { method: "GET", pattern: /^\/admin\/audit$/, handle: (e) => getAdminAudit(e) },
  { method: "GET", pattern: /^\/admin\/stats$/, handle: (e) => getAdminStats(e) },
  { method: "GET", pattern: /^\/me$/, handle: (e) => getMe(e) },
  { method: "GET", pattern: /^\/admin\/auth-settings$/, handle: (e) => getAdminAuthSettings(e) },
  { method: "POST", pattern: /^\/admin\/auth-settings$/, handle: (e) => updateAdminAuthSettings(e) },
  { method: "POST", pattern: /^\/admin\/idp$/, handle: (e) => adminConfigureIdp(e) },
  { method: "POST", pattern: /^\/admin\/users$/, handle: (e) => adminCreateLocalUser(e) },
  { method: "GET", pattern: /^\/admin\/users$/, handle: (e) => getAdminUsers(e) },
  { method: "POST", pattern: /^\/admin\/users\/remove$/, handle: (e) => adminRemoveUser(e) },
  { method: "GET", pattern: /^\/auth-config$/, handle: () => getAuthConfig() },
  { method: "GET", pattern: /^\/branding$/, handle: () => getBranding() },
  { method: "GET", pattern: /^\/admin\/settings$/, handle: (e) => getAdminSettings(e) },
  { method: "POST", pattern: /^\/admin\/settings$/, handle: (e) => updateAdminSettings(e) },
  { method: "POST", pattern: /^\/admin\/summary\/preview$/, handle: (e) => previewSummary(e) },
];

export async function handler(event: ApiEvent | ScheduledTask) {
  // The monthly schedule invokes this function directly, not through API Gateway.
  if ("task" in event) {
    if (event.task === "monthly-summary") await runMonthlySummary();
    else log("task.unknown", { task: String(event.task) });
    return;
  }

  const method = event.requestContext?.http?.method ?? "GET";
  const path = event.rawPath ?? "/";

  if (method === "OPTIONS") return json(204, {}, config.frontendOrigin);

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;
    try {
      return await route.handle(event, match[1]);
    } catch (err) {
      log("handler.uncaught_error", { path, error: String(err) });
      return json(500, { error: "internal_error" }, config.frontendOrigin);
    }
  }

  return json(404, { error: "not_found" }, config.frontendOrigin);
}
