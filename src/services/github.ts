import { graphql } from "@octokit/graphql";

import type { Branches, Visibility } from "../types/cli.js";
import type { CommitDiffFile, CommitEvent, ContentEdit, GitHubEvent } from "../types/events.js";
import type {
  BranchCommitHistoryResponse,
  BranchRefsResponse,
  CommentNode,
  CommentsConnection,
  CommentsPageResponse,
  CommitCommentsResponse,
  CommitHistoryNode,
  CommitHistoryResponse,
  ContributionsCollectionResponse,
  CreatedRepositoriesResponse,
  DiscussionNode,
  DiscussionWithCommentsNode,
  GistsResponse,
  IssueNode,
  IssueWithCommentsNode,
  PullRequestNode,
  PullRequestWithCommentsNode,
  PullRequestWithReviewsNode,
  PushedRepositoriesResponse,
  ReleasesConnection,
  ReleasesPageResponse,
  RepositoriesWithReleasesResponse,
  RepositoryVisibility,
  RepositoryWithReleasesNode,
  RestCommitDetail,
  RestUserEvent,
  ReviewNode,
  ReviewsConnection,
  ReviewsPageResponse,
  SearchResponse,
  UserContentEditsConnection,
  UserIdResponse,
  ViewerResponse,
} from "../types/github-api.js";
import type { DateRange } from "../utils/date-range.js";

import {
  spansMultipleUtcDays,
  splitDateRangeAtUtcDayBoundary,
  splitDateRangeIntoYearPeriods,
  toUtcDayString,
} from "../utils/date-range.js";
import { formatError } from "../utils/error.js";
import { GITHUB_LOGIN_PATTERN } from "../utils/github-login.js";
import {
  BRANCH_COMMIT_HISTORY_QUERY,
  BRANCH_REFS_QUERY,
  COMMIT_COMMENTS_QUERY,
  COMMIT_HISTORY_QUERY,
  CONTRIBUTIONS_COLLECTION_QUERY,
  CREATED_REPOSITORIES_QUERY,
  DISCUSSION_COMMENT_SEARCH_QUERY,
  DISCUSSION_COMMENTS_PAGE_QUERY,
  DISCUSSION_SEARCH_QUERY,
  GISTS_QUERY,
  ISSUE_COMMENT_SEARCH_QUERY,
  ISSUE_COMMENTS_PAGE_QUERY,
  ISSUE_SEARCH_QUERY,
  PULL_REQUEST_COMMENT_SEARCH_QUERY,
  PULL_REQUEST_COMMENTS_PAGE_QUERY,
  PULL_REQUEST_REVIEW_SEARCH_QUERY,
  PULL_REQUEST_SEARCH_QUERY,
  PUSHED_REPOSITORIES_QUERY,
  RELEASES_PAGE_QUERY,
  REPOSITORIES_WITH_RELEASES_QUERY,
  REVIEW_COMMENTS_PAGE_QUERY,
  REVIEWS_PAGE_QUERY,
  USER_ID_QUERY,
  VIEWER_QUERY,
} from "./github-queries.js";

interface GitHubServiceParams {
  token: string;
  /** Collect this user's activity instead of the authenticated user's. */
  username?: string | undefined;
  since: Date;
  until: Date;
  visibility: Visibility;
  /** Collect commits from the default branch only, or from every branch. */
  branches?: Branches | undefined;
  /** Attach per-file diffs to Commit events (one extra REST call per commit). */
  commitDiff?: boolean | undefined;
  onWarning?: (message: string) => void;
  retry?: {
    maxRetries?: number;
    baseDelayMs?: number;
  };
}

const GITHUB_REST_BASE_URL = "https://api.github.com";

// The events feed behind wiki-edit collection is capped by GitHub.
const EVENTS_FEED_MAX_PAGES = 3;
const EVENTS_FEED_PAGE_SIZE = 100;
const EVENTS_FEED_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// With --branches all, a repository with this many branches triggers a
// heads-up warning about scan time and rate-limit consumption.
const MANY_BRANCHES_WARNING_THRESHOLD = 200;

// GitHub's Search API never returns more than 1,000 results per query.
const SEARCH_RESULT_CAP = 1000;

// Retry policy for transient GitHub API failures.
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// The relevant fields of errors thrown by @octokit/graphql: RequestError
// (HTTP 4xx/5xx) exposes `status` and `response.headers`, while
// GraphqlResponseError (HTTP 200 with an errors array, e.g. RATE_LIMITED)
// exposes the response headers as a top-level `headers` property.
interface GitHubApiErrorShape {
  status?: number;
  message?: string;
  headers?: Record<string, string | number | undefined>;
  response?: { headers?: Record<string, string | number | undefined> };
  errors?: { type?: string }[];
}

