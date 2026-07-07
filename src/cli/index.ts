#!/usr/bin/env node

import * as p from "@clack/prompts";

import { GitHubService } from "../services/github.js";
import { formatError } from "../utils/error.js";
import { writeEventsToFiles } from "../utils/file-writer.js";
import { sortEvents } from "../utils/sort-events.js";
import { resolveGitHubToken } from "../utils/token.js";
import { parseCliArgs } from "./parse-args.js";

async function main(): Promise<void> {
  p.intro("ghevents");

  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    p.log.error(`Invalid arguments: ${formatError(error)}`);
    process.exit(1);
  }

  const s = p.spinner();

  try {
    s.start("Resolving GitHub token...");
    const token = await resolveGitHubToken(options.githubToken || undefined);
    s.stop("GitHub token resolved.");

    const service = new GitHubService({
      token,
      since: options.since,
      until: options.until,
      visibility: options.visibility,
    });

    s.start("Fetching events from GitHub...");
    const events = await service.fetchAllEvents();
    s.stop(`Fetched ${String(events.length)} events.`);

    const sorted = sortEvents({ events, order: options.order });

    s.start("Writing output...");
    const files = await writeEventsToFiles({
      events: sorted,
      output: options.output,
      maxLengthSize: options.maxLengthSize,
    });
    s.stop(`Written to ${files.join(", ")}`);

    p.outro(`Done! ${String(sorted.length)} events collected.`);
  } catch (error) {
    s.stop("Failed.");
    p.log.error(formatError(error));
    process.exit(1);
  }
}

main();
