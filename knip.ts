import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.ts"],
  ignoreBinaries: [
    // Invoked as an external CLI (`gh auth token`) via child_process.
    "gh",
  ],
  ignoreDependencies: [
    // Referenced by the secretlint config, not imported from source.
    "@secretlint/secretlint-rule-preset-recommend",
  ],
};

export default config;
