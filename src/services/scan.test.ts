import { describe, expect, it } from "vitest";

import type { ScanProvider } from "../types/scan.js";

import { buildModel } from "./scan.js";

describe("buildModel", () => {
  const cases: { provider: ScanProvider; model: string }[] = [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-2.0-flash" },
    { provider: "vertexai", model: "gemini-2.0-flash" },
    { provider: "openrouter", model: "openai/gpt-4o-mini" },
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
