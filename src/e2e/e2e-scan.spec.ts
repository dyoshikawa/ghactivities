import { writeFile } from "node:fs/promises";
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

  it("rejects an input larger than the provider's token limit before any API call", async () => {
    // " token" encodes to one cl100k token; 210k of them exceed openai's
    // 200k-token scan input limit.
    await writeFile("./huge.json", JSON.stringify([" token".repeat(210_000)]), "utf-8");

    await expect(runCli(["scan", "./huge.json", "--api-key", "k"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/exceeds the 200000-token limit/),
    });
  });

  it("rejects --scan on the collect command with an invalid provider", async () => {
    await expect(runCli(["--scan", "--provider", "bogus", "--api-key", "k"])).rejects.toMatchObject(
      {
        stdout: expect.stringMatching(/provider|invalid/i),
      },
    );
  });

  it("rejects --scan on the collect command with no resolvable API key", async () => {
    await expect(runCli(["--scan"], { env: { OPENAI_API_KEY: "" } })).rejects.toMatchObject({
      stdout: expect.stringMatching(/api key/i),
    });
  });
});
