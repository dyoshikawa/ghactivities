import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach } from "vitest";

const execFileAsync = promisify(execFile);

const originalCwd = process.cwd();
const tsxPath = join(originalCwd, "node_modules", ".bin", "tsx");
const cliPath = join(originalCwd, "src", "cli", "index.ts");

// By default the E2E suite runs the TypeScript source through tsx. When
// GHACTIVITIES_CMD is set (CI runs the suite a second time this way), the same
// specs run against the built bundle in dist/. Validate the path so a typo
// fails loudly instead of silently testing the wrong thing, and run the bundle
// via the current Node binary for portability rather than relying on the
// executable bit / shebang.
function resolveRunner(): { cmd: string; baseArgs: string[] } {
  const raw = process.env.GHACTIVITIES_CMD;
  if (!raw) {
    return { cmd: tsxPath, baseArgs: [cliPath] };
  }
  const resolved = resolve(originalCwd, raw);
  const parts = resolved.split(sep);
  const valid = parts.at(-2) === "dist" && /^index\.(?:js|cjs)$/.test(parts.at(-1) ?? "");
  if (!valid) {
    throw new Error(
      `Invalid GHACTIVITIES_CMD: must point at 'dist/index.js' or 'dist/index.cjs': ${raw}`,
    );
  }
  return { cmd: process.execPath, baseArgs: [resolved] };
}

const { cmd: ghCmd, baseArgs: ghArgs } = resolveRunner();

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
