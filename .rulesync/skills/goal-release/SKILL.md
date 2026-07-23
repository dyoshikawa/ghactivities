---
name: goal-release
description: >-
  Release a new ghactivities version end to end by drafting the release, waiting
  for green CI, merging the release PR, publishing the GitHub release, and
  verifying the npm release workflow. Use when asked to complete, finish, or
  publish a release through the goal-release workflow.
targets:
  - "*"
---

# Goal Release

<!-- cspell:ignore commitish -->

Resolve `new_version` from the user's request.

Drive a ghactivities release from preparation through publication. Use the `draft-release` skill to create the release branch, release PR, and draft GitHub release; require green CI before using the `merge-pr` skill; publish the draft release; then verify the `Release` workflow and npm package.

## 1. Draft the Release

Require a clean worktree before invoking `draft-release`:

```bash
git status --porcelain
```

If this prints anything, stop and report the paths. Do not let pre-existing changes enter a release PR.

Use the `draft-release` skill with `new_version`.

- If a version is provided (for example, `v1.2.3` or `1.2.3`), require it to match `^v?\d+\.\d+\.\d+$`. Stop and report an invalid value instead of passing it through.
- If no version is provided, pass no version argument. Let `draft-release` determine the next semantic version.

Record the normalized version, the `release/v<version>` branch, the release PR number or URL, and the draft release tag returned by `draft-release`.

Before continuing, verify that all expected artifacts exist:

```bash
gh pr view <pr> --json number,title,state,baseRefName,headRefName,url
gh release view v<version> --json tagName,isDraft,url
```

Require an open PR from `release/v<version>` into `main` and a draft release tagged `v<version>`. If the draft step stopped partway or any artifact does not match, stop and report the partial state. Do not guess or create missing artifacts outside the `draft-release` workflow.

Audit the release PR before waiting for CI:

```bash
gh pr diff <pr> --name-only
gh pr view <pr> --json commits,files
```

Require `package.json` to be the only changed file and require its diff to change only the top-level `version` field from the current released version to `<version>`. Require the commit list to contain only the expected release preparation commit or commits created by `draft-release`. If any other path, content change, or unexpected commit exists, stop and ask the user to confirm the exact diff. CI success never substitutes for this audit.

## 2. Wait for Release PR CI

Watch the checks for the resolved release PR:

```bash
gh pr checks <pr> --watch
```

Checks may take a short time to register. If none are listed immediately after PR creation, wait briefly and retry.

- Continue only when every check passes.
- Never merge while any check is failing or pending.
- If a check fails, investigate it on the release branch, run `pnpm cicheck`, make a legitimate fix, commit only the intended files, and push.
- Never make CI pass by skipping or deleting tests, weakening lint or type-check settings, or changing GitHub Actions workflows.
- Allow at most 3 CI-fix attempts. If CI remains red, stop and report the failing checks.

After every CI fix, repeat the changed-file, diff, and commit audit from Section 1. If a fix adds any path or content beyond the allowed `package.json` version change, stop before merging and ask the user to confirm the exact additional diff and commits. Report their hashes and subjects.

## 3. Merge the Release PR

Use the `merge-pr` skill with the verified release PR.

The release PR is expected to change only the version in `package.json`. The `goal-pr` safeguard against automatically merging release or dependency changes does not apply here because invoking `goal-release` explicitly authorizes the verified release PR workflow. It does not authorize merging any other PR or unrelated changes.

After merging, verify that the PR state is `MERGED` and record its `mergeCommit.oid`:

```bash
gh pr view <pr> --json state,mergeCommit
```

If the merge fails, the merge commit is missing, or the PR changes identity, stop and report without publishing the release.

## 4. Publish the Draft Release

Re-read the draft release and confirm that its tag is exactly `v<version>` and it is still a draft. Also retrieve its `target_commitish` and the current `main` SHA:

```bash
gh api repos/{owner}/{repo}/releases/tags/v<version> --jq '{tag_name,draft,target_commitish,html_url}'
gh api repos/{owner}/{repo}/git/ref/heads/main --jq .object.sha
```

Require the current `main` SHA to equal the release PR's recorded merge commit. Resolve `target_commitish`: if it is a branch name such as `main`, resolve that ref to a commit SHA; if it is already a SHA, use it directly. Require the resolved target SHA to equal the same merge commit. Stop before publication if any value differs. This check prevents publishing a draft that targets stale or unrelated code.

Publish that existing draft release:

```bash
gh release edit v<version> --draft=false
```

Do not create a second release. Publishing the release triggers `.github/workflows/release.yml`, which builds the project and publishes the package to npm.

## 5. Verify the Release Workflow

Find the `Release` workflow run associated with the published tag. A run may take a few seconds to appear, so retry when the initial result is empty:

```bash
gh run list --workflow Release --limit 10 --json databaseId,status,conclusion,event,headSha,url
```

Match the run to this release's tag commit SHA; do not rely only on the newest run. Watch the matched run until completion:

```bash
gh run watch <run_id>
```

- Require `status == completed` and `conclusion == success`.
- If the workflow fails, inspect it with `gh run view <run_id> --log-failed`, then report the failure. Do not delete or recreate the published release and do not retry publication blindly.

After workflow success, verify the public release and package version:

```bash
gh release view v<version> --json tagName,isDraft,url
npm view ghactivities version
```

Require `isDraft == false` and npm to report `<version>`. npm propagation can lag briefly; retry for a bounded period. If it still does not match, report the mismatch rather than claiming success.

## 6. Clean Up

Ensure the local repository is back on `main`, then update and prune remote-tracking references:

```bash
git switch main
git pull --prune
```

Do not delete unrelated local branches or discard a dirty worktree. The `merge-pr` skill may already have removed the release branch; treat an absent release branch as expected.

## 7. Final Report

Report:

- Outcome: `Released` or `Failed`.
- The version and public GitHub release URL.
- The merged release PR number and title.
- The `Release` workflow URL and conclusion.
- The npm version observed.
- Any CI fixes or manual confirmations required along the way.
