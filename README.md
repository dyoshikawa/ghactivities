# ghactivities

A CLI tool that collects your GitHub activity — issues, issue comments, discussions, discussion comments, pull requests, pull request comments, and commits — and writes them to a JSON file.

## Features

Fetches the following events authored by you within a date range and outputs them as JSON:

- **Issue** — issues you opened
- **IssueComment** — comments you left on issues
- **Discussion** — discussions you created
- **DiscussionComment** — comments you left on discussions
- **PullRequest** — pull requests you opened
- **PullRequestComment** — comments you left on pull requests
- **Commit** — commits you authored (on each repository's default branch)

## Requirements

- Node.js >= 20
- A GitHub access token (see [Authentication](#authentication))

## Usage

Run without installing via `npx`:

```bash
npx ghactivities
```

By default this collects events from **public** repositories over the **last two weeks** and writes them to `./ghactivities.json`.

## Authentication

A GitHub token is resolved in the following order:

1. The `--github-token` option, if provided.
2. The `GITHUB_TOKEN` environment variable.
3. The output of `gh auth token` (requires the [GitHub CLI](https://cli.github.com/) to be installed and authenticated).

To include private repositories (`--visibility private` or `--visibility all`), the token needs read access to those repositories (e.g. the `repo` scope).

## Options

| Option              | Description                                                                                           | Default                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `--github-token`    | GitHub access token.                                                                                  | `GITHUB_TOKEN` env, then `gh auth token` |
| `--output`          | Output file path.                                                                                     | `./ghactivities.json`                    |
| `--since`           | Start of the range, in ISO 8601 format.                                                               | 2 weeks ago                              |
| `--until`           | End of the range, in ISO 8601 format.                                                                 | now                                      |
| `--visibility`      | Repository visibility: `public`, `private`, or `all`.                                                 | `public`                                 |
| `--max-length-size` | Maximum output file size (e.g. `1B`, `2K`, `2M`, `1G`). Larger output is split across multiple files. | `1M`                                     |
| `--order`           | Event order by date: `asc` or `desc`.                                                                 | `asc`                                    |
| `--help`            | Show the help message.                                                                                |                                          |
| `--version`         | Show the version number.                                                                              |                                          |

## Output

Events are written as a pretty-printed JSON array, sorted by `createdAt` according to `--order`.

Each event shares a common shape and adds type-specific fields:

```json
[
  {
    "type": "Issue",
    "createdAt": "2025-01-15T09:30:00Z",
    "title": "Fix the flaky test",
    "url": "https://github.com/owner/repo/issues/1",
    "body": "…",
    "repository": {
      "owner": "owner",
      "name": "repo",
      "visibility": "PUBLIC"
    }
  }
]
```

### File splitting

When the JSON output would exceed `--max-length-size`, it is split into multiple files named after `--output` with a numeric suffix, for example `./ghactivities_1.json`, `./ghactivities_2.json`, and so on. A single event that is larger than the limit is still written to its own file.

## Examples

```bash
# Collect the last two weeks of public activity into ./ghactivities.json
npx ghactivities

# Collect a specific range, including private repositories
npx ghactivities \
  --since 2025-01-01T00:00:00Z \
  --until 2025-02-01T00:00:00Z \
  --visibility all

# Write to a custom file, newest first, splitting at 500 KB
npx ghactivities --output ./activity.json --order desc --max-length-size 500K
```

## Notes

- **Commits** are collected from each repository's **default branch** only; commits on other branches are not included.
- For issues, pull requests, and discussions, the range is matched at day granularity (the date portion of `--since`/`--until`); comments and commits are matched at full timestamp precision.

## License

[MIT](./LICENSE)
