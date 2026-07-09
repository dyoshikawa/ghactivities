import { describe, expect, it, vi } from "vitest";

import { parseCliArgs } from "./parse-args.js";

describe("parseCliArgs", () => {
  it("parses all options", () => {
    const result = parseCliArgs([
      "--github-token",
      "my-token",
      "--output",
      "./out.json",
      "--since",
      "2024-01-01T00:00:00Z",
      "--until",
      "2024-06-01T00:00:00Z",
      "--visibility",
      "all",
      "--max-length-size",
      "2M",
      "--max-tokens",
      "1000",
      "--order",
      "desc",
    ]);
    expect(result.githubToken).toBe("my-token");
    expect(result.output).toBe("./out.json");
    expect(result.since.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(result.until.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(result.visibility).toBe("all");
    expect(result.maxLengthSize).toBe(2 * 1024 * 1024);
    expect(result.maxTokens).toBe(1000);
    expect(result.order).toBe("desc");
  });

  it("uses defaults when no options provided", () => {
    const result = parseCliArgs([]);
    expect(result.output).toBe("./ghactivities.json");
    expect(result.visibility).toBe("public");
    expect(result.maxLengthSize).toBe(1024 * 1024);
    expect(result.maxTokens).toBeUndefined();
    expect(result.order).toBe("asc");
    expect(result.since).toBeInstanceOf(Date);
    expect(result.until).toBeInstanceOf(Date);
  });

  it("leaves scan undefined unless --scan is passed", () => {
    expect(parseCliArgs([]).scan).toBeUndefined();
  });

  it("resolves scan config when --scan is passed", () => {
    const result = parseCliArgs([
      "--scan",
      "--provider",
      "openrouter",
      "--model",
      "openai/gpt-4o",
      "--api-key",
      "sk-test",
      "--scan-output",
      "./report.md",
    ]);
    expect(result.scan).toEqual({
      provider: "openrouter",
      model: "openai/gpt-4o",
      apiKey: "sk-test",
      output: "./report.md",
      vertexProject: undefined,
      vertexLocation: undefined,
    });
  });

  it("throws when --scan is passed without a resolvable API key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    try {
      expect(() => parseCliArgs(["--scan"])).toThrow(/api key/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("throws on invalid visibility", () => {
    expect(() => parseCliArgs(["--visibility", "invalid"])).toThrow();
  });

  it("throws on invalid order", () => {
    expect(() => parseCliArgs(["--order", "random"])).toThrow();
  });

  it("throws on invalid since date", () => {
    expect(() => parseCliArgs(["--since", "not-a-date"])).toThrow();
  });

  it("throws on invalid max-length-size", () => {
    expect(() => parseCliArgs(["--max-length-size", "abc"])).toThrow();
  });

  it("throws on invalid max-tokens", () => {
    expect(() => parseCliArgs(["--max-tokens", "abc"])).toThrow();
    expect(() => parseCliArgs(["--max-tokens", "0"])).toThrow();
    expect(() => parseCliArgs(["--max-tokens", "-5"])).toThrow();
  });

  it("calls process.exit on --help", () => {
    const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    parseCliArgs(["--help"]);

    expect(exitMock).toHaveBeenCalledWith(0);
    expect(logMock).toHaveBeenCalled();

    exitMock.mockRestore();
    logMock.mockRestore();
  });
});
