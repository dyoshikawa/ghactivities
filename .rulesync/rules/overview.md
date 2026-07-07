---
root: true # true that is less than or equal to one file for overview such as AGENTS.md, false for details such as .agents/memories/*.md
targets: ["*"] # * = all, or specific tools
description: overview
---

# Project Overview

- Read @SPEC.md if you want to know the specification.
- Manage runtimes and package managers with @mise.toml .
- When you want to check entire codebase:
  - You can use:
    - `bun cicheck:code` to check code style, type safety, and tests.
    - `bun cicheck:content` to check content style, spelling, and secrets.
    - `bun cicheck` to check both code and content.
  - Basically, I recommend you to run `bun cicheck` to daily checks.
- When doing `git commit`:
  - You must run `bun cicheck` before committing to verify quality.
  - You must not use here documents because it causes a sandbox error.
  - You must not use `--no-verify` option because it skips pre-commit checks and causes serious security issues.
- When you read or search the codebase:
  - You should check Serena MCP server tools, and use those actively.
- About the `skills/` directory at the repository root:
  - This directory contains official skills that are distributed for users to install via the `rulesync fetch` command (e.g., `bunx rulesync fetch dyoshikawa/rulesync --features skills`).
  - It is NOT the same as `.rulesync/skills/`, which holds the project's own skill definitions used during generation.
  - Do not modify the root `skills/` directory unless you intend to change the official skills distributed to users.
