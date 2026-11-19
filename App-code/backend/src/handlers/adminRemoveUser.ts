import { getCallerEmail, requireRecentSignIn, UnauthorizedError, ReauthRequiredError } from "../lib/auth.js";
import { requireAdmin, listAdminEmails, ForbiddenError } from "../lib/roles.js";
import { roleChangeProblem } from "../lib/rolePolicy.js";
import { changeRole } from "../lib/roleChange.js";
import { deleteUser, listUsers } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, assertNonEmptyString, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /admin/users/remove {username} — removes a Cognito user. username is Cognito's
 * real identifier (not the email for an SSO user); the email is looked up from it.
 * Removing an admin takes their role away first, with the same safeguards as a demotion. */
export async function adminRemoveUser(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    const username = assertNonEmptyString(body.username, "username", 256);

    const target = (await listUsers()).find((u) => u.username === username);
    if (!target) return json(404, { error: "not_found" }, config.frontendOrigin);
    if (target.email.toLowerCase() === callerEmail.toLowerCase()) {
      return json(400, { error: "cannot_remove_self" }, config.frontendOrigin);
    }

    // Otherwise the admin row would outlive the account, and a new sign-up with that email would be admin.
    const admins = await listAdminEmails();
    if (admins.has(target.email.toLowerCase())) {
      requireRecentSignIn(event);
      const problem = roleChangeProblem(target.email, callerEmail, false, admins);
      if (problem) return json(400, { error: problem }, config.frontendOrigin);
      await changeRole(target.email, "user", callerEmail, admins);
    }

    await deleteUser(username);
    log("admin.user.removed", { removedBy: callerEmail });
    return json(200, { ok: true }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ReauthRequiredError) return json(403, { error: "reauth_required" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    if ((err as { name?: string })?.name === "UserNotFoundException") {
      return json(404, { error: "not_found" }, config.frontendOrigin);
    }
    log("admin.user.remove.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
