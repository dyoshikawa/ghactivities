---
name: draft-release
description: "Draft a new release of ghactivities."
targets:
  - "*"
---

First, let's work on the following steps.

1. Confirm that you are currently on the `main` branch and pull the latest changes. If not on the `main` branch, switch to it.
2. Compare code changes between the previous version tag and the latest commit to prepare the release description.

- Write in English.
- Do not include confidential information.
- Sections `What's Changed`, `Contributors` and `Full Changelog` are needed.
- `./tmp/release-notes/*.md` will be used as the release notes.

Then, from `$ARGUMENTS`, get the new version without the `v` prefix and assign it to `$new_version`. For example, if `$ARGUMENTS` is "v1.0.0", the new version is "1.0.0".

If `$ARGUMENTS` is empty, determine the new version automatically by analyzing the diff and applying semantic-versioning rules: a breaking change bumps the major, a new feature bumps the minor, and a bug fix bumps the patch.

Let's resume the release process.

3. Run `git pull`.
4. Run `git checkout -b release/v${new_version}`.
5. Bump the version in `package.json` to `${new_version}` with `pnpm version ${new_version} --no-git-tag-version` (or edit the `version` field directly). The CLI reads its version from `package.json`, so no other file needs to change.
6. Run `pnpm run cicheck`. If the checks fail, fix the code until they pass.
7. Execute `git add`, `git commit` and `git push`.
8. As a precaution, verify that `ghactivities --version` (or `pnpm dev --version`) reports `${new_version}`.
9. Run `gh pr create` targeting the `main` branch.
10. Create a **draft** release with `gh release create v${new_version} --draft --title v${new_version} --notes-file ./tmp/release-notes/*.md` on the `github.com/dyoshikawa/ghactivities` repository. Creating a draft (instead of publishing) lets you review it before the release workflow publishes to npm.
