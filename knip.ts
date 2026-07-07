import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/cli/index.ts"],
  project: ["src/**/*.ts"],
  ignoreBinaries: [
    // Invoked as an external CLI (`gh auth token`) via child_process.
    "gh",
  ],
  ignoreDependencies: [
    // Referenced by the secretlint config, not imported from source.
    "@secretlint/secretlint-rule-preset-recommend",
    // Executed at runtime via node_modules/.bin/tsx to run the E2E CLI tests.
    "tsx",
  ],
};

export default config;
