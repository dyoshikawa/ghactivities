import { graphql } from "@octokit/graphql";
import type { ProgressDisplay } from "../cli/ui/progress.js";
import type { GitHubEventUnion, ParsedCliOptions } from "../types/index.js";

interface GitHubUser {
  login: string;
  url: string;
}

interface Label {
  name: string;
  color: string;
}

interface Repository {
  name: string;
  owner: { login: string };
  url: string;
  visibility: string;
}

interface BaseNode {
  body: string;
  url: string;
  createdAt: string;
  author: GitHubUser;
}

interface GraphQLSearchResponse<T> {
  search: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
    nodes: T[];
  };
}

interface IssueNode {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  labels: { nodes: Label[] };
  repository: Repository;
  author: GitHubUser;
  comments: { nodes: CommentNode[] };
}

type CommentNode = BaseNode;

interface PullRequestNode {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  baseRefName: string;
  headRefName: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  repository: Repository;
  author: GitHubUser;
  reviews: { nodes: ReviewNode[] };
}

interface ReviewNode extends BaseNode {
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
}

interface ContributionsByRepository {
  repository: Repository;
  contributions: {
    nodes: Array<{
      commitCount: number;
      occurredAt: string;
    }>;
  };
}

interface CommitNode {
  oid: string;
  message: string;
  committedDate: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  author: {
    user?: GitHubUser;
    name: string;
    email: string;
  };
}

export class GitHubService {
  private graphqlWithAuth: typeof graphql;

  constructor(token: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }

