import { parseArgs as nodeParseArgs } from "node:util";
import { z } from "zod/mini";

import type { CliOptions, Order, Visibility } from "../types/cli.js";

import packageJson from "../../package.json" with { type: "json" };
import { parseSize } from "../utils/parse-size.js";

const ArgsSchema = z.object({
  githubToken: z.optional(z.string()),
  output: z.string(),
  since: z.string().check(
    z.refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Invalid ISO8601 date format for --since",
    }),
  ),
  until: z.string().check(
    z.refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Invalid ISO8601 date format for --until",
    }),
  ),
  visibility: z.enum(["public", "private", "all"]),
  maxLengthSize: z.string().check(
    z.refine(
      (v) => {
        try {
          parseSize(v);
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          "Invalid size format for --max-length-size. Expected format: <number><unit> (e.g., 1B, 2K, 2M)",
      },
    ),
  ),
  maxTokens: z.optional(
    z.string().check(
      z.refine((v) => /^\d+$/.test(v.trim()) && Number(v.trim()) > 0, {
        message: "Invalid value for --max-tokens. Expected a positive integer (e.g., 1000).",
      }),
    ),
  ),
  order: z.enum(["asc", "desc"]),
});

function getDefaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString();
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = nodeParseArgs({
    args: argv,
    options: {
      "github-token": { type: "string" },
      output: { type: "string", default: "./ghactivities.json" },
      since: { type: "string", default: getDefaultSince() },
      until: { type: "string", default: new Date().toISOString() },
      visibility: { type: "string", default: "public" },
      "max-length-size": { type: "string", default: "1M" },
      "max-tokens": { type: "string" },
      order: { type: "string", default: "asc" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.version) {
    console.log(packageJson.version);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const parsed = ArgsSchema.parse({
    githubToken: values["github-token"],
    output: values.output,
    since: values.since,
    until: values.until,
    visibility: values.visibility,
    maxLengthSize: values["max-length-size"],
    maxTokens: values["max-tokens"],
    order: values.order,
  });

  return {
    githubToken: parsed.githubToken ?? "",
    output: parsed.output,
    since: new Date(parsed.since),
    until: new Date(parsed.until),
    visibility: parsed.visibility as Visibility,
    maxLengthSize: parseSize(parsed.maxLengthSize),
    maxTokens: parsed.maxTokens === undefined ? undefined : Number(parsed.maxTokens.trim()),
    order: parsed.order as Order,
  };
}

function printHelp(): void {
  console.log(`
Usage: ghactivities [options]
       ghactivities scan <dir or file> [scan options]

Options:
  --github-token      GitHub access token (env: GITHUB_TOKEN or "gh auth token")
  --output            Output file path (default: ./ghactivities.json)
  --since             Start date in ISO8601 format (default: 2 weeks ago)
  --until             End date in ISO8601 format (default: now)
  --visibility        Repository visibility: public, private, all (default: public)
  --max-length-size   Max output file size: e.g., 1B, 2K, 2M (default: 1M)
  --max-tokens        Max tokens per output file (js-tiktoken, cl100k_base); splits when exceeded
  --order             Event order: asc, desc (default: asc)
  --help              Show this help message
  --version           Show the version number

scan options (ghactivities scan <dir or file>):
  Scan collected activity JSON with an LLM and print a Markdown report.
  --provider          LLM provider: openai, google, vertexai, openrouter (default: openai)
  --model             Model id (default depends on the provider)
  --api-key           API key (env: OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY,
                      GOOGLE_VERTEX_API_KEY, or OPENROUTER_API_KEY by provider)
  --output            Write the report to this file instead of stdout
  --vertex-project    Google Vertex project (provider: vertexai)
  --vertex-location   Google Vertex location (provider: vertexai)
`);
}
