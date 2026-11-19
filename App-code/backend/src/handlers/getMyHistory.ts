import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { getHistoryForSender } from "../lib/audit.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** GET /my/history — the caller's own sends: recipient, description, and read status,
 * never the secret. Scoped to the caller's own email straight from the validated JWT
 * claims — there's no parameter to ask for anyone else's history through this route. */
export async function getMyHistory(event: ApiEvent) {
  try {
    const senderEmail = getCallerEmail(event);
    const records = await getHistoryForSender(senderEmail);
    return json(
      200,
      {
        items: records.map((r) => ({
          secretId: r.secretId,
          recipientEmail: r.recipientEmail,
          description: r.description ?? null,
          isFile: r.isFile,
          createdAt: r.createdAt,
          secretExpiresAt: r.secretExpiresAt,
          claimedAt: r.claimedAt ?? null,
          confirmedAt: r.confirmedAt ?? null,
          revokedAt: r.revokedAt ?? null,
        })),
      },
      config.frontendOrigin
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    log("history.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
