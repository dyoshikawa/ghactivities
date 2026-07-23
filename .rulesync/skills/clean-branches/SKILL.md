---
name: clean-branches
description: >-
  Clean local Git branches and prune remote-tracking references. Use when asked
  to remove merged or stale local branches while preserving the current branch
  and main.
targets:
  - "*"
---

1. Inspect the current branch and local branches.
2. Delete all local branches except the current branch and `main`.
3. Run `git pull --prune`.
4. Report deleted and preserved branches.
