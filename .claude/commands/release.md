---
description: Release a new version of the project.
---
First, let's work on the following steps.

1. Confirm that you are currently on the `main` branch. If not on the `main` branch, abort this operation.
2. Compare code changes between the previous version tag and the latest commit to prepare the release description.

- Write in English.
- Do not include confidential information.
- Sections `What's Changed`, `Contributors` and `Full Changelog` are needed.
- `./tmp/release-notes.md` will be used as the release notes.

Then, from `$ARGUMENTS`, get the new version without the `v` prefix and assign it to `$new_version`. For example, if `$ARGUMENTS` is "v1.0.0", the new version is "1.0.0".

Unless the user explicitly specifies the new version, determine `$new_version` from the release description by applying the general semantic-versioning rules (a breaking change bumps the major, a new feature bumps the minor, and a bug fix bumps the patch).

Let's resume the release process.

3. Run `git pull`.
4. Run `git checkout -b release/v${new_version}`.
5. Bump the version in `package.json` to `${new_version}` with `pnpm version ${new_version} --no-git-tag-version`. The CLI reads its version from `package.json`, so no other file needs to change.
6. Run `pnpm cicheck`. If the checks fail, fix the code until they pass.
7. Execute `git add`, `git commit` and `git push`.
8. As a precaution, verify that `pnpm dev --version` reports `${new_version}`.
9. Run `gh pr create` targeting the `main` branch, then `gh pr merge --admin --merge` to merge the release branch into `main`.
10. Create a GitHub release with `gh release create v${new_version} --title v${new_version} --notes-file ./tmp/release-notes.md` on the `github.com/dyoshikawa/ghactivities` repository. Creating the release triggers the `Release` workflow (`.github/workflows/release.yml`), which builds the project and publishes it to npm.
11. Wait for the `Release` workflow to complete successfully. Use `gh run list --workflow=Release --limit 1 --json status,conclusion,databaseId` to check the status. Poll until the workflow completes (status is "completed"). If it fails, report the failure.
12. Clean up the branches. Run `git checkout main`, `git branch -D release/v${new_version}` and `git pull --prune`.
