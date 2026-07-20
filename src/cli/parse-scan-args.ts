import { parseArgs as nodeParseArgs } from "node:util";
import { z } from "zod/mini";

import type { ScanConfig, ScanOptions, ScanProvider } from "../types/scan.js";

const ProviderSchema = z.enum(["openai", "google", "vertexai", "openrouter"]);

const DEFAULT_MODELS: Record<ScanProvider, string> = {
  openai: "gpt-5.6-luna",
  google: "gemini-3.1-flash-lite",
  vertexai: "gemini-3.1-flash-lite",
  openrouter: "openai/gpt-5.6-luna",
};

// Provider-specific environment variables consulted, in order, when
// --api-key is not passed.
const API_KEY_ENV_VARS: Record<ScanProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
  vertexai: ["GOOGLE_VERTEX_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

function resolveApiKey(params: {
  provider: ScanProvider;
  apiKeyOption: string | undefined;
  env: NodeJS.ProcessEnv;
}): string {
  const { provider, apiKeyOption, env } = params;
  if (apiKeyOption) {
    return apiKeyOption;
  }
  for (const name of API_KEY_ENV_VARS[provider]) {
    const value = env[name];
    if (value) {
      return value;
    }
  }
  const names = API_KEY_ENV_VARS[provider].join(" or ");
  throw new Error(`Missing API key for provider "${provider}". Pass --api-key or set ${names}.`);
}

/**
 * Resolve the shared scan configuration (provider, model, API key, output, and
 * Vertex settings) from raw option values. Used by both the `scan` subcommand
 * and the collect command's `--scan` option.
 */
export function resolveScanConfig(params: {
  provider: string | undefined;
  model: string | undefined;
  apiKey: string | undefined;
  output: string | undefined;
  vertexProject: string | undefined;
  vertexLocation: string | undefined;
  env?: NodeJS.ProcessEnv;
}): ScanConfig {
  const { provider: providerOption, model, apiKey, output, vertexProject, vertexLocation } = params;
  const env = params.env ?? process.env;

  const provider = ProviderSchema.parse(providerOption ?? "openai") as ScanProvider;

  return {
    provider,
    model: model ?? DEFAULT_MODELS[provider],
    apiKey: resolveApiKey({ provider, apiKeyOption: apiKey, env }),
    output,
    vertexProject,
    vertexLocation,
  };
}

export function parseScanArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ScanOptions {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options: {
      provider: { type: "string", default: "openai" },
      model: { type: "string" },
      "api-key": { type: "string" },
      output: { type: "string" },
      "vertex-project": { type: "string" },
      "vertex-location": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  const path = positionals[0];
  if (path === undefined) {
    throw new Error("Missing path. Usage: ghactivities scan <dir or file> [options]");
  }
  if (positionals.length > 1) {
    throw new Error(`Unexpected extra arguments: ${positionals.slice(1).join(", ")}`);
  }

  const config = resolveScanConfig({
    provider: values.provider,
    model: values.model,
    apiKey: values["api-key"],
    output: values.output,
    vertexProject: values["vertex-project"],
    vertexLocation: values["vertex-location"],
    env,
  });

  return { path, ...config };
}
