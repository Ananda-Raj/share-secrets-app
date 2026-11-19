import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { createLocalUser, EmailConflictError } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { parseJsonBody, assertValidEmail, ValidationError } from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /admin/users {email} — creates a native account (e.g. for a contractor without
 * IdP access). Temporary password is returned once here, never stored or logged. */
export async function adminCreateLocalUser(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const body = parseJsonBody(event.body);
    const email = assertValidEmail(body.email);

    const { temporaryPassword } = await createLocalUser(email);
    log("admin.local_user.created", { createdBy: callerEmail });
    return json(201, { email, temporaryPassword }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    if (err instanceof EmailConflictError) return json(409, { error: "user_already_exists" }, config.frontendOrigin);
    if ((err as { name?: string })?.name === "UsernameExistsException") {
      return json(409, { error: "user_already_exists" }, config.frontendOrigin);
    }
    log("admin.local_user.create.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
