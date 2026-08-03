export interface DateRange {
  since: Date;
  until: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toUtcDayString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function spansMultipleUtcDays(range: DateRange): boolean {
  return toUtcDayString(range.since) !== toUtcDayString(range.until);
}

// Splits a range into two adjacent halves that are disjoint at UTC day
// granularity (the granularity GitHub search date qualifiers operate at):
// the first half ends on the middle day and the second half starts on the
// following day. Requires spansMultipleUtcDays(range).
export function splitDateRangeAtUtcDayBoundary(range: DateRange): [DateRange, DateRange] {
  const sinceDay = Date.UTC(
    range.since.getUTCFullYear(),
    range.since.getUTCMonth(),
    range.since.getUTCDate(),
  );
  const untilDay = Date.UTC(
    range.until.getUTCFullYear(),
    range.until.getUTCMonth(),
    range.until.getUTCDate(),
  );
  const dayCount = Math.round((untilDay - sinceDay) / DAY_MS);
  const midDay = sinceDay + Math.floor(dayCount / 2) * DAY_MS;

  return [
    { since: range.since, until: new Date(midDay) },
    { since: new Date(midDay + DAY_MS), until: range.until },
  ];
}

export function splitDateRangeIntoYearPeriods(range: DateRange): DateRange[] {
  const ranges: DateRange[] = [];
  let current = new Date(range.since);

  while (current < range.until) {
    const yearLater = new Date(current);
    yearLater.setFullYear(yearLater.getFullYear() + 1);

    const end = yearLater < range.until ? yearLater : range.until;
    ranges.push({ since: new Date(current), until: new Date(end) });
    current = end;
  }

  return ranges;
}
