---
root: false
targets: ["*"]
description: "When you add or change features, must follow these guidelines."
---

# Guidelines for Adding or Modifying Features

- Keep `README.md` synchronized with the implemented functionality. In particular, keep the **Features**, **Options**, **Output**, and **Notes** sections consistent with the actual behavior.
- When you add or change a CLI option:
  - Update the argument schema and parser in `src/cli/parse-args.ts` (the `zod/mini` schema and the argument parsing config).
  - Update the `--help` text rendered by the CLI so it lists the option.
  - Update the **Options** table in `README.md`.
- When you add or change an event type (Issue, IssueComment, Discussion, DiscussionComment, PullRequest, PullRequestComment, Commit):
  - Update the type definitions in `src/types/events.ts`.
  - Update the fetching logic in `src/services/github.ts` and the GraphQL/REST queries in `src/services/github-queries.ts`.
  - Update the **Features** list and the **Output** example in `README.md`.
- Add or update tests for the change: unit tests (`*.test.ts`, co-located with the implementation) and, when the change affects CLI behavior that resolves before any GitHub API call, an E2E test under `src/e2e/`.
- Run `pnpm cicheck` before committing to verify code style, type safety, tests, spelling, and secrets.
