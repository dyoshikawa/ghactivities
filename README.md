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

## Design notes

- The CLI uses the GitHub GraphQL API to preserve the existing event categories and output shape.
- Commit discovery first identifies contributed repositories from `contributionsCollection`, then reads default-branch commit history filtered by the authenticated viewer ID.
- Comment collection intentionally follows the previous repository search semantics, including the parent-item search constraints used by the TypeScript implementation.