  async fetchEvents(
    options: ParsedCliOptions,
    progress: ProgressDisplay,
  ): Promise<GitHubEventUnion[]> {
    progress.update("Fetching user information...");
    const user = await this.fetchUser();

    const events: GitHubEventUnion[] = [];

    progress.update("Fetching issues...");
    const issues = await this.fetchIssues(user.login, options);
    events.push(...issues);

    progress.update("Fetching issue comments...");
    const issueComments = await this.fetchIssueComments(user.login, options);
    events.push(...issueComments);

    progress.update("Fetching pull requests...");
    const pullRequests = await this.fetchPullRequests(user.login, options);
    events.push(...pullRequests);

    progress.update("Fetching pull request reviews...");
    const reviews = await this.fetchPullRequestReviews(user.login, options);
    events.push(...reviews);

    progress.update("Fetching commits...");
    const commits = await this.fetchCommits(user.login, options);
    events.push(...commits);

    // Sort events by date
    events.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return options.order === "asc" ? dateA - dateB : dateB - dateA;
    });

    return events;
  }

  private async fetchUser(): Promise<GitHubUser> {
    const query = `
      query {
        viewer {
          login
          url
        }
      }
    `;

    const response: { viewer: GitHubUser } = await this.graphqlWithAuth(query);
    return response.viewer;
  }

  private async fetchIssues(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const sinceDate = options.since.toISOString().split("T")[0];
    const untilDate = options.until.toISOString().split("T")[0];
    const query = `
      query($after: String) {
        search(
          query: "author:${username} is:issue created:${sinceDate}..${untilDate}"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              number
              title
              body
              url
              state
              createdAt
              labels(first: 10) {
                nodes {
                  name
                  color
                }
              }
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              author {
                login
                url
              }
            }
          }
        }
      }
    `;

    return this.fetchPaginatedData(query, {}, options.visibility, (node: IssueNode) => ({
      type: "Issue" as const,
      number: node.number,
      title: node.title,
      body: node.body,
      url: node.url,
      state: node.state,
      createdAt: node.createdAt,
      labels: node.labels.nodes.map((label: Label) => ({
        name: label.name,
        color: label.color,
      })),
      repository: {
        name: node.repository.name,
        owner: node.repository.owner.login,
        url: node.repository.url,
      },
      author: {
        login: node.author.login,
        url: node.author.url,
      },
    }));
  }

  private async fetchIssueComments(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const sinceDate = options.since.toISOString().split("T")[0];
    const untilDate = options.until.toISOString().split("T")[0];
    const query = `
      query($after: String) {
        search(
          query: "commenter:${username} is:issue-comment created:${sinceDate}..${untilDate}"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              comments(
                first: 100
              ) {
                nodes {
                  body
                  url
                  createdAt
                  author {
                    login
                    url
                  }
                }
              }
              number
              title
              url
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
            }
          }
        }
      }
    `;

    const results = await this.fetchPaginatedData(
      query,
      {},
      options.visibility,
      (node: IssueNode) => {
        return node.comments.nodes
          .filter((comment: CommentNode) => comment.author.login === username)
          .map((comment: CommentNode) => ({
            type: "IssueComment" as const,
            body: comment.body,
            url: comment.url,
            createdAt: comment.createdAt,
            issue: {
              number: node.number,
              title: node.title,
              url: node.url,
            },
            repository: {
              name: node.repository.name,
              owner: node.repository.owner.login,
              url: node.repository.url,
            },
            author: {
              login: comment.author.login,
              url: comment.author.url,
            },
          }));
      },
    );

    return results.flat();
  }

  private async fetchPullRequests(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const sinceDate = options.since.toISOString().split("T")[0];
    const untilDate = options.until.toISOString().split("T")[0];
    const query = `
      query($after: String) {
        search(
          query: "author:${username} is:pr created:${sinceDate}..${untilDate}"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on PullRequest {
              number
              title
              body
              url
              state
              createdAt
              baseRefName
              headRefName
              changedFiles
              additions
              deletions
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              author {
                login
                url
              }
            }
          }
        }
      }
    `;

    return this.fetchPaginatedData(query, {}, options.visibility, (node: PullRequestNode) => ({
      type: "PullRequest" as const,
      number: node.number,
      title: node.title,
      body: node.body,
      url: node.url,
      state: node.state,
      createdAt: node.createdAt,
      baseRef: node.baseRefName,
      headRef: node.headRefName,
      changedFiles: node.changedFiles,
      additions: node.additions,
      deletions: node.deletions,
      repository: {
        name: node.repository.name,
        owner: node.repository.owner.login,
        url: node.repository.url,
      },
      author: {
        login: node.author.login,
        url: node.author.url,
      },
    }));
  }

  private async fetchPullRequestReviews(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const sinceDate = options.since.toISOString().split("T")[0];
    const untilDate = options.until.toISOString().split("T")[0];
    const query = `
      query($after: String) {
        search(
          query: "reviewed-by:${username} is:pr created:${sinceDate}..${untilDate}"
          type: ISSUE
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on PullRequest {
              reviews(
                first: 100
              ) {
                nodes {
                  state
                  body
                  url
                  createdAt
                  author {
                    login
                    url
                  }
                }
              }
              number
              title
              url
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
            }
          }
        }
      }
    `;

    const results = await this.fetchPaginatedData(
      query,
      {},
      options.visibility,
      (node: PullRequestNode) => {
        return node.reviews.nodes
          .filter((review: ReviewNode) => review.author.login === username)
          .map((review: ReviewNode) => ({
            type: "PullRequestReview" as const,
            state: review.state,
            body: review.body,
            url: review.url,
            createdAt: review.createdAt,
            pullRequest: {
              number: node.number,
              title: node.title,
              url: node.url,
            },
            repository: {
              name: node.repository.name,
              owner: node.repository.owner.login,
              url: node.repository.url,
            },
            author: {
              login: review.author.login,
              url: review.author.url,
            },
          }));
      },
    );

    return results.flat();
  }

  private async fetchCommits(
    username: string,
    options: ParsedCliOptions,
  ): Promise<GitHubEventUnion[]> {
    const commits: GitHubEventUnion[] = [];

    // Split the date range into 1-year periods to handle GitHub's limitation
    const periods = this.splitDateRangeIntoYearPeriods(options.since, options.until);

    for (const period of periods) {
      const contributionsByRepo = await this.fetchCommitContributions(period.from, period.to);

      for (const repoContrib of contributionsByRepo) {
        if (this.shouldIncludeByVisibility(repoContrib.repository.visibility, options.visibility)) {
          const repoCommits = await this.fetchDetailedCommitsFromRepository(
            repoContrib.repository.owner.login,
            repoContrib.repository.name,
            username,
            period.from,
            period.to,
          );
          commits.push(...repoCommits);
        }
      }
    }

    return commits;
  }

  private async fetchCommitContributions(
    from: Date,
    to: Date,
  ): Promise<ContributionsByRepository[]> {
    const query = `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                name
                owner {
                  login
                }
                url
                visibility
              }
              contributions(first: 100) {
                nodes {
                  commitCount
                  occurredAt
                }
              }
            }
          }
        }
      }
    `;

    const response: {
      viewer: {
        contributionsCollection: {
          commitContributionsByRepository: ContributionsByRepository[];
        };
      };
    } = await this.graphqlWithAuth(query, {
      from: from.toISOString(),
      to: to.toISOString(),
    });

    return response.viewer.contributionsCollection.commitContributionsByRepository;
  }

  private async fetchDetailedCommitsFromRepository(
    owner: string,
    name: string,
    authorLogin: string,
    since: Date,
    until: Date,
  ): Promise<GitHubEventUnion[]> {
    const query = `
      query($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $after: String) {
        repository(owner: $owner, name: $name) {
          url
          defaultBranchRef {
            target {
              ... on Commit {
                history(since: $since, until: $until, first: 100, after: $after) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    oid
                    message
                    committedDate
                    additions
                    deletions
                    changedFiles
                    url
                    author {
                      user {
                        login
                        url
                      }
                      name
                      email
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const commits: GitHubEventUnion[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    while (hasNextPage) {
      const response: {
        repository: {
          url: string;
          defaultBranchRef: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: boolean;
                  endCursor: string;
                };
                nodes: CommitNode[];
              };
            };
          };
        };
      } = await this.graphqlWithAuth(query, {
        owner,
        name,
        since: since.toISOString(),
        until: until.toISOString(),
        after,
      });

      const history = response.repository.defaultBranchRef?.target?.history;
      if (!history) break;

      hasNextPage = history.pageInfo.hasNextPage;
      after = history.pageInfo.endCursor;

      for (const commit of history.nodes) {
        if (commit.author.user?.login === authorLogin) {
          commits.push({
            type: "Commit" as const,
            sha: commit.oid,
            message: commit.message,
            createdAt: commit.committedDate,
            additions: commit.additions,
            deletions: commit.deletions,
            changedFiles: commit.changedFiles,
            url: commit.url,
            repository: {
              name,
              owner,
              url: response.repository.url,
            },
            author: {
              login: commit.author.user.login,
              url: commit.author.user.url,
            },
          });
        }
      }
    }

    return commits;
  }

  private splitDateRangeIntoYearPeriods(since: Date, until: Date): Array<{ from: Date; to: Date }> {
    const periods: Array<{ from: Date; to: Date }> = [];
    let currentFrom = new Date(since);

    while (currentFrom < until) {
      const currentTo = new Date(currentFrom);
      currentTo.setFullYear(currentTo.getFullYear() + 1);

      // Ensure we don't exceed the original until date
      if (currentTo > until) {
        currentTo.setTime(until.getTime());
      }

      periods.push({ from: new Date(currentFrom), to: new Date(currentTo) });

      // Move to the next period
      currentFrom = new Date(currentTo);
      currentFrom.setMilliseconds(currentFrom.getMilliseconds() + 1);
    }

    return periods;
  }

  private async fetchPaginatedData<T, N>(
    query: string,
    variables: Record<string, unknown>,
    visibility: "public" | "private" | "all",
    transformer: (node: N) => T | T[],
  ): Promise<T[]> {
    const results: T[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    while (hasNextPage) {
      const response: GraphQLSearchResponse<unknown> = await this.graphqlWithAuth(query, {
        ...variables,
        after,
      });

      const search = response.search;
      hasNextPage = search.pageInfo.hasNextPage;
      after = search.pageInfo.endCursor;

      for (const node of search.nodes) {
        // eslint-disable-next-line no-type-assertion/no-type-assertion
        const nodeWithRepo = node as { repository?: { visibility?: string } };
        if (this.shouldIncludeByVisibility(nodeWithRepo.repository?.visibility || "", visibility)) {
          // eslint-disable-next-line no-type-assertion/no-type-assertion
          const transformed = transformer(node as N);
          if (Array.isArray(transformed)) {
            results.push(...transformed);
          } else {
            results.push(transformed);
          }
        }
      }
    }

    return results;
  }

  private shouldIncludeByVisibility(repoVisibility: string, targetVisibility: string): boolean {
    if (targetVisibility === "all") return true;
    if (targetVisibility === "public") return repoVisibility === "PUBLIC";
    if (targetVisibility === "private") return repoVisibility === "PRIVATE";
    return false;
  }
}
