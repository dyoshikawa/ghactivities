---
root: true # true that is less than or equal to one file for overview such as AGENTS.md, false for details such as .agents/memories/*.md
targets: ["*"] # * = all, or specific tools
description: overview
---

# Project Overview

- Read @README.md if you want to know the tool's usage and specification.
- Manage runtimes and package managers with @mise.toml .
- When you want to check entire codebase:
  - You can use:
    - `pnpm cicheck:code` to check code style, type safety, and tests.
    - `pnpm cicheck:content` to check content style, spelling, and secrets.
    - `pnpm cicheck` to check both code and content.
  - Basically, I recommend you to run `pnpm cicheck` to daily checks.
- When doing `git commit`:
  - You must run `pnpm cicheck` before committing to verify quality.
  - You must not use here documents because it causes a sandbox error.
  - You must not use `--no-verify` option because it skips pre-commit checks and causes serious security issues.
- When you read or search the codebase:
  - You should check Serena MCP server tools, and use those actively.
- The `.rulesync/` directory holds this project's rule, command, subagent, skill, ignore, and MCP definitions. Editing files under `.rulesync/` requires running `pnpm generate` (which runs `rulesync generate`) to regenerate the tool-specific outputs; CI fails if the generated files are out of date.
