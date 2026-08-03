import { describe, expect, it } from "vitest";

import {
  spansMultipleUtcDays,
  splitDateRangeAtUtcDayBoundary,
  splitDateRangeIntoYearPeriods,
  toUtcDayString,
} from "./date-range.js";

describe("splitDateRangeIntoYearPeriods", () => {
  it("returns single range for period less than 1 year", () => {
    const since = new Date("2024-01-01T00:00:00Z");
    const until = new Date("2024-06-01T00:00:00Z");
    const result = splitDateRangeIntoYearPeriods({ since, until });
    expect(result).toHaveLength(1);
    expect(result[0]!.since.toISOString()).toBe(since.toISOString());
    expect(result[0]!.until.toISOString()).toBe(until.toISOString());
  });

  it("splits range spanning more than 1 year into year periods", () => {
    const since = new Date("2022-06-15T00:00:00Z");
    const until = new Date("2024-09-20T00:00:00Z");
    const result = splitDateRangeIntoYearPeriods({ since, until });
    expect(result).toHaveLength(3);
    expect(result[0]!.since.toISOString()).toBe("2022-06-15T00:00:00.000Z");
    expect(result[0]!.until.toISOString()).toBe("2023-06-15T00:00:00.000Z");
    expect(result[1]!.since.toISOString()).toBe("2023-06-15T00:00:00.000Z");
    expect(result[1]!.until.toISOString()).toBe("2024-06-15T00:00:00.000Z");
    expect(result[2]!.since.toISOString()).toBe("2024-06-15T00:00:00.000Z");
    expect(result[2]!.until.toISOString()).toBe("2024-09-20T00:00:00.000Z");
  });

  it("returns empty array when since equals until", () => {
    const date = new Date("2024-01-01T00:00:00Z");
    const result = splitDateRangeIntoYearPeriods({
      since: date,
      until: date,
    });
    expect(result).toHaveLength(0);
  });

  it("handles exactly 1 year range", () => {
    const since = new Date("2024-01-01T00:00:00Z");
    const until = new Date("2025-01-01T00:00:00Z");
    const result = splitDateRangeIntoYearPeriods({ since, until });
    expect(result).toHaveLength(1);
    expect(result[0]!.since.toISOString()).toBe(since.toISOString());
    expect(result[0]!.until.toISOString()).toBe(until.toISOString());
  });
});

describe("spansMultipleUtcDays", () => {
  it("returns false when both ends fall on the same UTC day", () => {
    expect(
      spansMultipleUtcDays({
        since: new Date("2024-01-05T00:00:00Z"),
        until: new Date("2024-01-05T23:59:59Z"),
      }),
    ).toBe(false);
  });

  it("returns true when the ends fall on different UTC days", () => {
    expect(
      spansMultipleUtcDays({
        since: new Date("2024-01-05T23:00:00Z"),
        until: new Date("2024-01-06T01:00:00Z"),
      }),
    ).toBe(true);
  });
});

describe("splitDateRangeAtUtcDayBoundary", () => {
  it("splits a range into adjacent, day-disjoint halves", () => {
    const [first, second] = splitDateRangeAtUtcDayBoundary({
      since: new Date("2024-01-01T00:00:00Z"),
      until: new Date("2024-01-15T00:00:00Z"),
    });

    expect(toUtcDayString(first.since)).toBe("2024-01-01");
    expect(toUtcDayString(first.until)).toBe("2024-01-08");
    expect(toUtcDayString(second.since)).toBe("2024-01-09");
    expect(toUtcDayString(second.until)).toBe("2024-01-15");
  });

  it("splits a two-day range into two single days", () => {
    const [first, second] = splitDateRangeAtUtcDayBoundary({
      since: new Date("2024-01-05T10:00:00Z"),
      until: new Date("2024-01-06T12:00:00Z"),
    });

    expect(toUtcDayString(first.since)).toBe("2024-01-05");
    expect(toUtcDayString(first.until)).toBe("2024-01-05");
    expect(toUtcDayString(second.since)).toBe("2024-01-06");
    expect(toUtcDayString(second.until)).toBe("2024-01-06");
    // Both halves must stay chronologically valid even though range.since sits
    // mid-day on the middle day itself.
    expect(first.since.getTime()).toBeLessThanOrEqual(first.until.getTime());
    expect(second.since.getTime()).toBeLessThanOrEqual(second.until.getTime());
  });

  it("keeps the original range endpoints on the outer edges", () => {
    const since = new Date("2024-01-01T12:34:56Z");
    const until = new Date("2024-01-15T01:02:03Z");
    const [first, second] = splitDateRangeAtUtcDayBoundary({ since, until });

    expect(first.since.toISOString()).toBe(since.toISOString());
    expect(second.until.toISOString()).toBe(until.toISOString());
  });
});
