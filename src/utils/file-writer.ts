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
  let currentChunk: GitHubEvent[] = [];
  let fileIndex = 1;

  for (const event of events) {
    currentChunk.push(event);
    const chunkJson = JSON.stringify(currentChunk, null, 2);

    if (exceedsLimit({ json: chunkJson, maxLengthSize, maxTokens })) {
      if (currentChunk.length === 1) {
        const filePath = join(dir, `${base}_${String(fileIndex)}${ext}`);
        await writeFile(filePath, chunkJson, "utf-8");
        files.push(filePath);
        fileIndex++;
        currentChunk = [];
      } else {
        currentChunk.pop();
        const prevJson = JSON.stringify(currentChunk, null, 2);
        const filePath = join(dir, `${base}_${String(fileIndex)}${ext}`);
        await writeFile(filePath, prevJson, "utf-8");
        files.push(filePath);
        fileIndex++;
        currentChunk = [event];
      }
    }
  }

  if (currentChunk.length > 0) {
    const filePath = join(dir, `${base}_${String(fileIndex)}${ext}`);
    const chunkJson = JSON.stringify(currentChunk, null, 2);
    await writeFile(filePath, chunkJson, "utf-8");
    files.push(filePath);
  }

  return files;
}
