import { ValidationError } from "./validation.js";

export interface DateRange {
  from: number;
  to: number;
}

const DEFAULT_RANGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Shared by /admin/audit and /admin/stats. Defaults to the last 30 days when no range
 * is given; both bounds are epoch seconds. */
export function parseDateRange(query: Record<string, string> | null | undefined): DateRange {
  const now = Math.floor(Date.now() / 1000);
  const from = query?.from !== undefined ? Number(query.from) : now - DEFAULT_RANGE_SECONDS;
  const to = query?.to !== undefined ? Number(query.to) : now;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new ValidationError("Invalid date range");
  }
  return { from, to };
}
