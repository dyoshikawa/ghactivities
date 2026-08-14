import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";

import type { ScanConfig } from "../types/scan.js";

import { countTokens } from "../utils/count-tokens.js";

// Conservative per-provider upper bounds on the scan input, counted with
// cl100k_base. These sit safely inside each provider's default-model context
// window (Gemini models take ~1M tokens; the others considerably less), so
// oversized input fails fast with an actionable message instead of a raw
// provider error after a full upload attempt.
export const MAX_SCAN_INPUT_TOKENS: Record<ScanConfig["provider"], number> = {
  openai: 200_000,
  google: 800_000,
  vertexai: 800_000,
  openrouter: 200_000,
};

const SYSTEM_PROMPT = `You are an assistant that reviews a developer's GitHub activity.
The user provides a JSON export of their activity (issues, issue comments, discussions,
discussion comments, pull requests, pull request conversation comments, pull request
review comments, commits, commit comments, gists, releases, repositories, and wiki page
edits). Commit events may include per-file diffs, and comment events may include an
editHistory field with prior revisions of the comment.
Analyze it and produce a concise report in Markdown that includes:
- A short overall summary of what the developer worked on.
- The main themes or projects, grouped by repository when useful.
- Notable pull requests, issues, or discussions worth highlighting.
- A "Risks and concerns" section listing anything that warrants the developer's
  attention, each rated with a severity (critical / high / medium / low) — for example
  potential secrets, credentials, or tokens appearing in code, diffs, comments, or
  gists; customer names, client project details, or other internal/confidential
  business information exposed in public repositories; sensitive information visible
  in comment edit histories; or other content that may need follow-up or removal.
  Each event carries its repository's visibility — treat exposure in PUBLIC
  repositories as more severe than the same content in private ones. If there is
  nothing to report, state that explicitly.
Be factual and only rely on the provided data.`;

/** Build a Vercel AI SDK language model for the configured provider. */
export function buildModel(params: {
  provider: ScanConfig["provider"];
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
  config: ScanConfig;
  content: string;
}): Promise<string> {
  const { config, content } = params;

  const maxInputTokens = MAX_SCAN_INPUT_TOKENS[config.provider];
  const inputTokens = countTokens(content);
  if (inputTokens > maxInputTokens) {
    throw new Error(
      `Scan input is ~${String(inputTokens)} tokens, which exceeds the ${String(maxInputTokens)}-token limit for provider ${config.provider}. ` +
        `Narrow the collection range (--since/--until) to reduce the input.`,
    );
  }

  const model = buildModel({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    vertexProject: config.vertexProject,
    vertexLocation: config.vertexLocation,
  });

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: `Here is the GitHub activity to analyze:\n\n${content}`,
  });

  return text;
}
