---
root: false
targets: ["*"]
description: "When you write tests, must follow these guidelines."
globs: ["**/*.test.ts", "src/e2e/**/*.spec.ts"]
---

# Testing Guidelines

## Unit tests

- Unit test files use the `*.test.ts` suffix and are placed next to the implementation (the co-location pattern). For example, the test for `src/cli/parse-args.ts` is `src/cli/parse-args.test.ts`.
- Run unit tests with `pnpm run test` (Vitest). They must not access the network or write to the filesystem outside a temporary directory.

## E2E tests

- E2E test files use the `*.spec.ts` suffix and live under `src/e2e/`. Run them with `pnpm run test:e2e`, which uses the separate `vitest.e2e.config.ts` config.
- E2E tests invoke the real CLI through the helpers in `src/e2e/e2e-helper.ts`:
  - `runCli(args)` executes the CLI and resolves with `{ stdout, stderr }`; on a non-zero exit it rejects with an error carrying the same `stdout`/`stderr` fields.
  - `useTestDirectory()` creates an isolated temp directory and `process.chdir()`s into it for each test, then restores and removes it afterwards.
- By default the E2E suite runs the TypeScript source via `tsx`. Set the `GHACTIVITIES_CMD` environment variable (e.g. `GHACTIVITIES_CMD=dist/index.js`) to run the same specs against the built bundle in `dist/`. CI runs the suite both ways so the shipped artifact is exercised end-to-end.
- Because `useTestDirectory()` relies on `process.chdir()` (a process-global operation), E2E tests must run serially. This is enforced by `maxWorkers: 1` and `fileParallelism: false` in `vitest.e2e.config.ts` — do not remove them.
- The CLI reports argument-validation errors through `@clack/prompts`, which writes to **stdout** (not stderr) and exits non-zero. Assert against the rejected error's `stdout`, not `stderr`.
- E2E tests must not depend on network access or a real `GITHUB_TOKEN`. Cover only behavior that resolves before any GitHub API call is made, such as `--version`, `--help`, and argument validation.
