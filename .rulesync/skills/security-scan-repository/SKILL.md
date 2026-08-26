---
name: security-scan-repository
description: >-
  Scan an entire repository for security issues and malicious code — leaked
  secrets, injection and code-execution flaws, supply chain and CI/CD risks,
  insecure configuration, and malicious instructions hidden in AI rule files.
  Use when the user wants a whole-repository security scan or audit, rather than
  the diff-scoped `security-scan-diff`.
---

scope = $ARGUMENTS

If scope is not provided, scan the whole repository. If scope is a path, restrict the scan to it and say so in the report.

## Overview

Audit the current state of the entire repository, not a diff. Use `security-scan-diff` instead when the question is "what changed since ${ref}, and is any of it malicious?".

The scan covers both **vulnerabilities** (unsafe code the maintainer wrote) and **malicious code** (backdoors, exfiltration, tampered dependencies, poisoned agent instructions).

## Steps

1. Map the repository before delegating anything.
   - `git ls-files` is the source of truth for what to scan. Never scan `node_modules/`, `dist/`, or other ignored build output — but treat any _tracked_ build artifact, minified bundle, or binary as suspicious in itself and route it to the supply chain reviewer.
   - Record: languages and file counts, package manager and lockfiles, application entry points, network/filesystem/shell boundaries, CI workflows, container and IaC files, and AI agent instruction files (`.claude/`, `.cursor/`, `.github/copilot-instructions.md`, `AGENTS.md`, `.rulesync/`, `skills/`).
   - Build an explicit file list per domain in step 3. Subagents waste effort rediscovering the layout.

2. Run the automated tooling the repository already provides, in parallel with reading the code.
   - Secret scanning: `pnpm secretlint` (or the project's equivalent) when configured; `gitleaks detect` when the binary is available.
   - Dependency advisories: `pnpm audit` / `npm audit` / `pip-audit` / `cargo audit`, whichever matches the lockfile.
   - `gh api repos/{owner}/{repo}/code-scanning/alerts` and `.../dependabot/alerts` when the repo has them enabled.
   - Do not install new global tooling. When a tool is unavailable, say so in the report's coverage section instead of silently skipping it.
   - Automated output is input to the review, not the review itself: confirm every reported hit against the actual file before it becomes a finding.

3. Call security-reviewer subagents in parallel, one per domain, passing each its file list from step 1. Split a domain across several subagents when its file list is large; keep each subagent under roughly 40 files.
   - **Secrets and credentials** — hardcoded API keys, tokens, private keys, connection strings; credentials in test fixtures, `.env` files, or committed configs; secrets surviving in git history (`git log -p -S` on suspicious values); values written to logs or error messages.

   - **Application source** — command injection, SQL/NoSQL injection, XSS and template injection, path traversal, SSRF, unsafe deserialization, prototype pollution, `eval`/`Function`/dynamic `require`, weak or misused crypto and randomness, missing authentication or authorization checks, insecure defaults, unvalidated redirects, race conditions on privileged operations.

   - **Supply chain and dependencies** — typosquatted or recently-hijacked packages, dependencies pulled from non-registry URLs or forks, lockfile entries whose resolved host disagrees with the declared registry, `postinstall`/`preinstall` lifecycle scripts, unpinned or mutable action and image references, tracked build artifacts that no source file explains.

   - **CI/CD and automation** — script injection via `${{ github.event.* }}` expanded into `run:`, dangerous `pull_request_target` and `workflow_run` usage, over-broad `permissions` and token scopes, secrets exposed to fork-triggered jobs or echoed into logs, third-party actions pinned by tag instead of SHA, self-hosted runner exposure, release/publish workflows that can be triggered by outsiders.

   - **Configuration, containers, and infrastructure** — Dockerfile and compose issues (running as root, secrets in build args or layers, `latest` base images), devcontainer and editor settings that auto-execute code, permissive CORS/CSP/cookie settings, disabled TLS verification, debug or verbose modes enabled by default, security rules suppressed in linter/type-checker configs (`eslint-disable`, `// @ts-ignore` on security-relevant code, `secretlintignore` entries), overly permissive IaC network and IAM rules.

   - **AI instructions and documentation** — prompt injection or malicious directives embedded in rule files, skills, subagent definitions, MCP configs, or issue/PR templates; instructions telling an agent to exfiltrate data, disable checks, or run remote scripts; MCP servers pointing at unknown hosts; phishing or typosquatted URLs in docs.

   Tell every subagent explicitly: read-only investigation, do not switch branches or modify files, do not exfiltrate repository contents to any network service, cite `file:line` for each finding, and report "no findings" rather than inventing marginal ones.

4. Consolidate before reporting.
   - Merge duplicates that several subagents found, and drop findings the code does not actually support.
   - Read the cited code yourself for every high and critical finding. Report it only if the exploit path is real — reachable from an entry point with attacker-controlled input. Downgrade or drop the rest.
   - Note whether a finding is exploitable in production, only in tests or local tooling, or theoretical.
   - Assign a severity — low, mid, high, or critical — and a sequential number (#1, #2, ...) to each finding.

5. Produce a unified report:

   ```
   ## Repository Security Scan Report: <repo> (<scope>)

   ### Conclusion
   - Overall verdict, and explicitly whether any malicious code was detected

   ### Coverage
   | Domain | Files Reviewed | Tools Run | Not Covered |
   |--------|----------------|-----------|-------------|
   | ... | ... | ... | ... |

   ### Findings
   | # | Severity | Description | File:Line | Impact | Exploitable |
   |---|----------|-------------|-----------|--------|-------------|
   | ... | ... | ... | ... | ... | ... |

   ### Recommendations
   - Concrete fix for each finding, highest severity first

   ### Positive Observations
   - Security practices the repository already gets right
   ```

   State the limits of the scan honestly: a clean report means nothing suspicious was found in what was reviewed, not that the repository is proven safe.

## Follow-up

Offer, without doing it unprompted: file the findings with the `create-issue` skill, or fix them and open a PR with the `commit-push-pr` skill. Never paste a discovered secret into an issue, PR, or commit message — reference it by `file:line` and tell the user to rotate it.
