import { describe, expect, it } from "vitest";

import type { ScanProvider } from "../types/scan.js";

import { buildModel } from "./scan.js";

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
