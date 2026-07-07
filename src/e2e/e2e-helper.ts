import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach } from "vitest";

const execFileAsync = promisify(execFile);

const originalCwd = process.cwd();
const tsxPath = join(originalCwd, "node_modules", ".bin", "tsx");
const cliPath = join(originalCwd, "src", "cli", "index.ts");

// If GHACTIVITIES_CMD points at a built binary, run it; otherwise run the
// source directly via tsx.
const ghCmd = process.env.GHACTIVITIES_CMD
  ? join(originalCwd, process.env.GHACTIVITIES_CMD)
  : tsxPath;
const ghArgs = process.env.GHACTIVITIES_CMD ? [] : [cliPath];

/** Run the ghactivities CLI with args, returning { stdout, stderr }. */
export function runCli(args: string[], opts: { cwd?: string } = {}) {
  return execFileAsync(ghCmd, [...ghArgs, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env },
  });
}

/** Provide an isolated temp working directory per test. */
export function useTestDirectory() {
  let testDir = "";
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "ghactivities-e2e-"));
    process.chdir(testDir);
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });
  return { getTestDir: () => testDir };
}
