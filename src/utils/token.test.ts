import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveGitHubToken } from "./token.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("resolveGitHubToken", () => {
  const originalEnv = process.env["GITHUB_TOKEN"];

  beforeEach(() => {
    delete process.env["GITHUB_TOKEN"];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["GITHUB_TOKEN"] = originalEnv;
    } else {
      delete process.env["GITHUB_TOKEN"];
    }
    vi.restoreAllMocks();
  });

  it("returns explicit token when provided", async () => {
    const result = await resolveGitHubToken("my-token");
    expect(result).toBe("my-token");
  });

  it("returns environment variable token when no explicit token", async () => {
    process.env["GITHUB_TOKEN"] = "env-token";
    const result = await resolveGitHubToken();
    expect(result).toBe("env-token");
  });

  it("falls back to gh auth token", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], callback: Function) => {
        callback(null, "gh-token\n", "");
        return undefined;
      },
    );

    const result = await resolveGitHubToken();
    expect(result).toBe("gh-token");
  });

  it("throws when gh auth token fails", async () => {
    const { execFile } = await import("node:child_process");
    const mockedExecFile = vi.mocked(execFile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation(
      (_cmd: string, _args: string[], callback: Function) => {
        callback(new Error("command not found"), "", "command not found");
        return undefined;
      },
    );

    await expect(resolveGitHubToken()).rejects.toThrow("Failed to get GitHub token");
  });
});
