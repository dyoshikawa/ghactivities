import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ReadActivitiesResult {
  /** The files that were read, in the order they were concatenated. */
  files: string[];
  /** The concatenated raw contents of every file that was read. */
  content: string;
}

/**
 * Read activity data from a single file or from every `*.json` file inside a
 * directory. The raw file contents are concatenated so they can be handed to an
 * LLM for scanning.
 */
export async function readActivities(params: { path: string }): Promise<ReadActivitiesResult> {
  const { path } = params;
  const stats = await stat(path);

  const files = stats.isDirectory() ? await listJsonFiles({ dir: path }) : [path];
  if (files.length === 0) {
    throw new Error(`No .json files found in directory: ${path}`);
  }

  const parts = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, "utf-8");
      return `# ${file}\n${text}`;
    }),
  );

  return { files, content: parts.join("\n\n") };
}

async function listJsonFiles(params: { dir: string }): Promise<string[]> {
  const { dir } = params;
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name))
    .toSorted((a, b) => a.localeCompare(b));
}