// Maps a comment's prior revisions to the event's editHistory field;
// undefined (field omitted) when the comment was never edited.
function toEditHistory(
  edits: UserContentEditsConnection | null | undefined,
): ContentEdit[] | undefined {
  const nodes = edits?.nodes ?? [];
  if (nodes.length === 0) return undefined;
  return nodes.map((edit) => ({
    editedAt: edit.editedAt,
    deletedAt: edit.deletedAt,
    diff: edit.diff,
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// GraphQL errors raised when the token cannot access a resource at all, e.g.
// a fine-grained token without the Gists read permission.
function isTokenAccessError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as GitHubApiErrorShape;
  return (
    err.errors?.some(
      (graphqlError) =>
        graphqlError.type === "FORBIDDEN" || graphqlError.type === "INSUFFICIENT_SCOPES",
    ) ?? false
  );
}

// Node-heavy searches (comment connections with edit histories) can exceed
// GitHub's per-query resource limits on deep result pages even when the
// result count is within the 1,000-result cap. The failure is deterministic
// for a given page, so the remedy is a smaller date window, not a retry.
function isResourceLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as GitHubApiErrorShape;
  return (
    err.errors?.some((graphqlError) => graphqlError.type === "RESOURCE_LIMITS_EXCEEDED") ?? false
  );
}

function isRetryableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as GitHubApiErrorShape;
  if (err.errors?.some((graphqlError) => graphqlError.type === "RATE_LIMITED")) return true;
  if (typeof err.status !== "number") return false;
  if (RETRYABLE_STATUS_CODES.has(err.status)) return true;
  // Secondary rate limits surface as 403 with a rate-limit/abuse message.
  return err.status === 403 && /rate limit|abuse/i.test(err.message ?? "");
}

// Exported for direct unit testing (no real sleeps needed).
export function computeRetryDelayMs(params: {
  error: unknown;
  attempt: number;
  baseDelayMs: number;
}): number {
  const err = params.error as GitHubApiErrorShape;
  const headers = err.response?.headers ?? err.headers ?? {};
  const retryAfterSeconds = Number(headers["retry-after"]);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const resetEpochSeconds = Number(headers["x-ratelimit-reset"]);
  if (Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0) {
    const waitMs = resetEpochSeconds * 1000 - Date.now();
    if (waitMs > 0) return Math.min(waitMs, MAX_RETRY_DELAY_MS);
  }
  return Math.min(params.baseDelayMs * 2 ** params.attempt, MAX_RETRY_DELAY_MS);
}

export class GitHubService {
  private readonly graphqlWithAuth: typeof graphql;
  private readonly token: string;
  private readonly username: string | undefined;
  // Caches the id lookup, which runs both as the up-front --user existence
  // check and for the commit history author filter.
  private userIdCache: { login: string; id: string } | undefined;
  private readonly since: Date;
  private readonly until: Date;
  private readonly visibility: Visibility;
  private readonly branches: Branches;
  private readonly commitDiff: boolean;
  private readonly onWarning: (message: string) => void;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(params: GitHubServiceParams) {
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${params.token}` },
    });
    this.token = params.token;
    this.username = params.username;
    this.since = params.since;
    this.until = params.until;
    this.visibility = params.visibility;
    this.branches = params.branches ?? "default";
    this.commitDiff = params.commitDiff ?? false;
    this.onWarning = params.onWarning ?? (() => {});
    this.maxRetries = params.retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = params.retry?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  }

  async fetchAllEvents(): Promise<GitHubEvent[]> {
    let username: string;
    if (this.username === undefined) {
      try {
        username = await this.getViewerLogin();
      } catch (error) {
        throw new Error(`Failed to fetch viewer login: ${formatError(error)}`, { cause: error });
      }
    } else {
      username = this.username;
      // Defense in depth: the CLI already validates --user, but the username
      // is interpolated into search query strings, so a caller bypassing the
      // CLI must not be able to inject extra search qualifiers.
      if (!GITHUB_LOGIN_PATTERN.test(username)) {
        throw new Error(`Invalid GitHub username: "${username}"`);
      }
      // Resolving the id up front makes a nonexistent --user fail fast with a
      // clear error instead of six empty searches followed by a commit failure.
      try {
        await this.getUserId(username);
      } catch (error) {
        throw new Error(`Failed to fetch user "${username}": ${formatError(error)}`, {
          cause: error,
        });
      }
    }

    // Fetchers run one at a time: GitHub's secondary rate-limit guidance is to
    // avoid concurrent requests, and each fetcher already pages sequentially.
    const fetchers: { label: string; run: () => Promise<GitHubEvent[]> }[] = [
      { label: "issues", run: () => this.fetchIssues(username) },
      { label: "issue comments", run: () => this.fetchIssueComments(username) },
      { label: "discussions", run: () => this.fetchDiscussions(username) },
      { label: "discussion comments", run: () => this.fetchDiscussionComments(username) },
      { label: "pull requests", run: () => this.fetchPullRequests(username) },
      { label: "pull request comments", run: () => this.fetchPullRequestComments(username) },
      {
        label: "pull request review comments",
        run: () => this.fetchPullRequestReviewComments(username),
      },
      { label: "commits", run: () => this.fetchCommits(username) },
      { label: "commit comments", run: () => this.fetchCommitComments(username) },
      { label: "gists", run: () => this.fetchGists(username) },
      { label: "releases", run: () => this.fetchReleases(username) },
      { label: "repositories", run: () => this.fetchCreatedRepositories(username) },
      { label: "wiki page edits", run: () => this.fetchWikiPageEdits(username) },
    ];

    const events: GitHubEvent[] = [];
    for (const fetcher of fetchers) {
      try {
        events.push(...(await fetcher.run()));
      } catch (error) {
        throw new Error(`Failed to fetch ${fetcher.label}: ${formatError(error)}`, {
          cause: error,
        });
      }
    }
    return events;
  }

  // Runs a request, retrying transient failures (rate limits and gateway
  // errors) with the server-suggested delay when available, falling back to
  // exponential backoff.
  private async withRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (attempt >= this.maxRetries || !isRetryableError(error)) throw error;
        const delayMs = computeRetryDelayMs({
          error,
          attempt,
          baseDelayMs: this.retryBaseDelayMs,
        });
        this.onWarning(
          `GitHub API request failed (${formatError(error)}); retrying in ${String(Math.ceil(delayMs / 1000))}s (retry ${String(attempt + 1)}/${String(this.maxRetries)}).`,
        );
        await sleep(delayMs);
      }
    }
  }

  private async execute<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.withRetry(() => this.graphqlWithAuth<T>(query, variables ?? {}));
  }

  // Minimal REST client for the endpoints the GraphQL API does not cover
  // (commit diffs and the user events feed). Reuses the GraphQL retry policy:
  // the thrown error carries `status` and `headers` in the same shape.
  private async executeRest<T>(path: string): Promise<T> {
    return this.withRetry(async () => {
      const response = await fetch(`${GITHUB_REST_BASE_URL}${path}`, {
        headers: {
          authorization: `token ${this.token}`,
          accept: "application/vnd.github+json",
          "user-agent": "ghactivities",
          "x-github-api-version": "2022-11-28",
        },
      });
      if (!response.ok) {
        // The body's message is part of the error so isRetryableError can
        // recognize secondary rate limits (403 + "rate limit" message) the
        // same way it does for GraphQL errors; reading it also releases the
        // connection.
        const bodyText = await response.text().catch(() => "");
        let bodyMessage = "";
        try {
          bodyMessage = String((JSON.parse(bodyText) as { message?: string }).message ?? "");
        } catch {
          bodyMessage = "";
        }
        const error = new Error(
          `GitHub REST API request to ${path} failed with status ${String(response.status)}${bodyMessage ? `: ${bodyMessage}` : ""}`,
        );
        Object.assign(error, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        });
        throw error;
      }
      return (await response.json()) as T;
    });
  }

  private async getViewerLogin(): Promise<string> {
    const response = await this.execute<ViewerResponse>(VIEWER_QUERY);
    return response.viewer.login;
  }

  private async getUserId(login: string): Promise<string> {
    if (this.userIdCache?.login === login) return this.userIdCache.id;
    const response = await this.execute<UserIdResponse>(USER_ID_QUERY, { login });
    if (!response.user) {
      throw new Error(`GitHub user "${login}" was not found`);
    }
    this.userIdCache = { login, id: response.user.id };
    return response.user.id;
  }

  // Search qualifiers match the parent issue/PR/discussion, not its comments.
  // Commenter searches therefore filter on `updated:` (a comment always bumps
  // the parent's updated date); bounding them by a `created:` range would drop
  // comments left on items created before the range. The exact per-comment
  // range check happens later via isWithinDateRange. `created:<=until` is safe
  // (an item must already exist to receive an in-range comment) and trims the
  // result set away from the search result cap.
  private buildWindowedSearchQuery(params: {
    qualifiers: string;
    dateField: "created" | "updated";
    window: DateRange;
  }): string {
    const sinceStr = toUtcDayString(params.window.since);
    const untilStr = toUtcDayString(params.window.until);
    if (params.dateField === "updated") {
      return `${params.qualifiers} created:<=${toUtcDayString(this.until)} updated:${sinceStr}..${untilStr}`;
    }
    return `${params.qualifiers} created:${sinceStr}..${untilStr}`;
  }

  private initialSearchWindow(dateField: "created" | "updated"): DateRange {
    // The window for commenter searches spans `updated:` dates, which reach
    // the present: an item updated after --until can still hold in-range
    // comments. The snapshot is padded by a day so items updated while the
    // collection run is in flight (e.g. across a UTC midnight) stay inside
    // the final window.
    if (dateField === "updated") {
      return { since: this.since, until: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    }
    return { since: this.since, until: this.until };
  }

  // Runs a search over a date window, splitting the window in half whenever
  // the total result count exceeds GitHub's 1,000-result cap or the query is
  // aborted with a RESOURCE_LIMITS_EXCEEDED error. A single UTC day cannot be
  // split further: a capped day loses its tail with a warning, while a
  // resource-limited day rethrows because none of its pages can be fetched.
  private async searchAllNodes<TNode>(params: {
    query: string;
    qualifiers: string;
    dateField: "created" | "updated";
    window?: DateRange;
    extraVariables?: Record<string, unknown>;
  }): Promise<TNode[]> {
    const window = params.window ?? this.initialSearchWindow(params.dateField);
    try {
      return await this.searchWindowNodes<TNode>({ ...params, window });
    } catch (error) {
      if (!isResourceLimitError(error) || !spansMultipleUtcDays(window)) throw error;
      const [firstHalf, secondHalf] = splitDateRangeAtUtcDayBoundary(window);
      const firstNodes = await this.searchAllNodes<TNode>({ ...params, window: firstHalf });
      const secondNodes = await this.searchAllNodes<TNode>({ ...params, window: secondHalf });
      return [...firstNodes, ...secondNodes];
    }
  }

  private async searchWindowNodes<TNode>(params: {
    query: string;
    qualifiers: string;
    dateField: "created" | "updated";
    window: DateRange;
    extraVariables?: Record<string, unknown>;
  }): Promise<TNode[]> {
    const window = params.window;
    const searchQuery = this.buildWindowedSearchQuery({
      qualifiers: params.qualifiers,
      dateField: params.dateField,
      window,
    });

    let response: SearchResponse<TNode> = await this.execute<SearchResponse<TNode>>(params.query, {
      ...params.extraVariables,
      searchQuery,
      first: 100,
      after: null,
    });

    const totalCount = response.search.issueCount ?? response.search.discussionCount;
    if (totalCount === undefined) {
      // Falling back to 0 here would silently disable cap detection, so a
      // query that forgets to select its count field must fail loudly.
      throw new Error(`Search query is missing its total count field: ${params.query}`);
    }
    if (totalCount > SEARCH_RESULT_CAP) {
      if (spansMultipleUtcDays(window)) {
        const [firstHalf, secondHalf] = splitDateRangeAtUtcDayBoundary(window);
        const firstNodes = await this.searchAllNodes<TNode>({ ...params, window: firstHalf });
        const secondNodes = await this.searchAllNodes<TNode>({ ...params, window: secondHalf });
        return [...firstNodes, ...secondNodes];
      }
      this.onWarning(
        `GitHub search matched ${String(totalCount)} items for "${searchQuery}" but returns at most ${String(SEARCH_RESULT_CAP)}; the excess items are skipped.`,
      );
    }

    const nodes = [...response.search.nodes];
    while (response.search.pageInfo.hasNextPage && response.search.pageInfo.endCursor) {
      response = await this.execute<SearchResponse<TNode>>(params.query, {
        ...params.extraVariables,
        searchQuery,
        first: 100,
        after: response.search.pageInfo.endCursor,
      });
      nodes.push(...response.search.nodes);
    }
    return nodes;
  }

  private matchesVisibility(visibility: RepositoryVisibility): boolean {
    if (this.visibility === "all") return true;
    if (this.visibility === "public") return visibility === "PUBLIC";
    // INTERNAL (org-internal on GitHub Enterprise) repositories are not
    // publicly visible, so they group with private.
    return visibility === "PRIVATE" || visibility === "INTERNAL";
  }

  private isWithinDateRange(dateStr: string): boolean {
    const date = new Date(dateStr);
    return date >= this.since && date <= this.until;
  }

  // The comment searches embed only the first 100 comments per item. Comments
  // are returned oldest-first, so on long threads the recent (likely in-range)
  // comments live in the tail pages, which must be fetched via the node query.
  private async fetchAllComments(params: {
    nodeId: string;
    comments: CommentsConnection;
    pageQuery: string;
  }): Promise<CommentNode[]> {
    const comments = [...params.comments.nodes];
    let { hasNextPage, endCursor } = params.comments.pageInfo;

    while (hasNextPage && endCursor) {
      const response: CommentsPageResponse = await this.execute<CommentsPageResponse>(
        params.pageQuery,
        { nodeId: params.nodeId, first: 100, after: endCursor },
      );
      const page = response.node?.comments;
      if (!page) break;
      comments.push(...page.nodes);
      ({ hasNextPage, endCursor } = page.pageInfo);
    }

    return comments;
  }

  private async fetchIssues(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<IssueNode>({
      query: ISSUE_SEARCH_QUERY,
      qualifiers: `author:${username} is:issue`,
      dateField: "created",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (this.matchesVisibility(node.repository.visibility)) {
        events.push({
          type: "Issue",
          createdAt: node.createdAt,
          title: node.title,
          url: node.url,
          body: node.body,
          repository: {
            owner: node.repository.owner.login,
            name: node.repository.name,
            visibility: node.repository.visibility,
          },
        });
      }
    }

    return events;
  }

  private async fetchIssueComments(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<IssueWithCommentsNode>({
      query: ISSUE_COMMENT_SEARCH_QUERY,
      qualifiers: `commenter:${username} is:issue`,
      dateField: "updated",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (!this.matchesVisibility(node.repository.visibility)) continue;

      const comments = await this.fetchAllComments({
        nodeId: node.id,
        comments: node.comments,
        pageQuery: ISSUE_COMMENTS_PAGE_QUERY,
      });
      for (const comment of comments) {
        if (comment.author?.login === username && this.isWithinDateRange(comment.createdAt)) {
          const editHistory = toEditHistory(comment.userContentEdits);
          events.push({
            type: "IssueComment",
            createdAt: comment.createdAt,
            issueTitle: node.title,
            issueUrl: node.url,
            body: comment.body,
            url: comment.url,
            repository: {
              owner: node.repository.owner.login,
              name: node.repository.name,
              visibility: node.repository.visibility,
            },
            ...(editHistory ? { editHistory } : {}),
          });
        }
      }
    }

    return events;
  }

  private async fetchDiscussions(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<DiscussionNode>({
      query: DISCUSSION_SEARCH_QUERY,
      qualifiers: `author:${username} type:discussion`,
      dateField: "created",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (this.matchesVisibility(node.repository.visibility)) {
        events.push({
          type: "Discussion",
          createdAt: node.createdAt,
          title: node.title,
          url: node.url,
          body: node.body,
          repository: {
            owner: node.repository.owner.login,
            name: node.repository.name,
            visibility: node.repository.visibility,
          },
        });
      }
    }

    return events;
  }

  private async fetchDiscussionComments(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<DiscussionWithCommentsNode>({
      query: DISCUSSION_COMMENT_SEARCH_QUERY,
      qualifiers: `commenter:${username} type:discussion`,
      dateField: "updated",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (!this.matchesVisibility(node.repository.visibility)) continue;

      const comments = await this.fetchAllComments({
        nodeId: node.id,
        comments: node.comments,
        pageQuery: DISCUSSION_COMMENTS_PAGE_QUERY,
      });
      for (const comment of comments) {
        if (comment.author?.login === username && this.isWithinDateRange(comment.createdAt)) {
          const editHistory = toEditHistory(comment.userContentEdits);
          events.push({
            type: "DiscussionComment",
            createdAt: comment.createdAt,
            discussionTitle: node.title,
            discussionUrl: node.url,
            body: comment.body,
            url: comment.url,
            repository: {
              owner: node.repository.owner.login,
              name: node.repository.name,
              visibility: node.repository.visibility,
            },
            ...(editHistory ? { editHistory } : {}),
          });
        }
      }
    }

    return events;
  }

  private async fetchPullRequests(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<PullRequestNode>({
      query: PULL_REQUEST_SEARCH_QUERY,
      qualifiers: `author:${username} is:pr`,
      dateField: "created",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (this.matchesVisibility(node.repository.visibility)) {
        events.push({
          type: "PullRequest",
          createdAt: node.createdAt,
          title: node.title,
          url: node.url,
          body: node.body,
          repository: {
            owner: node.repository.owner.login,
            name: node.repository.name,
            visibility: node.repository.visibility,
          },
        });
      }
    }

    return events;
  }

  private async fetchPullRequestComments(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<PullRequestWithCommentsNode>({
      query: PULL_REQUEST_COMMENT_SEARCH_QUERY,
      qualifiers: `commenter:${username} is:pr`,
      dateField: "updated",
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (!this.matchesVisibility(node.repository.visibility)) continue;

      const comments = await this.fetchAllComments({
        nodeId: node.id,
        comments: node.comments,
        pageQuery: PULL_REQUEST_COMMENTS_PAGE_QUERY,
      });
      for (const comment of comments) {
        if (comment.author?.login === username && this.isWithinDateRange(comment.createdAt)) {
          const editHistory = toEditHistory(comment.userContentEdits);
          events.push({
            type: "PullRequestComment",
            createdAt: comment.createdAt,
            prTitle: node.title,
            prUrl: node.url,
            body: comment.body,
            url: comment.url,
            repository: {
              owner: node.repository.owner.login,
              name: node.repository.name,
              visibility: node.repository.visibility,
            },
            ...(editHistory ? { editHistory } : {}),
          });
        }
      }
    }

    return events;
  }

  // Mirrors fetchAllComments for the reviews connection of a pull request.
  private async fetchAllReviews(params: {
    nodeId: string;
    reviews: ReviewsConnection;
    reviewAuthor: string;
  }): Promise<ReviewNode[]> {
    const reviews = [...params.reviews.nodes];
    let { hasNextPage, endCursor } = params.reviews.pageInfo;

    while (hasNextPage && endCursor) {
      const response: ReviewsPageResponse = await this.execute<ReviewsPageResponse>(
        REVIEWS_PAGE_QUERY,
        { nodeId: params.nodeId, first: 25, after: endCursor, reviewAuthor: params.reviewAuthor },
      );
      const page = response.node?.reviews;
      if (!page) break;
      reviews.push(...page.nodes);
      ({ hasNextPage, endCursor } = page.pageInfo);
    }

    return reviews;
  }

  // Collects review feedback the user left on pull requests: review summary
  // bodies (when non-empty) and inline review comments on the diff. Neither is
  // part of the conversation `comments` connection, so the commenter: search
  // never surfaces them; PRs are found via reviewed-by: instead.
  private async fetchPullRequestReviewComments(username: string): Promise<GitHubEvent[]> {
    const nodes = await this.searchAllNodes<PullRequestWithReviewsNode>({
      query: PULL_REQUEST_REVIEW_SEARCH_QUERY,
      qualifiers: `reviewed-by:${username} is:pr`,
      dateField: "updated",
      extraVariables: { reviewAuthor: username },
    });

    const events: GitHubEvent[] = [];
    for (const node of nodes) {
      if (!this.matchesVisibility(node.repository.visibility)) continue;

      const repository = {
        owner: node.repository.owner.login,
        name: node.repository.name,
        visibility: node.repository.visibility,
      };

      const reviews = await this.fetchAllReviews({
        nodeId: node.id,
        reviews: node.reviews,
        reviewAuthor: username,
      });
      for (const review of reviews) {
        // The query already filters by author server-side; this guard (and the
        // per-comment one below) keeps the trust in our own filtering. Inline
        // comments share the review's author, so other users' reviews can be
        // skipped without paging their comments.
        if (review.author?.login !== username) continue;

        // A review drafted earlier counts from its submission time.
        const reviewTimestamp = review.submittedAt ?? review.createdAt;
        if (review.body !== "" && this.isWithinDateRange(reviewTimestamp)) {
          const editHistory = toEditHistory(review.userContentEdits);
          events.push({
            type: "PullRequestReviewComment",
            createdAt: reviewTimestamp,
            prTitle: node.title,
            prUrl: node.url,
            body: review.body,
            url: review.url,
            repository,
            ...(editHistory ? { editHistory } : {}),
          });
        }

        const comments = await this.fetchAllComments({
          nodeId: review.id,
          comments: review.comments,
          pageQuery: REVIEW_COMMENTS_PAGE_QUERY,
        });
        for (const comment of comments) {
          if (comment.author?.login === username && this.isWithinDateRange(comment.createdAt)) {
            const editHistory = toEditHistory(comment.userContentEdits);
            events.push({
              type: "PullRequestReviewComment",
              createdAt: comment.createdAt,
              prTitle: node.title,
              prUrl: node.url,
              body: comment.body,
              url: comment.url,
              repository,
              ...(editHistory ? { editHistory } : {}),
            });
          }
        }
      }
    }

    return events;
  }

  // Discovers repositories to scan for commits. contributionsCollection only
  // counts default-branch (and gh-pages) commits, so with --branches all the
  // user's own repositories pushed within the range are added on top; branches
  // of unowned repositories without default-branch contributions can still be
  // missed (documented in the README).
  private async discoverCommitRepositories(
    username: string,
  ): Promise<Map<string, RepositoryVisibility>> {
    const repoMap = new Map<string, RepositoryVisibility>();
    const periods = splitDateRangeIntoYearPeriods({
      since: this.since,
      until: this.until,
    });

    for (const period of periods) {
      const response = await this.execute<ContributionsCollectionResponse>(
        CONTRIBUTIONS_COLLECTION_QUERY,
        {
          login: username,
          from: period.since.toISOString(),
          to: period.until.toISOString(),
        },
      );

      for (const repo of response.user.contributionsCollection.commitContributionsByRepository) {
        if (this.matchesVisibility(repo.repository.visibility)) {
          const key = `${repo.repository.owner.login}/${repo.repository.name}`;
          repoMap.set(key, repo.repository.visibility);
        }
      }
    }

    if (this.branches === "all") {
      let after: string | null = null;
      let hasNext = true;
      while (hasNext) {
        const response: PushedRepositoriesResponse = await this.execute<PushedRepositoriesResponse>(
          PUSHED_REPOSITORIES_QUERY,
          {
            login: username,
            first: 50,
            after,
          },
        );
        const connection = response.user?.repositories;
        if (!connection) break;
        let reachedOlder = false;
        for (const node of connection.nodes) {
          // The ordering of never-pushed repositories under PUSHED_AT DESC is
          // not specified, so a null pushedAt is skipped rather than treated
          // as an early-stop signal.
          if (node.pushedAt === null) continue;
          if (new Date(node.pushedAt) < this.since) {
            reachedOlder = true;
            break;
          }
          if (this.matchesVisibility(node.visibility)) {
            repoMap.set(`${node.owner.login}/${node.name}`, node.visibility);
          }
        }
        hasNext =
          !reachedOlder &&
          connection.pageInfo.hasNextPage &&
          connection.pageInfo.endCursor !== null;
        after = connection.pageInfo.endCursor;
      }
    }

    return repoMap;
  }

  // Pages one branch's commit history. The history connection shape is shared
  // by the default-branch and per-ref queries.
  private async collectBranchHistory(params: {
    owner: string;
    name: string;
    branch: string | null;
    authorId: string;
  }): Promise<{ branch: string; nodes: CommitHistoryNode[] } | null> {
    const nodes: CommitHistoryNode[] = [];
    let branchName = params.branch;
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const variables = {
        owner: params.owner,
        name: params.name,
        since: this.since.toISOString(),
        until: this.until.toISOString(),
        first: 100,
        after: cursor,
        authorId: params.authorId,
      };

      let history: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: CommitHistoryNode[];
      };
      if (params.branch === null) {
        const response: CommitHistoryResponse = await this.execute<CommitHistoryResponse>(
          COMMIT_HISTORY_QUERY,
          variables,
        );
        const ref = response.repository.defaultBranchRef;
        if (!ref) return null;
        branchName = ref.name;
        history = ref.target.history;
      } else {
        const response: BranchCommitHistoryResponse =
          await this.execute<BranchCommitHistoryResponse>(BRANCH_COMMIT_HISTORY_QUERY, {
            ...variables,
            qualifiedName: `refs/heads/${params.branch}`,
          });
        const target = response.repository?.ref?.target;
        if (!target?.history) return null;
        history = target.history;
      }

      nodes.push(...history.nodes);
      hasNext = history.pageInfo.hasNextPage && history.pageInfo.endCursor !== null;
      cursor = history.pageInfo.endCursor;
    }

    return branchName === null ? null : { branch: branchName, nodes };
  }

  private async listBranches(params: { owner: string; name: string }): Promise<string[]> {
    const branches: string[] = [];
    let after: string | null = null;
    let hasNext = true;
    while (hasNext) {
      const response: BranchRefsResponse = await this.execute<BranchRefsResponse>(
        BRANCH_REFS_QUERY,
        { owner: params.owner, name: params.name, first: 100, after },
      );
      const refs = response.repository?.refs;
      if (!refs) break;
      branches.push(...refs.nodes.map((node) => node.name));
      hasNext = refs.pageInfo.hasNextPage && refs.pageInfo.endCursor !== null;
      after = refs.pageInfo.endCursor;
    }
    return branches;
  }

  // The commit endpoint returns at most 300 files per page; larger commits
  // must be paged so no changed file is silently dropped from the audit.
  private static readonly COMMIT_DIFF_FILES_PER_PAGE = 300;

  private async fetchCommitDiff(params: {
    owner: string;
    name: string;
    oid: string;
  }): Promise<CommitDiffFile[]> {
    const basePath = `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}/commits/${encodeURIComponent(params.oid)}`;
    const files: CommitDiffFile[] = [];

    for (let page = 1; ; page++) {
      const detail = await this.executeRest<RestCommitDetail>(`${basePath}?page=${String(page)}`);
      const pageFiles = detail.files ?? [];
      files.push(
        ...pageFiles.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch ?? null,
        })),
      );
      if (pageFiles.length < GitHubService.COMMIT_DIFF_FILES_PER_PAGE) break;
    }

    return files;
  }

  private async fetchCommits(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    const authorId = await this.getUserId(username);
    const repoMap = await this.discoverCommitRepositories(username);

    for (const [repoKey, visibility] of repoMap) {
      const [owner, name] = repoKey.split("/") as [string, string];

      // With --branches all, the same commit is usually reachable from several
      // branches; it is emitted once, listing every branch it was seen on.
      const commitsByOid = new Map<string, { node: CommitHistoryNode; branches: string[] }>();
      const branchNames =
        this.branches === "all" ? await this.listBranches({ owner, name }) : [null];
      if (branchNames.length > MANY_BRANCHES_WARNING_THRESHOLD) {
        this.onWarning(
          `${owner}/${name} has ${String(branchNames.length)} branches; scanning all of them may be slow and consume the API rate limit.`,
        );
      }

      for (const branch of branchNames) {
        const result = await this.collectBranchHistory({ owner, name, branch, authorId });
        if (!result) continue;
        for (const node of result.nodes) {
          const entry = commitsByOid.get(node.oid);
          if (entry) {
            entry.branches.push(result.branch);
          } else {
            commitsByOid.set(node.oid, { node, branches: [result.branch] });
          }
        }
      }

      for (const { node, branches } of commitsByOid.values()) {
        const event: CommitEvent = {
          type: "Commit",
          createdAt: node.committedDate,
          message: node.message,
          url: node.url,
          oid: node.oid,
          branches,
          repository: {
            owner,
            name,
            visibility,
          },
        };
        if (this.commitDiff) {
          event.diff = await this.fetchCommitDiff({ owner, name, oid: node.oid });
        }
        events.push(event);
      }
    }

    return events;
  }

  private async fetchCommitComments(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let after: string | null = null;
    let hasNext = true;

    // The commitComments connection has no orderBy, so every page is scanned
    // and filtered by the date range.
    while (hasNext) {
      const response: CommitCommentsResponse = await this.execute<CommitCommentsResponse>(
        COMMIT_COMMENTS_QUERY,
        { login: username, first: 100, after },
      );
      const connection = response.user?.commitComments;
      if (!connection) break;

      for (const node of connection.nodes) {
        if (!this.matchesVisibility(node.repository.visibility)) continue;
        if (!this.isWithinDateRange(node.createdAt)) continue;
        const editHistory = toEditHistory(node.userContentEdits);
        events.push({
          type: "CommitComment",
          createdAt: node.createdAt,
          body: node.body,
          url: node.url,
          commitOid: node.commit?.oid ?? null,
          repository: {
            owner: node.repository.owner.login,
            name: node.repository.name,
            visibility: node.repository.visibility,
          },
          ...(editHistory ? { editHistory } : {}),
        });
      }

      hasNext = connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null;
      after = connection.pageInfo.endCursor;
    }

    return events;
  }

  // Gists need their own token permission (the "gist" scope, or Gists read
  // access on fine-grained tokens). A token without it should not fail the
  // whole collection run, so the fetch degrades to a warning.
  private async fetchGists(username: string): Promise<GitHubEvent[]> {
    try {
      return await this.collectGists(username);
    } catch (error) {
      if (isTokenAccessError(error)) {
        this.onWarning(
          `Gists could not be collected (${formatError(error)}); grant the token gist read access to include them.`,
        );
        return [];
      }
      throw error;
    }
  }

  private async collectGists(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let after: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const response: GistsResponse = await this.execute<GistsResponse>(GISTS_QUERY, {
        login: username,
        first: 100,
        after,
      });
      const connection = response.user?.gists;
      if (!connection) break;

      // Newest first: everything after the first gist older than --since is
      // out of range too.
      let reachedOlder = false;
      for (const node of connection.nodes) {
        if (new Date(node.createdAt) < this.since) {
          reachedOlder = true;
          break;
        }
        // Secret gists group with private repositories.
        const visibility: RepositoryVisibility = node.isPublic ? "PUBLIC" : "PRIVATE";
        if (!this.matchesVisibility(visibility)) continue;
        if (!this.isWithinDateRange(node.createdAt)) continue;
        events.push({
          type: "Gist",
          createdAt: node.createdAt,
          description: node.description,
          url: node.url,
          files: (node.files ?? []).flatMap((file) =>
            file ? [{ name: file.name, size: file.size, text: file.text }] : [],
          ),
          repository: {
            owner: username,
            name: node.name,
            visibility,
          },
        });
      }

      hasNext =
        !reachedOlder && connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null;
      after = connection.pageInfo.endCursor;
    }

    return events;
  }

  // Collects the in-range releases of one repository, paging past the first
  // 25 only while the (newest-first) scan is still inside the date range.
  private async collectRepositoryReleases(params: {
    repo: RepositoryWithReleasesNode;
    username: string;
  }): Promise<GitHubEvent[]> {
    const { repo, username } = params;
    if (!this.matchesVisibility(repo.visibility)) return [];

    const events: GitHubEvent[] = [];
    let connection: ReleasesConnection = repo.releases;

    for (;;) {
      let reachedOlder = false;
      for (const release of connection.nodes) {
        // The connection is ordered by creation time, so the early stop must
        // use createdAt; the range check uses the publication time so a
        // release drafted earlier still counts from when it went live.
        // (A release drafted before --since and published inside the range is
        // missed by the early stop; documented in the README.)
        if (new Date(release.createdAt) < this.since) {
          reachedOlder = true;
          break;
        }
        if (release.author?.login !== username) continue;
        const releaseTimestamp = release.publishedAt ?? release.createdAt;
        if (!this.isWithinDateRange(releaseTimestamp)) continue;
        events.push({
          type: "Release",
          createdAt: releaseTimestamp,
          title: release.name ?? release.tagName,
          tagName: release.tagName,
          url: release.url,
          body: release.description,
          isPrerelease: release.isPrerelease,
          isDraft: release.isDraft,
          assets: release.releaseAssets.nodes.map((asset) => ({
            name: asset.name,
            url: asset.downloadUrl,
            size: asset.size,
            contentType: asset.contentType,
          })),
          repository: {
            owner: repo.owner.login,
            name: repo.name,
            visibility: repo.visibility,
          },
        });
      }

      if (reachedOlder || !connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
        break;
      }
      const response: ReleasesPageResponse = await this.execute<ReleasesPageResponse>(
        RELEASES_PAGE_QUERY,
        {
          owner: repo.owner.login,
          name: repo.name,
          first: 25,
          after: connection.pageInfo.endCursor,
        },
      );
      if (!response.repository) break;
      connection = response.repository.releases;
    }

    return events;
  }

  // Releases are discovered by walking the user's own repositories; releases
  // the user published in repositories they do not own are not collected
  // (documented in the README).
  private async fetchReleases(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let after: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const response: RepositoriesWithReleasesResponse =
        await this.execute<RepositoriesWithReleasesResponse>(REPOSITORIES_WITH_RELEASES_QUERY, {
          login: username,
          first: 50,
          after,
        });
      const connection = response.user?.repositories;
      if (!connection) break;

      for (const repo of connection.nodes) {
        events.push(...(await this.collectRepositoryReleases({ repo, username })));
      }

      hasNext = connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null;
      after = connection.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchCreatedRepositories(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let after: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const response: CreatedRepositoriesResponse = await this.execute<CreatedRepositoriesResponse>(
        CREATED_REPOSITORIES_QUERY,
        {
          login: username,
          first: 50,
          after,
        },
      );
      const connection = response.user?.repositories;
      if (!connection) break;

      // Newest first: stop at the first repository created before --since.
      let reachedOlder = false;
      for (const node of connection.nodes) {
        if (new Date(node.createdAt) < this.since) {
          reachedOlder = true;
          break;
        }
        if (!this.matchesVisibility(node.visibility)) continue;
        if (!this.isWithinDateRange(node.createdAt)) continue;
        events.push({
          type: "Repository",
          createdAt: node.createdAt,
          url: node.url,
          description: node.description,
          isFork: node.isFork,
          readme: node.object?.text ?? null,
          repository: {
            owner: node.owner.login,
            name: node.name,
            visibility: node.visibility,
          },
        });
      }

      hasNext =
        !reachedOlder && connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null;
      after = connection.pageInfo.endCursor;
    }

    return events;
  }

  // Wiki edits have no GraphQL or dedicated REST API; the user events feed is
  // the only source, and GitHub caps it at the most recent 300 events within
  // 90 days. A warning is emitted when that window cannot cover --since.
  private async fetchWikiPageEdits(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];

    if (Date.now() - this.since.getTime() > EVENTS_FEED_MAX_AGE_MS) {
      this.onWarning(
        "Wiki page edits come from the GitHub events feed, which only covers the most recent 90 days; older wiki edits in the range are missing.",
      );
    }

    let feedExhausted = false;
    let oldestSeen: Date | null = null;

    for (let page = 1; page <= EVENTS_FEED_MAX_PAGES; page++) {
      const items = await this.executeRest<RestUserEvent[]>(
        `/users/${encodeURIComponent(username)}/events?per_page=${String(EVENTS_FEED_PAGE_SIZE)}&page=${String(page)}`,
      );

      for (const item of items) {
        const createdAt = new Date(item.created_at);
        if (oldestSeen === null || createdAt < oldestSeen) oldestSeen = createdAt;
        if (item.type !== "GollumEvent") continue;
        if (!this.isWithinDateRange(item.created_at)) continue;
        // The feed only distinguishes public from non-public.
        const visibility: RepositoryVisibility = item.public ? "PUBLIC" : "PRIVATE";
        if (!this.matchesVisibility(visibility)) continue;
        const [owner, name] = item.repo.name.split("/") as [string, string];
        for (const wikiPage of item.payload.pages ?? []) {
          events.push({
            type: "WikiPageEdit",
            createdAt: item.created_at,
            pageTitle: wikiPage.title,
            action: wikiPage.action,
            url: wikiPage.html_url,
            repository: { owner, name, visibility },
          });
        }
      }

      if (items.length < EVENTS_FEED_PAGE_SIZE) {
        feedExhausted = true;
        break;
      }
      // The feed is newest-first: once past --since, older pages are irrelevant.
      if (oldestSeen !== null && oldestSeen < this.since) break;
    }

    if (!feedExhausted && oldestSeen !== null && oldestSeen > this.since) {
      this.onWarning(
        "The GitHub events feed returns at most 300 events and did not reach --since; some wiki page edits in the range may be missing.",
      );
    }

    return events;
  }
}
