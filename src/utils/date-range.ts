export interface DateRange {
  since: Date;
  until: Date;
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
