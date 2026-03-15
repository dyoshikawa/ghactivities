# ghactivities

`ghactivities` is a Go CLI that exports your GitHub activity as JSON files. It authenticates as the current GitHub user, fetches supported event types from the GitHub GraphQL API, and writes machine-friendly output that can be archived, transformed, or imported into downstream tooling.

## What it collects

`ghactivities` currently collects these event categories for the authenticated user:

- issues you opened
- issue comments you wrote
- discussions you created
- discussion comments you wrote
- pull requests you opened
- pull request comments you wrote
- commits authored by you on default branches of repositories you contributed to during the selected time range

Each JSON event includes the event type, creation timestamp, resource metadata, and repository owner/name/visibility.

## Installation and build

Run directly from the repository:

```bash
go run ./cmd/ghactivities --help
```

Build a local binary:

```bash
go build -o ./bin/ghactivities ./cmd/ghactivities
```

Then run it with:

```bash
./bin/ghactivities --help
```

## Authentication

`ghactivities` resolves credentials in this order:

1. `--github-token`
2. `GITHUB_TOKEN`
3. `gh auth token`

If you want to rely on GitHub CLI authentication, make sure `gh auth login` has already been completed on your machine.

## Quick start

Export the last 2 weeks of public activity to the default file:

```bash
go run ./cmd/ghactivities
```

Write to a custom file:

```bash
go run ./cmd/ghactivities --output ./out/ghactivities.json
```

Collect both public and private activity for a specific time window:

```bash
go run ./cmd/ghactivities \
  --visibility all \
  --since 2026-01-01T00:00:00Z \
  --until 2026-01-31T23:59:59Z
```

Use an explicit token and reverse chronological ordering:

```bash
go run ./cmd/ghactivities \
  --github-token "$GITHUB_TOKEN" \
  --order desc
```

## CLI options

```text
--github-token      GitHub access token
--output            Output file path (default: ./ghactivities.json)
--since             Start date in ISO8601 format (default: 2 weeks ago)
--until             End date in ISO8601 format (default: now)
--visibility        Repository visibility: public, private, all (default: public)
--max-length-size   Max output file size such as 1B, 2K, 2M (default: 1M)
--max-tokens        Max output file tokens from rendered JSON (default: 0, disabled)
--order             Event order: asc, desc (default: asc)
--help              Show help
```

Notes:

- `--since` and `--until` must be valid RFC3339 / ISO8601 timestamps such as `2026-03-15T12:00:00Z`.
- `--visibility private` limits results to repositories GitHub reports as private.
- `--order asc` returns oldest-first output; `--order desc` returns newest-first output.
- `--max-tokens` counts tokens from the formatted JSON content using `github.com/tiktoken-go/tokenizer` with the `o200k_base` encoding.

## Output files and splitting

By default, `ghactivities` writes a formatted JSON array to `./ghactivities.json`.

If the rendered JSON exceeds `--max-length-size` or `--max-tokens`, `ghactivities` automatically splits the result into numbered files that keep the same base name and extension:

- `./ghactivities_1.json`
- `./ghactivities_2.json`
- `./ghactivities_3.json`

For example:

```bash
go run ./cmd/ghactivities \
  --output ./exports/activity.json \
  --max-length-size 256K \
  --max-tokens 20000
```

This produces either `./exports/activity.json` or, when splitting is needed, files like `./exports/activity_1.json`, `./exports/activity_2.json`, and so on.

Splitting keeps the existing event order intact and fills files in sequence. When both limits are set, `ghactivities` uses whichever limit is reached first for each chunk.

If a single rendered event already exceeds `--max-length-size`, it is still written as its own numbered file because it cannot be split further. If a single rendered event exceeds `--max-tokens`, `ghactivities` returns an error instead of silently writing a file above the requested token cap.

## Development setup

This repository uses `mise` for contributor setup and toolchain management.

Recommended first command for contributors:

```bash
mise run setup
```

`mise run setup` keeps local setup to one command by:

- installing the pinned tools with `mise install`
- running `go mod tidy` to sync Go module dependencies
- installing the local git hooks with `lefthook install`

If you need to run the steps manually:

```bash
mise install
go mod tidy
lefthook install
```

Current development tooling includes:

- `go` for building and testing `ghactivities`
- `lefthook` for local git hook management
- `gitleaks` for secret scanning in the pre-commit hook

The configured `pre-commit` hook runs `gitleaks` against staged changes and blocks commits if potential secrets are detected.

## Testing and validation

Run the test suite:

```bash
go test ./...
```

Build the CLI:

```bash
go build -o ./bin/ghactivities ./cmd/ghactivities
```

Inspect the generated help text:

```bash
go run ./cmd/ghactivities --help
```

## Release automation

GitHub Actions handles CI and release builds for `ghactivities`.

- `.github/workflows/ci.yml` runs `go test ./...`, builds `./bin/ghactivities`, and verifies the binary exists on pushes and pull requests to `main`.
- `.github/workflows/release.yml` runs tests and builds release binaries when a GitHub Release is created.
- Release assets are published for `linux/amd64`, `darwin/amd64`, `darwin/arm64`, and `windows/amd64`.

## Implementation notes

- `ghactivities` uses the GitHub GraphQL API.
- Commit discovery first identifies contributed repositories from the user's contributions collection, then reads authored commits from each repository's default branch within the requested date range.
- Output is written as JSON with stable file naming that preserves the requested output base path.
