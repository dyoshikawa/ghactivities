import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as p from "@clack/prompts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { emitScanReport, sanitizeScanReport } from "./emit-scan-report.js";

// Controls that must never reach the terminal: ESC, BEL, CR, the C1 range and
// bidi overrides/isolates.
// oxlint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

const MALICIOUS =
  "# Report\n\x1b]0;pwned\x07Title\n\x1b[2J cleared\n\u009b2Jc1\n" +
  "\x1b]8;;https://evil.example\x1b\\link\x1b]8;;\x1b\\\r\nrisk\r over\twritten\x00\n" +
  "Risk: \u202enon\u202c\u2066e\u2069\u200b\ufeff!";

const EXPECTED = "# Report\nTitle\n cleared\nc1\nlink\nrisk\n over\twritten\nRisk: none!";

describe("sanitizeScanReport", () => {
  it("strips escape sequences and control characters but keeps newlines and tabs", () => {
    const sanitized = sanitizeScanReport(MALICIOUS);
    expect(sanitized).not.toMatch(FORBIDDEN);
    expect(sanitized).toBe(EXPECTED);
  });

  it("leaves ordinary text, including non-ASCII, unchanged", () => {
    const report = "## Risks\n- 日本語 ✓ 👨\u200d👩\u200d👧\n\t- item";
    expect(sanitizeScanReport(report)).toBe(report);
  });
});

describe("emitScanReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints a sanitized report to the terminal", async () => {
    const message = vi.spyOn(p.log, "message").mockImplementation(() => {});
    await emitScanReport({ report: MALICIOUS });
    expect(message).toHaveBeenCalledTimes(1);
    expect(message.mock.calls[0]?.[0]).toBe(EXPECTED);
  });

  it("writes a sanitized report to the output file", async () => {
    vi.spyOn(p.log, "success").mockImplementation(() => {});
    const dir = await mkdtemp(join(tmpdir(), "ghactivities-report-"));
    try {
      const output = join(dir, "report.md");
      await emitScanReport({ report: MALICIOUS, output });
      expect(await readFile(output, "utf-8")).toBe(EXPECTED);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
