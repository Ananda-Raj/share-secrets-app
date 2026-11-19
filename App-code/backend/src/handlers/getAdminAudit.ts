import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, ForbiddenError } from "../lib/roles.js";
import { scanAuditRange } from "../lib/audit.js";
import { parseDateRange } from "../lib/dateRange.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { ValidationError } from "../lib/validation.js";
import type { ApiEvent } from "../types.js";

/** GET /admin/audit?from&to — every send in range, across all senders. Admin-only,
 * checked against the roles table (admin is app-managed, not an IdP group; see
 * Doc/design.md). Defaults
 * to the last 30 days if no range is given. */
export async function getAdminAudit(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const { from, to } = parseDateRange(event.queryStringParameters);
    const records = await scanAuditRange(from, to);
    return json(
      200,
      {
        items: records.map((r) => ({
          secretId: r.secretId,
          senderEmail: r.senderEmail,
          recipientEmail: r.recipientEmail,
          description: r.description ?? null,
          isFile: r.isFile,
          createdAt: r.createdAt,
          secretExpiresAt: r.secretExpiresAt,
          claimedAt: r.claimedAt ?? null,
          confirmedAt: r.confirmedAt ?? null,
          revokedAt: r.revokedAt ?? null,
          failedAt: r.failedAt ?? null,
        })),
        // For the ready-to-copy Reset commands on the Activity tab.
        auditTableName: config.auditTableName,
        region: process.env.AWS_REGION ?? "",
      },
      config.frontendOrigin
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("admin.audit.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
