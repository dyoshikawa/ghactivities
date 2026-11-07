import { writeFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";

import * as p from "@clack/prompts";

// C0 controls other than tab and newline, DEL and C1 controls. A lone C1 byte
// such as U+009B (CSI) is honored by some terminals as an escape introducer.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Remove terminal escape sequences and control characters from model output.
 * The report is written by an LLM that read GitHub text authored by others,
 * so it must not be able to drive the operator's terminal (OSC titles, screen
 * clears, spoofed hyperlinks).
 */
export function sanitizeScanReport(report: string): string {
  return stripVTControlCharacters(report.replaceAll("\r\n", "\n")).replace(CONTROL_CHARACTERS, "");
}

/** Write the scan report to a file when `output` is set, otherwise print it. */
export async function emitScanReport(params: {
  report: string;
  output?: string | undefined;
}): Promise<void> {
  const { output } = params;
  const report = sanitizeScanReport(params.report);
  if (output) {
    await writeFile(output, report, "utf-8");
    p.log.success(`Report written to ${output}`);
  } else {
    p.log.message(report);
  }
}
