import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";

import type { ScanOptions } from "../types/scan.js";

const SYSTEM_PROMPT = `You are an assistant that reviews a developer's GitHub activity.
The user provides a JSON export of their activity (issues, issue comments, discussions,
discussion comments, pull requests, pull request comments, and commits).
Analyze it and produce a concise report in Markdown that includes:
- A short overall summary of what the developer worked on.
- The main themes or projects, grouped by repository when useful.
- Notable pull requests, issues, or discussions worth highlighting.
Be factual and only rely on the provided data.`;

/** Build a Vercel AI SDK language model for the configured provider. */
export function buildModel(params: {
  provider: ScanOptions["provider"];
  model: string;
  apiKey: string;
  vertexProject?: string | undefined;
  vertexLocation?: string | undefined;
}): LanguageModel {
  const { provider, model, apiKey, vertexProject, vertexLocation } = params;

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "vertexai": {
      const settings: Parameters<typeof createVertex>[0] = { apiKey };
      if (vertexProject !== undefined) {
        settings.project = vertexProject;
      }
      if (vertexLocation !== undefined) {
        settings.location = vertexLocation;
      }
      return createVertex(settings)(model);
    }
    case "openrouter":
      return createOpenRouter({ apiKey })(model);
  }
}

/** Scan the given activity content with the configured LLM and return a report. */
export async function scanActivities(params: {
  options: ScanOptions;
  content: string;
}): Promise<string> {
  const { options, content } = params;

  const model = buildModel({
    provider: options.provider,
    model: options.model,
    apiKey: options.apiKey,
    vertexProject: options.vertexProject,
    vertexLocation: options.vertexLocation,
  });

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: `Here is the GitHub activity to analyze:\n\n${content}`,
  });

  return text;
}
