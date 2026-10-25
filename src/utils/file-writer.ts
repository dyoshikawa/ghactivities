import { writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import type { GitHubEvent } from "../types/events.js";

import { countTokens } from "./count-tokens.js";

function exceedsLimit(params: {
  json: string;
  maxLengthSize: number;
  maxTokens?: number | undefined;
}): boolean {
  const { json, maxLengthSize, maxTokens } = params;
  if (Buffer.byteLength(json, "utf-8") > maxLengthSize) {
    return true;
  }
  if (maxTokens !== undefined && countTokens(json) > maxTokens) {
    return true;
  }
  return false;
}

export async function writeEventsToFiles(params: {
  events: GitHubEvent[];
  output: string;
  maxLengthSize: number;
  maxTokens?: number | undefined;
}): Promise<string[]> {
  const { events, output, maxLengthSize, maxTokens } = params;
  const json = JSON.stringify(events, null, 2);

  if (!exceedsLimit({ json, maxLengthSize, maxTokens })) {
    await writeFile(output, json, "utf-8");
    return [output];
  }

  return splitAndWriteFiles({ events, output, maxLengthSize, maxTokens });
}

async function splitAndWriteFiles(params: {
  events: GitHubEvent[];
  output: string;
  maxLengthSize: number;
  maxTokens?: number | undefined;
}): Promise<string[]> {
  const { events, output, maxLengthSize, maxTokens } = params;
  const dir = dirname(output);
  const ext = extname(output);
  const base = basename(output, ext);

  const files: string[] = [];
  const writeChunk = async (json: string): Promise<void> => {
    const filePath = join(dir, `${base}_${String(files.length + 1)}${ext}`);
    await writeFile(filePath, json, "utf-8");
    files.push(filePath);
  };

  let currentChunk: GitHubEvent[] = [];
  for (const event of events) {
    currentChunk.push(event);
    const chunkJson = JSON.stringify(currentChunk, null, 2);
    if (!exceedsLimit({ json: chunkJson, maxLengthSize, maxTokens })) continue;

    if (currentChunk.length === 1) {
      // A single event larger than the limit still gets a file of its own.
      await writeChunk(chunkJson);
      currentChunk = [];
    } else {
      currentChunk.pop();
      await writeChunk(JSON.stringify(currentChunk, null, 2));
      currentChunk = [event];
    }
  }

  if (currentChunk.length > 0) {
    await writeChunk(JSON.stringify(currentChunk, null, 2));
  }

  return files;
}
