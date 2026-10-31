import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/cli/index.ts"],
  project: ["src/**/*.ts"],
  ignoreBinaries: [
    // Invoked as an external CLI (`gh auth token`) via child_process.
    "gh",
  ],
  // `vp test` is not a command knip parses, so name both test configs here
  // (the E2E one was found through the `vitest --config` script before).
  vitest: {
    config: ["vitest.config.ts", "vitest.e2e.config.ts"],
  },
  ignoreDependencies: [
    // Referenced by the secretlint config, not imported from source.
    "@secretlint/secretlint-rule-preset-recommend",
    // Executed at runtime via node_modules/.bin/tsx to run the E2E CLI tests.
    "tsx",
    // Run by `vp fmt` / `vp lint`, which look for the project's own copies
    // first (see the catalog in pnpm-workspace.yaml).
    "oxfmt",
    "oxlint",
  ],
};

export default config;
