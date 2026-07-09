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
| `--output`          | Output file path.                                                                                                                                                                          | `./ghactivities.json`                    |
| `--since`           | Start of the range, in ISO 8601 format.                                                                                                                                                    | 2 weeks ago                              |
| `--until`           | End of the range, in ISO 8601 format.                                                                                                                                                      | now                                      |
| `--visibility`      | Repository visibility: `public`, `private`, or `all`.                                                                                                                                      | `public`                                 |
| `--max-length-size` | Maximum output file size (e.g. `1B`, `2K`, `2M`, `1G`). Larger output is split across multiple files.                                                                                      | `1M`                                     |
| `--max-tokens`      | Maximum number of tokens per output file (counted with `js-tiktoken`'s `cl100k_base` encoding). Output is split when a file would exceed this. Applied in addition to `--max-length-size`. | (disabled)                               |
| `--order`           | Event order by date: `asc` or `desc`.                                                                                                                                                      | `asc`                                    |
| `--scan`            | After collecting, scan the output with an LLM and emit a Markdown report (see [Scanning activity with an LLM](#scanning-activity-with-an-llm) for the provider options).                   | off                                      |
| `--scan-output`     | With `--scan`, write the report to this file instead of stdout.                                                                                                                            | stdout                                   |
| `--help`            | Show the help message.                                                                                                                                                                     |                                          |
| `--version`         | Show the version number.                                                                                                                                                                   |                                          |

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

When the JSON output would exceed `--max-length-size` (or `--max-tokens`, if set), it is split into multiple files named after `--output` with a numeric suffix, for example `./ghactivities_1.json`, `./ghactivities_2.json`, and so on. A single event that is larger than the limit is still written to its own file.

When both `--max-length-size` and `--max-tokens` are given, a file is split as soon as it would exceed **either** limit. Token counts are computed with [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken) using the `cl100k_base` encoding.

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

# Scan the collected activity with an LLM and print a Markdown report
npx ghactivities scan ./ghactivities.json --provider openai
```

## Scanning activity with an LLM

The `scan` subcommand reads the JSON produced by `ghactivities` and asks a large language model (via the [Vercel AI SDK](https://ai-sdk.dev/)) to summarize your activity into a Markdown report.

```bash
# Scan a single file
npx ghactivities scan ./ghactivities.json

# Scan a directory (every *.json file inside it is read)
npx ghactivities scan ./out --provider google --output ./report.md
```

You pass either a **file** or a **directory**. When a directory is given, every `*.json` file inside it is read and scanned together. By default the report is printed to stdout; pass `--output` to write it to a file instead.

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

| Provider (`--provider`) | Default model        | API key environment variable                       |
| ----------------------- | -------------------- | -------------------------------------------------- |
| `openai`                | `gpt-4o-mini`        | `OPENAI_API_KEY`                                   |
| `google`                | `gemini-2.0-flash`   | `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` |
| `vertexai`              | `gemini-2.0-flash`   | `GOOGLE_VERTEX_API_KEY`                            |
| `openrouter`            | `openai/gpt-4o-mini` | `OPENROUTER_API_KEY`                               |

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

- **Commits** are collected from each repository's **default branch** only; commits on other branches are not included.
- For issues, pull requests, and discussions, the range is matched at day granularity (the date portion of `--since`/`--until`); comments and commits are matched at full timestamp precision.

## License

[MIT](./LICENSE)
