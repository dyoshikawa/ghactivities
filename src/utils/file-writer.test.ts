import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { GitHubEvent } from "../types/events.js";
import { writeEventsToFiles } from "./file-writer.js";

const makeEvent = (id: number): GitHubEvent => ({
  type: "Issue",
  createdAt: `2024-01-0${String(id)}T00:00:00Z`,
  title: `Issue ${String(id)}`,
  url: `https://github.com/owner/repo/issues/${String(id)}`,
  body: `Body of issue ${String(id)}`,
  repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
});

describe("writeEventsToFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ghactivities-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes a single file when within size limit", async () => {
    const events = [makeEvent(1)];
    const output = join(tempDir, "events.json");
    const files = await writeEventsToFiles({
      events,
      output,
      maxLengthSize: 1024 * 1024,
    });
    expect(files).toEqual([output]);
    const content = await readFile(output, "utf-8");
    expect(JSON.parse(content)).toEqual(events);
  });

  it("splits into multiple files when exceeding size limit", async () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const output = join(tempDir, "events.json");
    const singleEventSize = Buffer.byteLength(JSON.stringify([makeEvent(1)], null, 2), "utf-8");

    const files = await writeEventsToFiles({
      events,
      output,
      maxLengthSize: singleEventSize + 10,
    });

    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const parsed = JSON.parse(content) as GitHubEvent[];
      expect(Array.isArray(parsed)).toBe(true);
    }

    expect(files[0]).toContain("events_1.json");
  });

  it("splits into multiple files when exceeding token limit", async () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const output = join(tempDir, "events.json");

    const files = await writeEventsToFiles({
      events,
      output,
      maxLengthSize: 1024 * 1024,
      maxTokens: 30,
    });

    expect(files.length).toBeGreaterThan(1);
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const parsed = JSON.parse(content) as GitHubEvent[];
      expect(Array.isArray(parsed)).toBe(true);
    }
    expect(files[0]).toContain("events_1.json");
  });

  it("writes a single file when within both size and token limits", async () => {
    const events = [makeEvent(1)];
    const output = join(tempDir, "events.json");
    const files = await writeEventsToFiles({
      events,
      output,
      maxLengthSize: 1024 * 1024,
      maxTokens: 1_000_000,
    });
    expect(files).toEqual([output]);
  });

  it("keeps an oversized event in its own file and numbers the chunks in order", async () => {
    const huge: GitHubEvent = {
      type: "Issue",
      createdAt: "2024-01-02T00:00:00Z",
      title: "Huge issue",
      url: "https://github.com/owner/repo/issues/2",
      body: "x".repeat(2000),
      repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
    };
    const events = [huge, makeEvent(1), huge, makeEvent(3), makeEvent(4)];
    const output = join(tempDir, "events.json");
    const pairSize = Buffer.byteLength(
      JSON.stringify([makeEvent(3), makeEvent(4)], null, 2),
      "utf-8",
    );

    const files = await writeEventsToFiles({ events, output, maxLengthSize: pairSize });

    expect(files).toEqual(
      [1, 2, 3, 4].map((index) => join(tempDir, `events_${String(index)}.json`)),
    );
    const chunks = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(file, "utf-8")) as GitHubEvent[]),
    );
    expect(chunks).toEqual([[huge], [makeEvent(1)], [huge], [makeEvent(3), makeEvent(4)]]);
    expect(await readFile(files[3]!, "utf-8")).toBe(
      JSON.stringify([makeEvent(3), makeEvent(4)], null, 2),
    );
  });

  it("handles empty events array", async () => {
    const output = join(tempDir, "events.json");
    const files = await writeEventsToFiles({
      events: [],
      output,
      maxLengthSize: 1024,
    });
    expect(files).toEqual([output]);
    const content = await readFile(output, "utf-8");
    expect(JSON.parse(content)).toEqual([]);
  });
});
