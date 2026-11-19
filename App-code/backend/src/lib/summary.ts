import type { AuditRecord } from "./audit.js";
import { aggregateTopSenders, type SenderCount } from "./auditStats.js";

// Activity summary for admins. Pure functions only, so this file is unit-testable without AWS.

export interface ActivitySummary {
  sent: number;
  files: number;
  opened: number;
  expired: number;
  revoked: number;
  waiting: number;
  senders: number;
  topSenders: SenderCount[];
}

export interface Period {
  from: number; // epoch seconds
  to: number; // epoch seconds, inclusive
  label: string; // reads after "for", e.g. "October 2026"
}

const TOP_SENDERS = 5;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function summarize(all: AuditRecord[], now: number): ActivitySummary {
  const records = all.filter((r) => !r.failedAt); // never sent
  const counts = { sent: records.length, files: 0, opened: 0, expired: 0, revoked: 0, waiting: 0 };
  for (const r of records) {
    if (r.isFile) counts.files++;
    if (r.revokedAt) counts.revoked++;
    else if (r.claimedAt || r.confirmedAt) counts.opened++;
    else if (r.secretExpiresAt !== undefined && r.secretExpiresAt <= now) counts.expired++;
    else counts.waiting++;
  }
  const senders = aggregateTopSenders(records);
  return { ...counts, senders: senders.length, topSenders: senders.slice(0, TOP_SENDERS) };
}

/** The whole previous calendar month, in UTC. */
export function previousMonth(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return {
    from: start.getTime() / 1000,
    to: end / 1000 - 1,
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
  };
}

export function last30Days(now: Date): Period {
  const to = Math.floor(now.getTime() / 1000);
  return { from: to - 30 * 24 * 60 * 60, to, label: "the last 30 days" };
}

export function summaryEmail(
  s: ActivitySummary,
  period: Period,
  appName: string,
  adminUrl: string,
  preview: boolean
): { subject: string; text: string } {
  const subject = `${preview ? "Preview: " : ""}${appName} activity for ${period.label}`;
  const lines = [`Here's the activity in ${appName} for ${period.label}.`, ""];

  if (s.sent === 0) {
    lines.push("No secrets were sent.");
  } else {
    lines.push(
      `Secrets sent: ${s.sent}${s.files ? ` (${s.files} of them files)` : ""}`,
      `Opened: ${s.opened}`,
      `Expired before anyone opened them: ${s.expired}`,
      `Revoked by the sender: ${s.revoked}`,
      `Still waiting to be opened: ${s.waiting}`,
      `People who sent secrets: ${s.senders}`,
      "",
      "Top senders:",
      ...s.topSenders.map((t) => `  ${String(t.count).padStart(4)}  ${t.senderEmail}`)
    );
  }

  lines.push(
    "",
    "The full list, with a CSV download, is on the admin page:",
    adminUrl,
    "",
    preview
      ? "This is a preview you asked for. The monthly summary goes to every admin once it's turned on under Admin → Activity."
      : "You're getting this because you're an admin and the monthly summary is on. Turn it off under Admin → Activity."
  );

  return { subject, text: lines.join("\n") };
}
