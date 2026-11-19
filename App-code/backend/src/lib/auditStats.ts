import type { AuditRecord } from "./audit.js";

/** Pure aggregation, deliberately kept free of any AWS/config import — audit.ts's
 * scanAuditRange does the fetch (needs config.auditTableName, which requires an env
 * var not yet wired to any infra), but this part is fully unit-testable on its own. */
export interface SenderCount {
  senderEmail: string;
  count: number;
}

export function aggregateTopSenders(records: AuditRecord[]): SenderCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.failedAt) continue; // never sent
    counts.set(record.senderEmail, (counts.get(record.senderEmail) ?? 0) + 1);
  }
  return [...counts.entries()].map(([senderEmail, count]) => ({ senderEmail, count })).sort((a, b) => b.count - a.count);
}
