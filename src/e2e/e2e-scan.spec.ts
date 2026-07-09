import { describe, expect, it } from "vitest";

import { runCli, useTestDirectory } from "./e2e-helper.js";

// The scan subcommand reports errors through @clack/prompts, which writes to
// stdout (not stderr) and exits non-zero. These cases all resolve before any
// LLM API call is made, so they need no network access or real API key.
describe("E2E: scan subcommand", () => {
  useTestDirectory();

  it("rejects a missing path", async () => {
    await expect(runCli(["scan", "--api-key", "k"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/path/i),
    });
  });

  it("rejects an invalid --provider value", async () => {
    await expect(
      runCli(["scan", "./ghactivities.json", "--provider", "bogus", "--api-key", "k"]),
    ).rejects.toMatchObject({
      stdout: expect.stringMatching(/provider|invalid/i),
    });
  });

  it("rejects when no API key can be resolved", async () => {
    // Force-unset the OpenAI key (the default provider) so resolution fails.
    await expect(
      runCli(["scan", "./ghactivities.json"], { env: { OPENAI_API_KEY: "" } }),
    ).rejects.toMatchObject({
      stdout: expect.stringMatching(/api key/i),
    });
  });

  it("fails when the activities file does not exist", async () => {
    await expect(runCli(["scan", "./does-not-exist.json", "--api-key", "k"])).rejects.toMatchObject(
      {
        stdout: expect.stringMatching(/does-not-exist|ENOENT|no such file/i),
      },
    );
  });
});
