import type { ScanConfig } from "./scan.js";

export type Visibility = "public" | "private" | "all";
export type Order = "asc" | "desc";

export interface CliOptions {
  githubToken: string;
  /** When set (via --user), activity of this user is collected instead of the authenticated user's. */
  user?: string | undefined;
  output: string;
  since: Date;
  until: Date;
  visibility: Visibility;
  maxLengthSize: number;
  maxTokens?: number | undefined;
  order: Order;
  /** When set (via --scan), the collected output is scanned with an LLM. */
  scan?: ScanConfig | undefined;
}
