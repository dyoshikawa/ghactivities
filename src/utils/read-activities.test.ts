import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readActivities } from "./read-activities.js";

describe("readActivities", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "read-activities-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a single file", async () => {
    const file = join(dir, "ghactivities.json");
    await writeFile(file, '[{"type":"Issue"}]', "utf-8");

    const result = await readActivities({ path: file });
    expect(result.files).toEqual([file]);
    expect(result.content).toContain('"type":"Issue"');
  });

  it("reads every .json file in a directory, sorted", async () => {
    await writeFile(join(dir, "b.json"), '["b"]', "utf-8");
    await writeFile(join(dir, "a.json"), '["a"]', "utf-8");
    await writeFile(join(dir, "note.txt"), "ignored", "utf-8");

    const result = await readActivities({ path: dir });
    expect(result.files).toEqual([join(dir, "a.json"), join(dir, "b.json")]);
    expect(result.content).toContain('["a"]');
    expect(result.content).toContain('["b"]');
    expect(result.content).not.toContain("ignored");
  });

  it("throws when a directory has no .json files", async () => {
    await writeFile(join(dir, "note.txt"), "x", "utf-8");
    await expect(readActivities({ path: dir })).rejects.toThrow(/no .json files/i);
  });

  it("rejects when the path does not exist", async () => {
    await expect(readActivities({ path: join(dir, "missing.json") })).rejects.toThrow();
  });
});
