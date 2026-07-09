import * as p from "@clack/prompts";

import { scanActivities } from "../services/scan.js";
import { formatError } from "../utils/error.js";
import { readActivities } from "../utils/read-activities.js";
import { emitScanReport } from "./emit-scan-report.js";
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
    const report = await scanActivities({ config: options, content });
    s.stop("Scan complete.");

    await emitScanReport({ report, output: options.output });
    p.outro("Done!");
  } catch (error) {
    s.stop("Failed.");
    p.log.error(formatError(error));
    process.exit(1);
  }
}
