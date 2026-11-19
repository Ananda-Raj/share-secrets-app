import { revokeSecret as revokeSecretRow } from "../lib/dynamo.js";
import { getAuditRecord, markRevoked } from "../lib/audit.js";
import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /secrets/{id}/revoke — the sender's own "I sent that by mistake" cancel.
 * Sender-only, never admin-on-behalf-of-someone-else: authorization is a direct
 * senderEmail match against the audit record, not the roles table. No effect once the
 * recipient has already claimed it -- there's nothing left to take back at that point. */
export async function revokeSecretHandler(event: ApiEvent, id: string) {
  try {
    const callerEmail = getCallerEmail(event);

    const record = await getAuditRecord(id);
    if (!record) return json(404, { error: "not_found" }, config.frontendOrigin);
    if (record.senderEmail !== callerEmail) return json(403, { error: "forbidden" }, config.frontendOrigin);

    const result = await revokeSecretRow(id);
    if (result === "not_found") return json(404, { error: "not_found" }, config.frontendOrigin);
    if (result === "already_claimed") return json(409, { error: "already_claimed" }, config.frontendOrigin);

    const now = Math.floor(Date.now() / 1000);
    try {
      await markRevoked(id, now);
    } catch (err) {
      log("audit.mark_revoked.error", { id, error: String(err) });
    }

    log("secret.revoked", { id });
    return json(200, { ok: true }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    log("secret.revoke.error", { id, error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
