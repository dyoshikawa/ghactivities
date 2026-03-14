Release assets for ghactivities

- What is released
  - npm package published to npm registry (via npm publish).
  - Release assets attached to the GitHub Release containing a ready-to-install npm tarball for the release.

- How the assets are built
  - The release workflow builds the TypeScript CLI with tsup (as part of the npm publish lifecycle).
  - After publishing to npm, the workflow runs npm pack (via pnpm pack) to produce a tarball ghactivities-<version>.tgz that contains dist and package.json metadata.
  - The tarball is uploaded as a release asset to the GitHub Release so users can download it directly.

- Asset naming
  - ghactivities-<version>.tgz, where <version> is the package.json version.

- How to use the tarball
  - Install directly from tarball: npm install --global ./ghactivities-<version>.tgz OR npm install ghactivities-<version>.tgz
  - Alternatively, users can publish to their own npm registry with standard npm publish from a tarball.

- Notes
  - The workflow preserves the existing npm publish flow; no breaking changes to the package.json or bin configuration.
  - If you later add platform-specific artifacts (zip per OS), you can extend the release workflow to pack and upload additional assets.
