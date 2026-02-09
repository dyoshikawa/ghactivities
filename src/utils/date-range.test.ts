import { describe, expect, it } from "vitest";

import { splitDateRangeIntoYearPeriods } from "./date-range.js";

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
