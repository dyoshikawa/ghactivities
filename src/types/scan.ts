export type ScanProvider = "openai" | "google" | "vertexai" | "openrouter";

export interface ScanConfig {
  provider: ScanProvider;
  model: string;
  /** Resolved API key (from --api-key or a provider-specific env var). */
  apiKey: string;
  /** When set, the report is written here; otherwise it is printed to stdout. */
  output?: string | undefined;
  /** Google Vertex project (only used when provider is "vertexai"). */
  vertexProject?: string | undefined;
  /** Google Vertex location (only used when provider is "vertexai"). */
  vertexLocation?: string | undefined;
}

export interface ScanOptions extends ScanConfig {
  /** Path to an activities JSON file or a directory containing them. */
  path: string;
}
