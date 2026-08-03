import { describe, expect, it } from "vitest";

import type { ScanProvider } from "../types/scan.js";

import { buildModel, MAX_SCAN_INPUT_TOKENS, scanActivities } from "./scan.js";

describe("buildModel", () => {
  const cases: { provider: ScanProvider; model: string }[] = [
    { provider: "openai", model: "gpt-5.6-luna" },
    { provider: "google", model: "gemini-3.1-flash-lite" },
    { provider: "vertexai", model: "gemini-3.1-flash-lite" },
    { provider: "openrouter", model: "openai/gpt-5.6-luna" },
  ];

  for (const { provider, model } of cases) {
    it(`builds a language model for ${provider}`, () => {
      const result = buildModel({
        provider,
        model,
        apiKey: "test-key",
        vertexProject: "proj",
        vertexLocation: "us-central1",
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  }
});

describe("scanActivities input guard", () => {
  it("fails fast with an actionable message when the input exceeds the token limit", async () => {
    // " token" encodes to one cl100k token, so this comfortably exceeds the cap.
    const oversized = " token".repeat(MAX_SCAN_INPUT_TOKENS.openai + 1000);

    await expect(
      scanActivities({
        config: {
          provider: "openai",
          model: "gpt-5.6-luna",
          apiKey: "test-key",
        },
        content: oversized,
      }),
    ).rejects.toThrow(/exceeds the 200000-token limit for provider openai.*--since/);
  });

  it("allows Gemini providers a larger input budget than the default", () => {
    expect(MAX_SCAN_INPUT_TOKENS.google).toBeGreaterThan(MAX_SCAN_INPUT_TOKENS.openai);
    expect(MAX_SCAN_INPUT_TOKENS.vertexai).toBe(MAX_SCAN_INPUT_TOKENS.google);
  });
});
