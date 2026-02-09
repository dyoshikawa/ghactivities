export type Visibility = "public" | "private" | "all";
export type Order = "asc" | "desc";

export interface CliOptions {
  githubToken: string;
  output: string;
  since: Date;
  until: Date;
  visibility: Visibility;
  maxLengthSize: number;
  order: Order;
}
