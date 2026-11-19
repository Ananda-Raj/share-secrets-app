import { getCallerEmail, requireRecentSignIn, UnauthorizedError, ReauthRequiredError } from "../lib/auth.js";
import { requireAdmin, listAdminEmails, ForbiddenError } from "../lib/roles.js";
import { roleChangeProblem } from "../lib/rolePolicy.js";
import { changeRole } from "../lib/roleChange.js";
import { listUsers } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, assertNonEmptyString, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /admin/users/role {username, role} — promote to admin or back to user.
 * Needs a recent sign-in; you can't change your own role or remove the last admin. */
export async function adminSetRole(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    requireRecentSignIn(event);

    const body = parseJsonBody(event.body);
    const username = assertNonEmptyString(body.username, "username", 256);
    if (body.role !== "admin" && body.role !== "user") throw new ValidationError("role must be admin or user");
    const makeAdmin = body.role === "admin";

    // The email comes from Cognito, not the request, so it's always a real account.
    const target = (await listUsers()).find((u) => u.username === username);
    if (!target) return json(404, { error: "not_found" }, config.frontendOrigin);

    const admins = await listAdminEmails();
    const problem = roleChangeProblem(target.email, callerEmail, makeAdmin, admins);
    if (problem) return json(400, { error: problem }, config.frontendOrigin);
    if (admins.has(target.email.toLowerCase()) === makeAdmin) return json(200, { ok: true }, config.frontendOrigin);

    await changeRole(target.email, body.role, callerEmail, admins);
    return json(200, { ok: true }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ReauthRequiredError) return json(403, { error: "reauth_required" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("admin.role.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
