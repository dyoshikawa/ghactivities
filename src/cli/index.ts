#!/usr/bin/env node

import * as p from "@clack/prompts";

import { GitHubService } from "../services/github.js";
import { scanActivities } from "../services/scan.js";
import { formatError } from "../utils/error.js";
import { writeEventsToFiles } from "../utils/file-writer.js";
import { sortEvents } from "../utils/sort-events.js";
import { resolveGitHubToken } from "../utils/token.js";
import { emitScanReport } from "./emit-scan-report.js";
import { parseCliArgs } from "./parse-args.js";
import { runScan } from "./scan-command.js";

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === "scan") {
    await runScan(rest);
    return;
  }

  p.intro("ghactivities");

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
      maxTokens: options.maxTokens,
    });
    s.stop(`Written to ${files.join(", ")}`);

    if (options.scan) {
      s.start(`Scanning with ${options.scan.provider} (${options.scan.model})...`);
      const content = JSON.stringify(sorted, null, 2);
      const report = await scanActivities({ config: options.scan, content });
      s.stop("Scan complete.");
      await emitScanReport({ report, output: options.scan.output });
    }

    p.outro(`Done! ${String(sorted.length)} events collected.`);
  } catch (error) {
    s.stop("Failed.");
    p.log.error(formatError(error));
    process.exit(1);
  }
}

main();
