import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    tempDir = await mkdtemp(join(tmpdir(), "ghevents-test-"));
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
