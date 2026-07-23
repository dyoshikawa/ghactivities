---
name: stabilize-cicheck
description: >-
  Stabilize the current change set by analyzing the diff, running pnpm
  cicheck:code, fixing code or tests until checks pass, and opening or updating
  a PR. Use when asked to fix CI, stabilize tests, or make cicheck pass.
targets:
  - "*"
---

1. call diff-analyzer subagent to get the summary of the changes.
2. Run `pnpm cicheck:code` to check if the tests pass.
3. If the tests fail, update tests in line with the changes until the tests pass.
4. Use the `commit-push-pr` skill to commit and push the changes, then create or update a pull request.
