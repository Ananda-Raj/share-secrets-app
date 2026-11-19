import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { upsertOidcProvider } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, assertValidIdpName, assertValidIssuerUrl, assertNonEmptyString, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /admin/idp — creates or updates a federated OIDC identity provider at runtime,
 * without a new `terraform apply`. Don't mix with Terraform-managed oidc_* variables on
 * the same deployment — whichever runs last overwrites the other's view of it. */
export async function adminConfigureIdp(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    const idpName = assertValidIdpName(body.idpName);
    const issuerUrl = assertValidIssuerUrl(body.issuerUrl);
    const clientId = assertNonEmptyString(body.clientId, "clientId", 256);
    const clientSecret = assertNonEmptyString(body.clientSecret, "clientSecret", 512);

    await upsertOidcProvider({ idpName, issuerUrl, clientId, clientSecret });
    log("admin.idp.configured", { idpName });
    return json(200, { ok: true, idpName }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("admin.idp.configure.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
