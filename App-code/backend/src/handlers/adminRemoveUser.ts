import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { deleteUser } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, assertNonEmptyString, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /admin/users/remove {username, email} — removes a Cognito user. Blocks
 * removing your own account (could lock out the only admin). email is only used for
 * that self-check; username is Cognito's real identifier and what actually gets removed
 * -- not the same value for a federated (SSO) user. */
export async function adminRemoveUser(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    const username = assertNonEmptyString(body.username, "username", 256);
    const email = assertNonEmptyString(body.email, "email", 254);

    if (email === callerEmail) return json(400, { error: "cannot_remove_self" }, config.frontendOrigin);

    await deleteUser(username);
    log("admin.user.removed", { removedBy: callerEmail });
    return json(200, { ok: true }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    if ((err as { name?: string })?.name === "UserNotFoundException") {
      return json(404, { error: "not_found" }, config.frontendOrigin);
    }
    log("admin.user.remove.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
