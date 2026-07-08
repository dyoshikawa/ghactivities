import { describe, expect, it } from "vitest";

import { countTokens } from "./count-tokens.js";

describe("countTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("counts tokens for a simple string", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });

  it("counts more tokens for longer text", () => {
    const short = countTokens("hello");
    const long = countTokens("hello world this is a longer sentence with more tokens");
    expect(long).toBeGreaterThan(short);
  });
});
