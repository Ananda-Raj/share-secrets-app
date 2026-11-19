import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { requireAdmin, listAdminEmails, ForbiddenError } from "../lib/roles.js";
import { scanAuditRange } from "../lib/audit.js";
import { getSettings } from "../lib/settings.js";
import { summarize, summaryEmail, previousMonth, last30Days, type Period } from "../lib/summary.js";
import { sendActivitySummary } from "../lib/ses.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { Branding } from "../lib/settingsSchema.js";
import type { ApiEvent } from "../types.js";

async function buildEmail(period: Period, branding: Branding, preview: boolean) {
  const records = await scanAuditRange(period.from, period.to);
  const summary = summarize(records, Math.floor(Date.now() / 1000));
  return summaryEmail(summary, period, branding.appName, `${config.frontendOrigin}/admin`, preview);
}

/** Runs on the 1st of each month (EventBridge). Emails every admin, if it's turned on. */
export async function runMonthlySummary(): Promise<void> {
  const { branding, reports } = await getSettings();
  if (!reports.monthlySummary) {
    log("summary.skipped");
    return;
  }
  const email = await buildEmail(previousMonth(new Date()), branding, false);
  const admins = await listAdminEmails();
  let sent = 0;
  // Failures are logged, not thrown: a retry would email the other admins twice.
  for (const to of admins) {
    try {
      await sendActivitySummary(to, email.subject, email.text, branding);
      sent++;
    } catch (err) {
      log("summary.send.error", { error: String(err) });
    }
  }
  log("summary.sent", { sent, admins: admins.size });
}

/** POST /admin/summary/preview — the last 30 days, to the calling admin only. */
export async function previewSummary(event: ApiEvent) {
  try {
    const callerEmail = getCallerEmail(event);
    await requireAdmin(callerEmail);
    const { branding } = await getSettings();
    const email = await buildEmail(last30Days(new Date()), branding, true);
    await sendActivitySummary(callerEmail, email.subject, email.text, branding);
    return json(200, { sentTo: callerEmail }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ForbiddenError) return json(403, { error: "forbidden" }, config.frontendOrigin);
    log("summary.preview.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
