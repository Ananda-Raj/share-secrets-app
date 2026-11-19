import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { scanAuditRange } from "../lib/audit.js";
import { aggregateTopSenders } from "../lib/auditStats.js";
import { parseDateRange } from "../lib/dateRange.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { ValidationError } from "../lib/validation.js";
import type { ApiEvent } from "../types.js";

/** GET /admin/stats?from&to — top senders in range, for spotting risky/excessive
 * sharing patterns. Admin-only, invisible to regular users — this is deliberately not
 * a leaderboard anyone can see, per the user's explicit request. */
export async function getAdminStats(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const { from, to } = parseDateRange(event.queryStringParameters);
    const records = await scanAuditRange(from, to);
    return json(200, { topSenders: aggregateTopSenders(records) }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("admin.stats.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
