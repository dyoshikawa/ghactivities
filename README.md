# ghactivities

A CLI tool that collects your GitHub activity — issues, comments, discussions, pull requests, reviews, commits, commit comments, gists, releases, repositories, and wiki edits — and writes them to a JSON file.

## Features

Fetches the following events authored by you — or by any user given with `--user` — within a date range and outputs them as JSON:

- **Issue** — issues you opened
- **IssueComment** — comments you left on issues
- **Discussion** — discussions you created
- **DiscussionComment** — comments you left on discussions
- **PullRequest** — pull requests you opened
- **PullRequestComment** — conversation comments you left on pull requests
- **PullRequestReviewComment** — review feedback you left on pull requests (review summary bodies and inline review comments on the diff)
- **Commit** — commits you authored (on each repository's default branch, or on every branch with `--branches all`; add per-file diffs with `--commit-diff`)
- **CommitComment** — comments you left directly on commits
- **Gist** — gists you created, including file contents (secret gists count as private)
- **Release** — releases you published in your own repositories, including release notes and asset metadata
- **Repository** — repositories you created, including their description and README
- **WikiPageEdit** — wiki pages you created or edited (from the GitHub events feed; see [Notes](#notes))

Comment events additionally carry an `editHistory` field with the prior revisions (up to the 5 most recent edits) when a comment has been edited — useful for auditing content that was posted and then reworded or removed.

It can also **scan** the collected JSON with an LLM to produce a Markdown summary report — see [Scanning activity with an LLM](#scanning-activity-with-an-llm).

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

| Option              | Description                                                                                                                                                                                | Default                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `--github-token`    | GitHub access token.                                                                                                                                                                       | `GITHUB_TOKEN` env, then `gh auth token` |
| `--user`            | GitHub username whose activity is collected instead of the authenticated user's. A token is still required for API access.                                                                 | the authenticated user                   |
| `--output`          | Output file path.                                                                                                                                                                          | `./ghactivities.json`                    |
| `--since`           | Start of the range, in ISO 8601 format. Must not be later than `--until`.                                                                                                                  | 2 weeks ago                              |
| `--until`           | End of the range, in ISO 8601 format.                                                                                                                                                      | now                                      |
| `--visibility`      | Repository visibility: `public`, `private`, or `all`.                                                                                                                                      | `public`                                 |
| `--branches`        | Commit collection scope: `default` (each repository's default branch) or `all` (every branch, deduplicated; each commit lists the branches it was seen on).                                | `default`                                |
| `--commit-diff`     | Attach per-file diffs (`diff` field) to Commit events. Costs one extra API request per commit.                                                                                             | off                                      |
| `--max-length-size` | Maximum output file size (e.g. `1B`, `2K`, `2M`, `1G`). Larger output is split across multiple files.                                                                                      | `1M`                                     |
| `--max-tokens`      | Maximum number of tokens per output file (counted with `js-tiktoken`'s `cl100k_base` encoding). Output is split when a file would exceed this. Applied in addition to `--max-length-size`. | (disabled)                               |
| `--order`           | Event order by date: `asc` or `desc`.                                                                                                                                                      | `asc`                                    |
| `--scan`            | After collecting, scan the output with an LLM and emit a Markdown report (see [Scanning activity with an LLM](#scanning-activity-with-an-llm) for the provider options).                   | off                                      |
| `--scan-output`     | With `--scan`, write the report to this file instead of stdout.                                                                                                                            | stdout                                   |
| `--help`            | Show the help message.                                                                                                                                                                     |                                          |
| `--version`         | Show the version number.                                                                                                                                                                   |                                          |

## Output

Events are written as a pretty-printed JSON array, sorted by `createdAt` according to `--order`.

Each event shares a common shape (`type`, `createdAt`, `repository`) and adds type-specific fields — for example, Commit events always carry a `branches` list (plus a `diff` file list with `--commit-diff`), comment events carry an `editHistory` list when the comment was edited, and Gist events carry a `files` list with file contents:

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

When the JSON output would exceed `--max-length-size` (or `--max-tokens`, if set), it is split into multiple files named after `--output` with a numeric suffix, for example `./ghactivities_1.json`, `./ghactivities_2.json`, and so on. A single event that is larger than the limit is still written to its own file.

When both `--max-length-size` and `--max-tokens` are given, a file is split as soon as it would exceed **either** limit. Token counts are computed with [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken) using the `cl100k_base` encoding.

## Examples

```bash
# Collect the last two weeks of public activity into ./ghactivities.json
npx ghactivities

# Collect another user's public activity
npx ghactivities --user octocat

# Audit-oriented collection: every branch, with commit diffs
npx ghactivities --branches all --commit-diff

# Collect a specific range, including private repositories
npx ghactivities \
  --since 2025-01-01T00:00:00Z \
  --until 2025-02-01T00:00:00Z \
  --visibility all

# Write to a custom file, newest first, splitting at 500 KB
npx ghactivities --output ./activity.json --order desc --max-length-size 500K

# Scan the collected activity with an LLM and print a Markdown report
npx ghactivities scan ./ghactivities.json --provider openai
```

## Scanning activity with an LLM

The `scan` subcommand reads the JSON produced by `ghactivities` and asks a large language model (via the [Vercel AI SDK](https://ai-sdk.dev/)) to summarize your activity into a Markdown report.

Note that everything in the collected JSON — comment bodies and edit histories, gist file contents, READMEs, and commit diffs — is sent to the selected LLM provider. Review the collected data (or narrow what you collect) before scanning if it may contain sensitive content.

```bash
# Scan a single file
npx ghactivities scan ./ghactivities.json

# Scan a directory (every *.json file inside it is read)
npx ghactivities scan ./out --provider google --output ./report.md
```

You pass either a **file** or a **directory**. When a directory is given, every `*.json` file inside it is read and scanned together, in numeric-aware filename order (so `ghactivities_2.json` is read before `ghactivities_10.json`). By default the report is printed to stdout; pass `--output` to write it to a file instead.

The combined scan input is limited per provider — **200,000 tokens** for `openai` and `openrouter`, **800,000 tokens** for `google` and `vertexai` (counted with `js-tiktoken`'s `cl100k_base` encoding). Larger input fails fast with an error before anything is sent to the provider — narrow `--since`/`--until` to reduce the input.

### One-stop collect and scan

You can also collect and scan in a single run by adding `--scan` to the normal command. The same provider options (`--provider`, `--model`, `--api-key`, `--vertex-project`, `--vertex-location`) apply, and `--scan-output` writes the report to a file instead of stdout:

```bash
# Collect the last two weeks and immediately scan the result
npx ghactivities --scan --provider openai

# Collect, then write both the JSON and the report to files
npx ghactivities --output ./activity.json --scan --provider google --scan-output ./report.md
```

### Providers and API keys

The `--provider` option selects the LLM provider. The API key is resolved from the `--api-key` option, falling back to a provider-specific environment variable:

| Provider (`--provider`) | Default model           | API key environment variable                       |
| ----------------------- | ----------------------- | -------------------------------------------------- |
| `openai`                | `gpt-5.6-luna`          | `OPENAI_API_KEY`                                   |
| `google`                | `gemini-3.1-flash-lite` | `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` |
| `vertexai`              | `gemini-3.1-flash-lite` | `GOOGLE_VERTEX_API_KEY`                            |
| `openrouter`            | `openai/gpt-5.6-luna`   | `OPENROUTER_API_KEY`                               |

For `vertexai`, an API key uses Vertex AI express mode. You can also set `--vertex-project` / `--vertex-location` (or the `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` environment variables).

### Scan options

| Option              | Description                                                                   | Default                      |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `<dir or file>`     | Path to an activities JSON file or a directory of them (positional argument). | (required)                   |
| `--provider`        | LLM provider: `openai`, `google`, `vertexai`, `openrouter`.                   | `openai`                     |
| `--model`           | Model id.                                                                     | depends on the provider      |
| `--api-key`         | API key for the provider.                                                     | provider env var (above)     |
| `--output`          | Write the report to this file instead of stdout.                              | stdout                       |
| `--vertex-project`  | Google Vertex project (provider `vertexai`).                                  | `GOOGLE_VERTEX_PROJECT` env  |
| `--vertex-location` | Google Vertex location (provider `vertexai`).                                 | `GOOGLE_VERTEX_LOCATION` env |

## Notes

- **Commits** are collected from each repository's **default branch** by default. With `--branches all`, every branch is scanned and each commit is emitted once with a `branches` list of the branches it was found on. Repository discovery is based on GitHub's contribution data (default-branch commits) plus, with `--branches all`, your own repositories pushed within the range — branches of repositories you do not own and never committed to on the default branch can still be missed.
- **Gists** need gist read access on the token (the `gist` scope on classic tokens, or the Gists permission on fine-grained tokens). Without it, gists are skipped with a warning instead of failing the run.
- **Releases** are discovered by walking the user's **own** repositories; releases published in repositories owned by someone else are not collected. A release counts from its publication time (`publishedAt`), but the scan stops at releases **created** before `--since` — a release drafted before the range and published inside it is not collected.
- **Repository** events cover repositories **created** within the range; a repository that was switched from private to public is not detected as an event (GitHub exposes no such timestamp). The `readme` field reads exactly `README.md` on the default branch — other spellings (`readme.md`, `README.rst`, a plain `README` with no extension) come back as `null`.
- **WikiPageEdit** events come from the GitHub events feed, which only covers the most recent **90 days** and at most **300 events** per user; a warning is printed when the requested range cannot be fully covered.
- **editHistory** on comment events contains at most the 5 most recent prior revisions of an edited comment.
- With `--user`, events are collected for that user, but only from repositories the **token** can see: another user's activity in private repositories appears (with `--visibility private` or `all`) only when the token also has read access to those repositories.
- Repositories with `INTERNAL` visibility (organization-internal repositories on GitHub Enterprise) are treated as private: they are included with `--visibility private` and `--visibility all`, and excluded with `--visibility public`.
- Event types are fetched one at a time (not concurrently) to stay within GitHub's secondary rate limits. Transient API failures — rate limits and gateway errors — are retried up to 3 times, honoring the server-suggested wait when provided and falling back to exponential backoff. If fetching still fails, the error names the event type that was being fetched.
- GitHub's Search API returns at most 1,000 results per query. When a query would exceed that cap, the date range is automatically split into smaller windows and searched again. If a single UTC day still exceeds the cap, the excess items are skipped and a warning is printed.
- For issues, pull requests, and discussions, the range is matched at day granularity (the date portion of `--since`/`--until`); comments (including review summary bodies and inline review comments) and commits are matched at full timestamp precision. Review events use the review's submission time.

## License

[MIT](./LICENSE)
