import { confirmDelete } from "../lib/dynamo.js";
import { markConfirmed } from "../lib/audit.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/** POST /secrets/{id}/confirm — called by the browser immediately after a successful
 * client-side decrypt, so the record is deleted for real within seconds rather than
 * lingering for the full grace window. Only deletes a secret that was actually claimed
 * first (see confirmDelete) — otherwise anyone who merely has the link, but never
 * retrieved it themselves, could burn it out from under the real recipient. Idempotent:
 * confirming a gone/expired/unclaimed id is a no-op, not an error. */
export async function confirmBurn(_event: ApiEvent, id: string) {
  await confirmDelete(id);

  const now = Math.floor(Date.now() / 1000);
  try {
    await markConfirmed(id, now);
  } catch (err) {
    log("audit.mark_confirmed.error", { id, error: String(err) });
  }

  log("secret.confirmed_burned", { id });
  return json(200, { ok: true }, config.frontendOrigin);
}
