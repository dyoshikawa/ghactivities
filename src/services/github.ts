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
  SearchResponse,
  ViewerResponse,
} from "../types/github-api.js";
import type { DateRange } from "../utils/date-range.js";

import {
  spansMultipleUtcDays,
  splitDateRangeAtUtcDayBoundary,
  splitDateRangeIntoYearPeriods,
  toUtcDayString,
} from "../utils/date-range.js";
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
  PULL_REQUEST_SEARCH_QUERY,
  VIEWER_ID_QUERY,
  VIEWER_QUERY,
} from "./github-queries.js";

interface GitHubServiceParams {
  token: string;
  since: Date;
  until: Date;
  visibility: Visibility;
  onWarning?: (message: string) => void;
}

// GitHub's Search API never returns more than 1,000 results per query.
const SEARCH_RESULT_CAP = 1000;

export class GitHubService {
  private readonly graphqlWithAuth: typeof graphql;
  private readonly since: Date;
  private readonly until: Date;
  private readonly visibility: Visibility;
  private readonly onWarning: (message: string) => void;

  constructor(params: GitHubServiceParams) {
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${params.token}` },
    });
    this.since = params.since;
    this.until = params.until;
    this.visibility = params.visibility;
    this.onWarning = params.onWarning ?? (() => {});
  }

  async fetchAllEvents(): Promise<GitHubEvent[]> {
    const username = await this.getViewerLogin();

    const results = await Promise.all([
      this.fetchIssues(username),
      this.fetchIssueComments(username),
      this.fetchDiscussions(username),
      this.fetchDiscussionComments(username),
      this.fetchPullRequests(username),
      this.fetchPullRequestComments(username),
      this.fetchCommits(username),
    ]);

    return results.flat();
  }

  private async getViewerLogin(): Promise<string> {
    const response = await this.graphqlWithAuth<ViewerResponse>(VIEWER_QUERY);
    return response.viewer.login;
  }

  private async getViewerId(): Promise<string> {
    const response = await this.graphqlWithAuth<{
      viewer: { id: string; login: string };
    }>(VIEWER_ID_QUERY);
    return response.viewer.id;
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
  }): Promise<TNode[]> {
    const window = params.window ?? this.initialSearchWindow(params.dateField);
    const searchQuery = this.buildWindowedSearchQuery({
      qualifiers: params.qualifiers,
      dateField: params.dateField,
      window,
    });

    let response: SearchResponse<TNode> = await this.graphqlWithAuth<SearchResponse<TNode>>(
      params.query,
      { searchQuery, first: 100, after: null },
    );

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
      response = await this.graphqlWithAuth<SearchResponse<TNode>>(params.query, {
        searchQuery,
        first: 100,
        after: response.search.pageInfo.endCursor,
      });
      nodes.push(...response.search.nodes);
    }
    return nodes;
  }

  private matchesVisibility(visibility: "PUBLIC" | "PRIVATE"): boolean {
    if (this.visibility === "all") return true;
    if (this.visibility === "public") return visibility === "PUBLIC";
    return visibility === "PRIVATE";
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
      const response: CommentsPageResponse = await this.graphqlWithAuth<CommentsPageResponse>(
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

  private async fetchCommits(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    const viewerId = await this.getViewerId();
    const periods = splitDateRangeIntoYearPeriods({
      since: this.since,
      until: this.until,
    });

    const repoMap = new Map<string, "PUBLIC" | "PRIVATE">();

    for (const period of periods) {
      const response = await this.graphqlWithAuth<ContributionsCollectionResponse>(
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
        const response: CommitHistoryResponse = await this.graphqlWithAuth<CommitHistoryResponse>(
          COMMIT_HISTORY_QUERY,
          {
            owner,
            name,
            since: this.since.toISOString(),
            until: this.until.toISOString(),
            first: 100,
            after: cursor,
            authorId: viewerId,
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
