---
name: review-pr
description: >-
  Review a pull request in parallel for code quality and security, integrate
  findings with severity levels, and report CI status. Use when asked to review
  a PR or assess whether it is ready to merge.
targets:
  - "*"
---

Resolve `target_pr` from the user's request.

If target_pr is not provided, use the PR of the current branch.

Execute the following in parallel:

- Call code-reviewer subagent to review the code changes in $target_pr.
- Call security-reviewer subagent to review the security issues in $target_pr.

Integrate and report the execution results from each subagent. Additionally, please output PR number in the result so that the user can easily find the PR.
