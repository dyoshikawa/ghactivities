import { graphql } from "@octokit/graphql";

import type { Visibility } from "../types/cli.js";
import type { GitHubEvent } from "../types/events.js";
import type {
  CommitHistoryResponse,
  ContributionsCollectionResponse,
  DiscussionCommentSearchResponse,
  DiscussionSearchResponse,
  IssueCommentSearchResponse,
  IssueSearchResponse,
  PullRequestCommentSearchResponse,
  PullRequestSearchResponse,
  ViewerResponse,
} from "../types/github-api.js";

import { splitDateRangeIntoYearPeriods } from "../utils/date-range.js";
import {
  COMMIT_HISTORY_QUERY,
  CONTRIBUTIONS_COLLECTION_QUERY,
  DISCUSSION_COMMENT_SEARCH_QUERY,
  DISCUSSION_SEARCH_QUERY,
  ISSUE_COMMENT_SEARCH_QUERY,
  ISSUE_SEARCH_QUERY,
  PULL_REQUEST_COMMENT_SEARCH_QUERY,
  PULL_REQUEST_SEARCH_QUERY,
  VIEWER_ID_QUERY,
  VIEWER_QUERY,
} from "./github-queries.js";

interface GitHubServiceParams {
  token: string;
  since: Date;
  until: Date;
  visibility: Visibility;
}

export class GitHubService {
  private readonly graphqlWithAuth: typeof graphql;
  private readonly since: Date;
  private readonly until: Date;
  private readonly visibility: Visibility;

  constructor(params: GitHubServiceParams) {
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${params.token}` },
    });
    this.since = params.since;
    this.until = params.until;
    this.visibility = params.visibility;
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

  private buildSearchQuery(params: { user: string; qualifiers: string }): string {
    const sinceStr = this.since.toISOString().split("T")[0]!;
    const untilStr = this.until.toISOString().split("T")[0]!;
    return `${params.qualifiers} created:${sinceStr}..${untilStr}`;
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

  private async fetchIssues(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `author:${username} is:issue`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: IssueSearchResponse = await this.graphqlWithAuth<IssueSearchResponse>(
        ISSUE_SEARCH_QUERY,
        { query, first: 100, after: cursor },
      );

      for (const node of response.search.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchIssueComments(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `commenter:${username} is:issue`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: IssueCommentSearchResponse =
        await this.graphqlWithAuth<IssueCommentSearchResponse>(ISSUE_COMMENT_SEARCH_QUERY, {
          query,
          first: 100,
          after: cursor,
        });

      for (const node of response.search.nodes) {
        if (!this.matchesVisibility(node.repository.visibility)) continue;

        for (const comment of node.comments.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchDiscussions(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `author:${username} type:discussion`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: DiscussionSearchResponse =
        await this.graphqlWithAuth<DiscussionSearchResponse>(DISCUSSION_SEARCH_QUERY, {
          query,
          first: 100,
          after: cursor,
        });

      for (const node of response.search.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchDiscussionComments(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `commenter:${username} type:discussion`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: DiscussionCommentSearchResponse =
        await this.graphqlWithAuth<DiscussionCommentSearchResponse>(
          DISCUSSION_COMMENT_SEARCH_QUERY,
          { query, first: 100, after: cursor },
        );

      for (const node of response.search.nodes) {
        if (!this.matchesVisibility(node.repository.visibility)) continue;

        for (const comment of node.comments.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchPullRequests(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `author:${username} is:pr`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: PullRequestSearchResponse =
        await this.graphqlWithAuth<PullRequestSearchResponse>(PULL_REQUEST_SEARCH_QUERY, {
          query,
          first: 100,
          after: cursor,
        });

      for (const node of response.search.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
    }

    return events;
  }

  private async fetchPullRequestComments(username: string): Promise<GitHubEvent[]> {
    const events: GitHubEvent[] = [];
    let cursor: string | null = null;

    const query = this.buildSearchQuery({
      user: username,
      qualifiers: `commenter:${username} is:pr`,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response: PullRequestCommentSearchResponse =
        await this.graphqlWithAuth<PullRequestCommentSearchResponse>(
          PULL_REQUEST_COMMENT_SEARCH_QUERY,
          { query, first: 100, after: cursor },
        );

      for (const node of response.search.nodes) {
        if (!this.matchesVisibility(node.repository.visibility)) continue;

        for (const comment of node.comments.nodes) {
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

      if (!response.search.pageInfo.hasNextPage) break;
      cursor = response.search.pageInfo.endCursor;
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
