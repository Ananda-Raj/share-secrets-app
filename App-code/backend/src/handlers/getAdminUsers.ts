import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError, listAdminEmails } from "../lib/roles.js";
import { listUsers } from "../lib/cognitoAdmin.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** GET /admin/users — every Cognito user, SSO and local, with status and role. Also
 * returns the caller's own email, so the frontend can hide its own row's buttons. */
export async function getAdminUsers(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const [cognitoUsers, adminEmails] = await Promise.all([listUsers(), listAdminEmails()]);
    const users = cognitoUsers.map((u) => ({ ...u, isAdmin: adminEmails.has(u.email.toLowerCase()) }));
    return json(200, { users, yourEmail: callerEmail }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    log("admin.users.list.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
