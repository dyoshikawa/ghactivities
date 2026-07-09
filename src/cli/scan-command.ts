import * as p from "@clack/prompts";
import { writeFile } from "node:fs/promises";

import { scanActivities } from "../services/scan.js";
import { formatError } from "../utils/error.js";
import { readActivities } from "../utils/read-activities.js";
import { parseScanArgs } from "./parse-scan-args.js";

export async function runScan(argv: string[]): Promise<void> {
  p.intro("ghactivities scan");

  let options;
  try {
    options = parseScanArgs(argv);
  } catch (error) {
    p.log.error(`Invalid arguments: ${formatError(error)}`);
    process.exit(1);
  }

  const s = p.spinner();

  try {
    s.start(`Reading activities from ${options.path}...`);
    const { files, content } = await readActivities({ path: options.path });
    s.stop(`Read ${String(files.length)} file(s).`);

    s.start(`Scanning with ${options.provider} (${options.model})...`);
    const report = await scanActivities({ options, content });
    s.stop("Scan complete.");

    if (options.output) {
      await writeFile(options.output, report, "utf-8");
      p.outro(`Report written to ${options.output}`);
    } else {
      p.log.message(report);
      p.outro("Done!");
    }
  } catch (error) {
    s.stop("Failed.");
    p.log.error(formatError(error));
    process.exit(1);
  }
}
