import { graphql } from "@octokit/graphql";

import type { Visibility } from "../types/cli.js";
import type { GitHubEvent } from "../types/events.js";
import type {
  CommentNode,
  CommentsConnection,
  CommentsPageResponse,
  CommitHistoryResponse,
  ContributionsCollectionResponse,
  DiscussionNode,
  DiscussionWithCommentsNode,
  IssueNode,
  IssueWithCommentsNode,
  PullRequestNode,
  PullRequestWithCommentsNode,
  PullRequestWithReviewsNode,
  RepositoryVisibility,
  ReviewNode,
  ReviewsConnection,
  ReviewsPageResponse,
  SearchResponse,
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
  COMMIT_HISTORY_QUERY,
  CONTRIBUTIONS_COLLECTION_QUERY,
  DISCUSSION_COMMENT_SEARCH_QUERY,
  DISCUSSION_COMMENTS_PAGE_QUERY,
  DISCUSSION_SEARCH_QUERY,
  ISSUE_COMMENT_SEARCH_QUERY,
  ISSUE_COMMENTS_PAGE_QUERY,
  ISSUE_SEARCH_QUERY,
  PULL_REQUEST_COMMENT_SEARCH_QUERY,
  PULL_REQUEST_COMMENTS_PAGE_QUERY,
  PULL_REQUEST_REVIEW_SEARCH_QUERY,
  PULL_REQUEST_SEARCH_QUERY,
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
  onWarning?: (message: string) => void;
  retry?: {
    maxRetries?: number;
    baseDelayMs?: number;
  };
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  private readonly username: string | undefined;
  // Caches the id lookup, which runs both as the up-front --user existence
  // check and for the commit history author filter.
  private userIdCache: { login: string; id: string } | undefined;
  private readonly since: Date;
  private readonly until: Date;
  private readonly visibility: Visibility;
  private readonly onWarning: (message: string) => void;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(params: GitHubServiceParams) {
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${params.token}` },
    });
    this.username = params.username;
    this.since = params.since;
    this.until = params.until;
    this.visibility = params.visibility;
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

  // Executes a GraphQL request, retrying transient failures (rate limits and
  // gateway errors) with the server-suggested delay when available, falling
  // back to exponential backoff.
  private async execute<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.graphqlWithAuth<T>(query, variables ?? {});
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
  // the total result count exceeds GitHub's 1,000-result cap. A single UTC day
  // cannot be split further; in that case the tail is lost and a warning is
  // emitted instead of silently truncating.
  private async searchAllNodes<TNode>(params: {
    query: string;
    qualifiers: string;
    dateField: "created" | "updated";
    window?: DateRange;
    extraVariables?: Record<string, unknown>;
  }): Promise<TNode[]> {
    const window = params.window ?? this.initialSearchWindow(params.dateField);
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
          events.push({
            type: "PullRequestReviewComment",
            createdAt: reviewTimestamp,
            prTitle: node.title,
            prUrl: node.url,
            body: review.body,
            url: review.url,
            repository,
          });
        }

        const comments = await this.fetchAllComments({
          nodeId: review.id,
          comments: review.comments,
          pageQuery: REVIEW_COMMENTS_PAGE_QUERY,
        });
        for (const comment of comments) {
          if (comment.author?.login === username && this.isWithinDateRange(comment.createdAt)) {
            events.push({
              type: "PullRequestReviewComment",
              createdAt: comment.createdAt,
              prTitle: node.title,
              prUrl: node.url,
              body: comment.body,
              url: comment.url,
              repository,
            });
          }
        }
      }
    }

    return events;
  }

  private async fetchCommits(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    const authorId = await this.getUserId(username);
    const periods = splitDateRangeIntoYearPeriods({
      since: this.since,
      until: this.until,
    });

    const repoMap = new Map<string, RepositoryVisibility>();

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

    for (const [repoKey, visibility] of repoMap) {
      const [owner, name] = repoKey.split("/") as [string, string];
      let cursor: string | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response: CommitHistoryResponse = await this.execute<CommitHistoryResponse>(
          COMMIT_HISTORY_QUERY,
          {
            owner,
            name,
            since: this.since.toISOString(),
            until: this.until.toISOString(),
            first: 100,
            after: cursor,
            authorId,
          },
        );

        const ref = response.repository.defaultBranchRef;
        if (!ref) break;

        for (const node of ref.target.history.nodes) {
          events.push({
            type: "Commit",
            createdAt: node.committedDate,
            message: node.message,
            url: node.url,
            oid: node.oid,
            repository: {
              owner,
              name,
              visibility,
            },
          });
        }

        if (!ref.target.history.pageInfo.hasNextPage) break;
        cursor = ref.target.history.pageInfo.endCursor;
      }
    }

    return events;
  }
}
