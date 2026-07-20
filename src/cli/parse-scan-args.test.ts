import { describe, expect, it } from "vitest";

import { parseScanArgs } from "./parse-scan-args.js";

describe("parseScanArgs", () => {
  it("parses a path with explicit options", () => {
    const result = parseScanArgs(
      [
        "./ghactivities.json",
        "--provider",
        "openrouter",
        "--model",
        "openai/gpt-4o",
        "--api-key",
        "sk-test",
        "--output",
        "./report.md",
      ],
      {},
    );
    expect(result.path).toBe("./ghactivities.json");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.apiKey).toBe("sk-test");
    expect(result.output).toBe("./report.md");
  });

  it("defaults the provider to openai and picks its default model", () => {
    const result = parseScanArgs(["./out.json"], { OPENAI_API_KEY: "sk-env" });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-5.6-luna");
    expect(result.apiKey).toBe("sk-env");
  });

  it("resolves the API key from a provider-specific env var", () => {
    const result = parseScanArgs(["./out.json", "--provider", "google"], {
      GEMINI_API_KEY: "gk-env",
    });
    expect(result.apiKey).toBe("gk-env");
  });

  it("prefers --api-key over env vars", () => {
    const result = parseScanArgs(["./out.json", "--api-key", "flag"], {
      OPENAI_API_KEY: "env",
    });
    expect(result.apiKey).toBe("flag");
  });

  it("carries Vertex project and location", () => {
    const result = parseScanArgs(
      [
        "./out.json",
        "--provider",
        "vertexai",
        "--api-key",
        "k",
        "--vertex-project",
        "my-proj",
        "--vertex-location",
        "us-central1",
      ],
      {},
    );
    expect(result.vertexProject).toBe("my-proj");
    expect(result.vertexLocation).toBe("us-central1");
  });

  it("throws when the path is missing", () => {
    expect(() => parseScanArgs([], { OPENAI_API_KEY: "k" })).toThrow(/path/i);
  });

  it("throws on an invalid provider", () => {
    expect(() => parseScanArgs(["./out.json", "--provider", "nope"], {})).toThrow();
  });

  it("throws when no API key can be resolved", () => {
    expect(() => parseScanArgs(["./out.json"], {})).toThrow(/api key/i);
  });

  it("throws on extra positional arguments", () => {
    expect(() => parseScanArgs(["a", "b"], { OPENAI_API_KEY: "k" })).toThrow(/extra/i);
  });
});
