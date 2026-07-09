import * as p from "@clack/prompts";
import { writeFile } from "node:fs/promises";

/** Write the scan report to a file when `output` is set, otherwise print it. */
export async function emitScanReport(params: {
  report: string;
  output?: string | undefined;
}): Promise<void> {
  const { report, output } = params;
  if (output) {
    await writeFile(output, report, "utf-8");
    p.log.success(`Report written to ${output}`);
  } else {
    p.log.message(report);
  }
}
