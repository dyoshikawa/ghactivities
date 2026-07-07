import { describe, expect, it } from "vitest";

import { parseSize } from "./parse-size.js";

describe("parseSize", () => {
  it("parses bytes", () => {
    expect(parseSize("1B")).toBe(1);
    expect(parseSize("100B")).toBe(100);
  });

  it("parses kilobytes", () => {
    expect(parseSize("1K")).toBe(1024);
    expect(parseSize("2K")).toBe(2048);
  });

  it("parses megabytes", () => {
    expect(parseSize("1M")).toBe(1048576);
    expect(parseSize("2M")).toBe(2097152);
  });

  it("parses gigabytes", () => {
    expect(parseSize("1G")).toBe(1073741824);
  });

  it("is case-insensitive", () => {
    expect(parseSize("1m")).toBe(1048576);
    expect(parseSize("1k")).toBe(1024);
  });

  it("handles decimal values", () => {
    expect(parseSize("1.5M")).toBe(Math.floor(1.5 * 1024 * 1024));
  });

  it("trims whitespace", () => {
    expect(parseSize("  1M  ")).toBe(1048576);
  });

  it("throws on invalid format", () => {
    expect(() => parseSize("abc")).toThrow("Invalid size format");
    expect(() => parseSize("")).toThrow("Invalid size format");
    expect(() => parseSize("1X")).toThrow("Invalid size format");
  });
});
