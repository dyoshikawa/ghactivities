import { describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { runCli } from "./e2e-helper.js";

describe("E2E: version & help", () => {
  it("prints the package version with --version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout).toContain(packageJson.version);
  });

  it("prints usage with --help", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout.toLowerCase()).toContain("usage");
  });
});
