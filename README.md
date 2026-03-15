# ghactivities

`ghactivities` is a Go CLI that collects GitHub activity for the authenticated user and writes compatible JSON event files.

## Supported events

- issues
- issue comments
- discussions
- discussion comments
- pull requests
- pull request comments
- commits

## Usage

```bash
go run ./cmd/ghactivities --output ./ghactivities.json
```

Options:

- `--github-token`: GitHub access token. If omitted, `GITHUB_TOKEN` is used, then `gh auth token`.
- `--output`: output path. Default: `./ghactivities.json`
- `--since`: start date in ISO8601 format. Default: 2 weeks ago.
- `--until`: end date in ISO8601 format. Default: now.
- `--visibility`: `public`, `private`, or `all`. Default: `public`
- `--max-length-size`: max JSON file size such as `1B`, `2K`, `2M`, `1.5M`. Default: `1M`
- `--order`: `asc` or `desc`. Default: `asc`

If the JSON output exceeds `--max-length-size`, files are split as `ghactivities_1.json`, `ghactivities_2.json`, and so on.

## Build

```bash
go build -o ./bin/ghactivities ./cmd/ghactivities
```

## Test

```bash
go test ./...
```

## Development setup

```bash
mise install
lefthook install
```

After `lefthook install`, the `pre-commit` hook runs `gitleaks` against staged changes and blocks the commit if a secret is detected.

## Release automation (Go release assets)

- The release workflow builds binaries for configured platforms and attaches them to the GitHub Release as downloadable assets:
- linux/amd64: ghactivities-linux-amd64
- darwin/amd64: ghactivities-darwin-amd64
- darwin/arm64: ghactivities-darwin-arm64
- windows/amd64: ghactivities-windows-amd64.exe
- These assets are uploaded automatically when a release is created on main.

## Design notes

- The CLI uses the GitHub GraphQL API to preserve the existing event categories and output shape.
- Commit discovery first identifies contributed repositories from `contributionsCollection`, then reads default-branch commit history filtered by the authenticated viewer ID.
- Comment collection intentionally follows the previous repository search semantics, including the parent-item search constraints used by the TypeScript implementation.
