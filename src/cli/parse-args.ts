import { parseArgs as nodeParseArgs } from "node:util";
import { z } from "zod/mini";

import type { CliOptions, Order, Visibility } from "../types/cli.js";

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
      output: { type: "string", default: "./ghevents.json" },
      since: { type: "string", default: getDefaultSince() },
      until: { type: "string", default: new Date().toISOString() },
      visibility: { type: "string", default: "public" },
      "max-length-size": { type: "string", default: "1M" },
      order: { type: "string", default: "asc" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

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
    order: values.order,
  });

  return {
    githubToken: parsed.githubToken ?? "",
    output: parsed.output,
    since: new Date(parsed.since),
    until: new Date(parsed.until),
    visibility: parsed.visibility as Visibility,
    maxLengthSize: parseSize(parsed.maxLengthSize),
    order: parsed.order as Order,
  };
}

function printHelp(): void {
  console.log(`
Usage: ghevents [options]

Options:
  --github-token      GitHub access token (env: GITHUB_TOKEN or "gh auth token")
  --output            Output file path (default: ./ghevents.json)
  --since             Start date in ISO8601 format (default: 2 weeks ago)
  --until             End date in ISO8601 format (default: now)
  --visibility        Repository visibility: public, private, all (default: public)
  --max-length-size   Max output file size: e.g., 1B, 2K, 2M (default: 1M)
  --order             Event order: asc, desc (default: asc)
  --help              Show this help message
`);
}
