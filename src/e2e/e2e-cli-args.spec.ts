import { describe, expect, it } from "vitest";

import { runCli, useTestDirectory } from "./e2e-helper.js";

// The CLI reports argument-validation errors through @clack/prompts, which
// writes to stdout (not stderr) and exits with a non-zero code. So we assert
// against the rejected error's stdout.
describe("E2E: CLI option validation", () => {
  useTestDirectory();

  it("rejects an invalid --order value", async () => {
    await expect(runCli(["--order", "sideways"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/order/i),
    });
  });

  it("rejects an invalid --visibility value", async () => {
    await expect(runCli(["--visibility", "secret"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/visibility/i),
    });
  });

  it("rejects a malformed --max-length-size value", async () => {
    await expect(runCli(["--max-length-size", "abc"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/max-length-size|size/i),
    });
  });

  it("rejects a malformed --since date", async () => {
    await expect(runCli(["--since", "not-a-date"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/since/i),
    });
  });

  it("rejects a malformed --until date", async () => {
    await expect(runCli(["--until", "not-a-date"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/until/i),
    });
  });

  it("rejects an unknown option", async () => {
    await expect(runCli(["--nope"])).rejects.toMatchObject({
      stdout: expect.stringMatching(/unknown option/i),
    });
  });
});
