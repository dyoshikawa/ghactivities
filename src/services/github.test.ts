import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeRetryDelayMs, GitHubService } from "./github.js";

// Records every call the GitHubService makes to @octokit/graphql so the test
// can assert none of them uses a reserved variable key, and exposes a mutable
// node list served to the issue-comment search. Declared via vi.hoisted so
// both are available inside the (hoisted) vi.mock factory below.
const {
  calls,
  issueCommentSearchNodes,
  reviewSearchNodes,
  commentPagesByCursor,
  reviewPagesByCursor,
  searchResponsesByQuery,
  failures,
  contributionRepos,
  defaultBranchHistoryNodes,
  branchRefNodes,
  branchHistoryByRef,
  gistNodes,
  commitCommentNodes,
  releaseRepoNodes,
  createdRepoNodes,
  pushedRepoNodes,
  restCalls,
  restResponsesByPath,
  restFailureQueue,
} = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
  issueCommentSearchNodes: [] as unknown[],
  reviewSearchNodes: [] as unknown[],
  commentPagesByCursor: new Map<string, unknown>(),
  reviewPagesByCursor: new Map<string, unknown>(),
  searchResponsesByQuery: new Map<string, unknown>(),
  // Failure injection: while a substring's error list is non-empty, calls
  // whose query or searchQuery contains the substring reject with the next
  // error from the list.
  failures: new Map<string, unknown[]>(),
  // Nodes served to the commit/gist/release/repository/wiki fetchers.
  contributionRepos: [] as unknown[],
  defaultBranchHistoryNodes: [] as unknown[],
  branchRefNodes: [] as unknown[],
  branchHistoryByRef: new Map<string, unknown[]>(),
  gistNodes: [] as unknown[],
  commitCommentNodes: [] as unknown[],
  releaseRepoNodes: [] as unknown[],
  createdRepoNodes: [] as unknown[],
  pushedRepoNodes: [] as unknown[],
  restCalls: [] as string[],
  restResponsesByPath: new Map<string, unknown>(),
  // Each entry makes the next REST call fail with the given status and body.
  restFailureQueue: [] as { status: number; body: unknown }[],
}));

// Mock @octokit/graphql with a stub that returns empty-but-valid shapes for
// each query the service issues, and records the (query, variables) pairs.
vi.mock("@octokit/graphql", () => {
  const findInjectedFailure = (query: string, variables: Record<string, unknown>) => {
    const failureKey = `${query} ${String(variables.searchQuery ?? "")}`;
    for (const [substring, errors] of failures) {
      if (errors.length > 0 && failureKey.includes(substring)) {
        return errors.shift();
      }
    }
    return undefined;
  };

  // Nested pagination: serves the review or comment page registered for the
  // requested cursor.
  const handleNodePage = (query: string, variables: Record<string, unknown>) => {
    if (query.includes("reviews(first:")) {
      const page = reviewPagesByCursor.get(String(variables.after ?? ""));
      return { node: page ? { reviews: page } : null };
    }
    const page = commentPagesByCursor.get(String(variables.after ?? ""));
    return { node: page ? { comments: page } : null };
  };

  const handleSearch = (variables: Record<string, unknown>) => {
    const searchQuery = String(variables.searchQuery ?? "");
    const preset = searchResponsesByQuery.get(searchQuery);
    if (preset) return { search: preset };
    let nodes: unknown[] = [];
    if (searchQuery.includes("commenter:") && searchQuery.includes("is:issue")) {
      nodes = issueCommentSearchNodes;
    }
    if (searchQuery.includes("reviewed-by:")) {
      nodes = reviewSearchNodes;
    }
    return {
      search: { issueCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes },
    };
  };

  const noNextPage = { hasNextPage: false, endCursor: null };

  const impl = (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });

    const failure = findInjectedFailure(query, variables);
    if (failure !== undefined) return Promise.reject(failure);

    if (query.includes("contributionsCollection")) {
      return Promise.resolve({
        user: {
          contributionsCollection: {
            commitContributionsByRepository: contributionRepos.map((repository) => ({
              repository,
            })),
          },
        },
      });
    }
    if (query.includes("refs(refPrefix:")) {
      return Promise.resolve({
        repository: { refs: { pageInfo: noNextPage, nodes: branchRefNodes } },
      });
    }
    if (query.includes("ref(qualifiedName:")) {
      const nodes = branchHistoryByRef.get(String(variables.qualifiedName)) ?? [];
      return Promise.resolve({
        repository: { ref: { target: { history: { pageInfo: noNextPage, nodes } } } },
      });
    }
    if (query.includes("defaultBranchRef")) {
      if (defaultBranchHistoryNodes.length === 0) {
        return Promise.resolve({ repository: { defaultBranchRef: null } });
      }
      return Promise.resolve({
        repository: {
          defaultBranchRef: {
            name: "main",
            target: { history: { pageInfo: noNextPage, nodes: defaultBranchHistoryNodes } },
          },
        },
      });
    }
    if (query.includes("gists(")) {
      return Promise.resolve({
        user: { gists: { pageInfo: noNextPage, nodes: gistNodes } },
      });
    }
    if (query.includes("commitComments(")) {
      return Promise.resolve({
        user: { commitComments: { pageInfo: noNextPage, nodes: commitCommentNodes } },
      });
    }
    // The per-repository releases page query selects repository { releases };
    // the discovery query nests releases under user { repositories }.
    if (query.includes("releases(first: $first")) {
      return Promise.resolve({
        repository: { releases: { pageInfo: noNextPage, nodes: [] } },
      });
    }
    if (query.includes("releases(")) {
      return Promise.resolve({
        user: { repositories: { pageInfo: noNextPage, nodes: releaseRepoNodes } },
      });
    }
    if (query.includes("pushedAt")) {
      return Promise.resolve({
        user: { repositories: { pageInfo: noNextPage, nodes: pushedRepoNodes } },
      });
    }
    if (query.includes("isFork")) {
      return Promise.resolve({
        user: { repositories: { pageInfo: noNextPage, nodes: createdRepoNodes } },
      });
    }
    if (query.includes("node(id:")) {
      return Promise.resolve(handleNodePage(query, variables));
    }
    if (query.includes("search(type:")) {
      return Promise.resolve(handleSearch(variables));
    }
    // User id lookup (commit author filter and the --user existence check).
    // The contributionsCollection query also selects user(login:) but is
    // already handled above.
    if (query.includes("user(login:")) {
      return Promise.resolve({ user: { id: "USER_ID" } });
    }
    return Promise.resolve({ viewer: { login: "testuser" } });
  };

  return { graphql: Object.assign(impl, { defaults: () => impl }) };
});

// Stub the global fetch used by the service's REST calls (commit diffs and
// the user events feed) so unit tests never touch the network.
vi.stubGlobal(
  "fetch",
  vi.fn((url: string | URL) => {
    const fullPath = String(url).replace("https://api.github.com", "");
    restCalls.push(fullPath);
    const failure = restFailureQueue.shift();
    if (failure) {
      return Promise.resolve({
        ok: false,
        status: failure.status,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(failure.body)),
        json: () => Promise.resolve(failure.body),
      } as unknown as Response);
    }
    const preset =
      restResponsesByPath.get(fullPath) ?? restResponsesByPath.get(fullPath.split("?")[0] ?? "");
    const body = preset ?? (fullPath.startsWith("/users/") ? [] : { files: [] });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve(body),
    } as unknown as Response);
  }),
);

beforeEach(() => {
  calls.length = 0;
  issueCommentSearchNodes.length = 0;
  reviewSearchNodes.length = 0;
  commentPagesByCursor.clear();
  reviewPagesByCursor.clear();
  searchResponsesByQuery.clear();
  failures.clear();
  contributionRepos.length = 0;
  defaultBranchHistoryNodes.length = 0;
  branchRefNodes.length = 0;
  branchHistoryByRef.clear();
  gistNodes.length = 0;
  commitCommentNodes.length = 0;
  releaseRepoNodes.length = 0;
  createdRepoNodes.length = 0;
  pushedRepoNodes.length = 0;
  restCalls.length = 0;
  restResponsesByPath.clear();
  restFailureQueue.length = 0;
});

const makeService = (params?: {
  username?: string;
  since?: Date;
  until?: Date;
  visibility?: "public" | "private" | "all";
  branches?: "default" | "all";
  commitDiff?: boolean;
  onWarning?: (message: string) => void;
  retry?: { maxRetries?: number; baseDelayMs?: number };
}) =>
  new GitHubService({
    token: "test-token",
    username: params?.username,
    since: params?.since ?? new Date("2024-01-01T00:00:00Z"),
    until: params?.until ?? new Date("2024-01-15T00:00:00Z"),
    visibility: params?.visibility ?? "public",
    branches: params?.branches,
    commitDiff: params?.commitDiff,
    ...(params?.onWarning ? { onWarning: params.onWarning } : {}),
    retry: params?.retry ?? { baseDelayMs: 1 },
  });

describe("search date qualifiers", () => {
  it("bounds author searches by a created: range and commenter searches by an updated: window", async () => {
    await makeService().fetchAllEvents();

    const searchQueries = calls
      .map((call) => call.variables.searchQuery)
      .filter((value): value is string => typeof value === "string");

    const authorQueries = searchQueries.filter((q) => q.includes("author:"));
    const commenterQueries = searchQueries.filter((q) => q.includes("commenter:"));
    expect(authorQueries.length).toBeGreaterThan(0);
    expect(commenterQueries.length).toBeGreaterThan(0);

    for (const searchQuery of authorQueries) {
      expect(searchQuery).toContain("created:2024-01-01..2024-01-15");
    }
    // A lower `created:` bound on a commenter search would match the parent
    // item's creation date and silently drop comments left on older items;
    // only the upper bound `created:<=until` is safe. The `updated:` window
    // starts at --since and reaches the present day.
    for (const searchQuery of commenterQueries) {
      expect(searchQuery).toContain("updated:2024-01-01..");
      expect(searchQuery).toContain("created:<=2024-01-15");
      expect(searchQuery).not.toContain("created:2024-01-01..2024-01-15");
    }
  });

  it("collects an in-range comment on an issue created before the range", async () => {
    issueCommentSearchNodes.push({
      id: "ISSUE_NODE_ID",
      title: "Old issue",
      url: "https://github.com/owner/repo/issues/1",
      createdAt: "2023-06-01T00:00:00Z",
      repository: { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" },
      comments: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            body: "in-range comment by viewer",
            url: "https://github.com/owner/repo/issues/1#issuecomment-1",
            createdAt: "2024-01-05T12:00:00Z",
            author: { login: "testuser" },
          },
          {
            body: "out-of-range comment by viewer",
            url: "https://github.com/owner/repo/issues/1#issuecomment-2",
            createdAt: "2023-12-01T00:00:00Z",
            author: { login: "testuser" },
          },
          {
            body: "in-range comment by someone else",
            url: "https://github.com/owner/repo/issues/1#issuecomment-3",
            createdAt: "2024-01-06T00:00:00Z",
            author: { login: "someone" },
          },
        ],
      },
    });

    const events = await makeService().fetchAllEvents();

    const issueComments = events.filter((event) => event.type === "IssueComment");
    expect(issueComments).toEqual([
      {
        type: "IssueComment",
        createdAt: "2024-01-05T12:00:00Z",
        issueTitle: "Old issue",
        issueUrl: "https://github.com/owner/repo/issues/1",
        body: "in-range comment by viewer",
        url: "https://github.com/owner/repo/issues/1#issuecomment-1",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);
  });

  it("paginates nested comments so in-range comments beyond the first page are collected", async () => {
    issueCommentSearchNodes.push({
      id: "ISSUE_NODE_ID",
      title: "Busy issue",
      url: "https://github.com/owner/repo/issues/2",
      createdAt: "2023-06-01T00:00:00Z",
      repository: { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" },
      comments: {
        pageInfo: { hasNextPage: true, endCursor: "CURSOR_PAGE_2" },
        nodes: [
          {
            body: "old comment on the first page",
            url: "https://github.com/owner/repo/issues/2#issuecomment-1",
            createdAt: "2023-07-01T00:00:00Z",
            author: { login: "testuser" },
          },
        ],
      },
    });
    commentPagesByCursor.set("CURSOR_PAGE_2", {
      pageInfo: { hasNextPage: true, endCursor: "CURSOR_PAGE_3" },
      nodes: [
        {
          body: "still old, second page",
          url: "https://github.com/owner/repo/issues/2#issuecomment-2",
          createdAt: "2023-08-01T00:00:00Z",
          author: { login: "testuser" },
        },
      ],
    });
    commentPagesByCursor.set("CURSOR_PAGE_3", {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          body: "recent comment on the last page",
          url: "https://github.com/owner/repo/issues/2#issuecomment-3",
          createdAt: "2024-01-10T00:00:00Z",
          author: { login: "testuser" },
        },
      ],
    });

    const events = await makeService().fetchAllEvents();

    const issueComments = events.filter((event) => event.type === "IssueComment");
    expect(issueComments).toEqual([
      {
        type: "IssueComment",
        createdAt: "2024-01-10T00:00:00Z",
        issueTitle: "Busy issue",
        issueUrl: "https://github.com/owner/repo/issues/2",
        body: "recent comment on the last page",
        url: "https://github.com/owner/repo/issues/2#issuecomment-3",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);

    // The follow-up pages must be requested via the node query with the
    // surfaced item's id and the previous page's end cursor.
    const pageCalls = calls.filter((call) => call.query.includes("node(id:"));
    expect(pageCalls.map((call) => call.variables)).toEqual([
      { nodeId: "ISSUE_NODE_ID", first: 100, after: "CURSOR_PAGE_2" },
      { nodeId: "ISSUE_NODE_ID", first: 100, after: "CURSOR_PAGE_3" },
    ]);
  });
});

const issueNode = (title: string) => ({
  title,
  url: `https://github.com/owner/repo/issues/${title}`,
  body: "",
  createdAt: "2024-01-02T00:00:00Z",
  repository: { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" },
});

// The fixed 2024 test range lies more than 90 days in the past, so every full
// fetchAllEvents run also emits the wiki events-feed coverage warning; tests
// about other warnings filter it out.
const withoutWikiFeedWarnings = (warnings: string[]) =>
  warnings.filter((message) => !/wiki/i.test(message));

describe("search result cap handling", () => {
  it("splits the date window in half when the result count exceeds the cap", async () => {
    const warnings: string[] = [];
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-15", {
      issueCount: 1500,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("discarded-oversized-page")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-08", {
      issueCount: 800,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("first-half")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-09..2024-01-15", {
      issueCount: 700,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-half")],
    });

    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["first-half", "second-half"]);
    expect(withoutWikiFeedWarnings(warnings)).toEqual([]);
  });

  it("keeps splitting when a half still exceeds the cap", async () => {
    const warnings: string[] = [];
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-15", {
      issueCount: 1500,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-08", {
      issueCount: 1200,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-04", {
      issueCount: 600,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("first-quarter")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-05..2024-01-08", {
      issueCount: 600,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-quarter")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-09..2024-01-15", {
      issueCount: 300,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-half")],
    });

    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["first-quarter", "second-quarter", "second-half"]);
    expect(withoutWikiFeedWarnings(warnings)).toEqual([]);
  });

  it("warns instead of silently truncating when a single UTC day exceeds the cap", async () => {
    const warnings: string[] = [];
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-05..2024-01-05", {
      issueCount: 1500,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("capped-day")],
    });

    const events = await makeService({
      since: new Date("2024-01-05T00:00:00Z"),
      until: new Date("2024-01-05T23:59:59Z"),
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["capped-day"]);
    const capWarnings = withoutWikiFeedWarnings(warnings);
    expect(capWarnings).toHaveLength(1);
    expect(capWarnings[0]).toContain("1000");
    expect(capWarnings[0]).toContain("author:testuser is:issue created:2024-01-05..2024-01-05");
  });
});

// Deep pages of node-heavy searches are aborted by GitHub with this error
// even when the result count is under the 1,000-result cap.
const resourceLimitError = () =>
  Object.assign(new Error("Resource limits for this query exceeded."), {
    errors: [{ type: "RESOURCE_LIMITS_EXCEEDED" }],
  });

describe("search resource limit handling", () => {
  it("splits the date window in half when the search hits GitHub's resource limits", async () => {
    const warnings: string[] = [];
    failures.set("author:testuser is:issue created:2024-01-01..2024-01-15", [resourceLimitError()]);
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-08", {
      issueCount: 400,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("first-half")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-09..2024-01-15", {
      issueCount: 300,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-half")],
    });

    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["first-half", "second-half"]);
    expect(withoutWikiFeedWarnings(warnings)).toEqual([]);
  });

  it("keeps splitting when a half still hits resource limits", async () => {
    failures.set("author:testuser is:issue created:2024-01-01..2024-01-15", [resourceLimitError()]);
    failures.set("author:testuser is:issue created:2024-01-01..2024-01-08", [resourceLimitError()]);
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-04", {
      issueCount: 200,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("first-quarter")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-05..2024-01-08", {
      issueCount: 200,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-quarter")],
    });
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-09..2024-01-15", {
      issueCount: 300,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("second-half")],
    });

    const events = await makeService().fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["first-quarter", "second-quarter", "second-half"]);
  });

  it("fails with a clear error when a single UTC day still hits resource limits", async () => {
    failures.set("author:testuser is:issue created:2024-01-05..2024-01-05", [resourceLimitError()]);

    await expect(
      makeService({
        since: new Date("2024-01-05T00:00:00Z"),
        until: new Date("2024-01-05T23:59:59Z"),
      }).fetchAllEvents(),
    ).rejects.toThrow(/Failed to fetch issues: .*Resource limits for this query exceeded/);
  });
});

const visibilityNode = (visibility: string) => ({
  title: `${visibility} issue`,
  url: `https://github.com/owner/repo/issues/${visibility}`,
  body: "",
  createdAt: "2024-01-02T00:00:00Z",
  repository: { owner: { login: "owner" }, name: "repo", visibility },
});

describe("repository visibility filtering", () => {
  const setIssueSearchNodes = (nodes: unknown[]) => {
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-15", {
      issueCount: nodes.length,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes,
    });
  };

  const collectIssueTitles = async (visibility: "public" | "private" | "all") => {
    setIssueSearchNodes([
      visibilityNode("PUBLIC"),
      visibilityNode("PRIVATE"),
      visibilityNode("INTERNAL"),
    ]);
    const events = await makeService({ visibility }).fetchAllEvents();
    return events.filter((event) => event.type === "Issue").map((e) => e.title);
  };

  it("includes only PUBLIC repositories with --visibility public", async () => {
    expect(await collectIssueTitles("public")).toEqual(["PUBLIC issue"]);
  });

  it("groups INTERNAL repositories with private", async () => {
    expect(await collectIssueTitles("private")).toEqual(["PRIVATE issue", "INTERNAL issue"]);
  });

  it("includes every visibility with --visibility all", async () => {
    expect(await collectIssueTitles("all")).toEqual([
      "PUBLIC issue",
      "PRIVATE issue",
      "INTERNAL issue",
    ]);
  });
});

const reviewedPrNode = (reviews: unknown) => ({
  id: "PR_NODE_ID",
  title: "Reviewed PR",
  url: "https://github.com/owner/repo/pull/7",
  createdAt: "2023-06-01T00:00:00Z",
  repository: { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" },
  reviews,
});

describe("pull request review comments", () => {
  it("collects in-range review bodies and inline comments authored by the viewer", async () => {
    reviewSearchNodes.push(
      reviewedPrNode({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "REVIEW_1",
            body: "review summary in range",
            url: "https://github.com/owner/repo/pull/7#pullrequestreview-1",
            // Drafted at 00:00, submitted at 02:00: the event must use the
            // submission time.
            createdAt: "2024-01-05T00:00:00Z",
            submittedAt: "2024-01-05T02:00:00Z",
            author: { login: "testuser" },
            comments: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  body: "inline comment in range",
                  url: "https://github.com/owner/repo/pull/7#discussion_r1",
                  createdAt: "2024-01-05T01:00:00Z",
                  author: { login: "testuser" },
                },
                {
                  body: "inline comment out of range",
                  url: "https://github.com/owner/repo/pull/7#discussion_r2",
                  createdAt: "2023-11-01T00:00:00Z",
                  author: { login: "testuser" },
                },
              ],
            },
          },
          {
            id: "REVIEW_2",
            // Empty body (e.g. a plain approval) must not produce an event.
            body: "",
            url: "https://github.com/owner/repo/pull/7#pullrequestreview-2",
            createdAt: "2024-01-06T00:00:00Z",
            author: { login: "testuser" },
            comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          },
          {
            id: "REVIEW_3",
            body: "someone else's review in range",
            url: "https://github.com/owner/repo/pull/7#pullrequestreview-3",
            createdAt: "2024-01-07T00:00:00Z",
            author: { login: "someone" },
            // A truthy cursor here proves the skipped review's comments are
            // never paged.
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "SKIPPED_REVIEW_CURSOR" },
              nodes: [],
            },
          },
        ],
      }),
    );

    const events = await makeService().fetchAllEvents();

    const reviewComments = events.filter((event) => event.type === "PullRequestReviewComment");
    expect(reviewComments).toEqual([
      {
        type: "PullRequestReviewComment",
        createdAt: "2024-01-05T02:00:00Z",
        prTitle: "Reviewed PR",
        prUrl: "https://github.com/owner/repo/pull/7",
        body: "review summary in range",
        url: "https://github.com/owner/repo/pull/7#pullrequestreview-1",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
      {
        type: "PullRequestReviewComment",
        createdAt: "2024-01-05T01:00:00Z",
        prTitle: "Reviewed PR",
        prUrl: "https://github.com/owner/repo/pull/7",
        body: "inline comment in range",
        url: "https://github.com/owner/repo/pull/7#discussion_r1",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);

    // The skipped other-author review must never have its comments paged.
    const skippedPageCalls = calls.filter(
      (call) => call.variables.after === "SKIPPED_REVIEW_CURSOR",
    );
    expect(skippedPageCalls).toEqual([]);
  });

  it("paginates a review's inline comment tail", async () => {
    reviewSearchNodes.push(
      reviewedPrNode({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "REVIEW_1",
            body: "",
            url: "https://github.com/owner/repo/pull/7#pullrequestreview-1",
            createdAt: "2024-01-05T00:00:00Z",
            submittedAt: "2024-01-05T00:00:00Z",
            author: { login: "testuser" },
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "REVIEW_COMMENT_CURSOR_2" },
              nodes: [],
            },
          },
        ],
      }),
    );
    commentPagesByCursor.set("REVIEW_COMMENT_CURSOR_2", {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          body: "inline comment on the second page",
          url: "https://github.com/owner/repo/pull/7#discussion_r9",
          createdAt: "2024-01-09T00:00:00Z",
          author: { login: "testuser" },
        },
      ],
    });

    const events = await makeService().fetchAllEvents();

    const reviewComments = events.filter((event) => event.type === "PullRequestReviewComment");
    expect(reviewComments.map((e) => e.body)).toEqual(["inline comment on the second page"]);

    const pageCalls = calls.filter((call) => call.variables.after === "REVIEW_COMMENT_CURSOR_2");
    expect(pageCalls.map((call) => call.variables)).toEqual([
      { nodeId: "REVIEW_1", first: 100, after: "REVIEW_COMMENT_CURSOR_2" },
    ]);
  });

  it("paginates the reviews connection", async () => {
    reviewSearchNodes.push(
      reviewedPrNode({
        pageInfo: { hasNextPage: true, endCursor: "REVIEW_CURSOR_2" },
        nodes: [],
      }),
    );
    reviewPagesByCursor.set("REVIEW_CURSOR_2", {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: "REVIEW_PAGE_2",
          body: "review on the second page",
          url: "https://github.com/owner/repo/pull/7#pullrequestreview-9",
          createdAt: "2024-01-08T00:00:00Z",
          author: { login: "testuser" },
          comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
        },
      ],
    });

    const events = await makeService().fetchAllEvents();

    const reviewComments = events.filter((event) => event.type === "PullRequestReviewComment");
    expect(reviewComments.map((e) => e.body)).toEqual(["review on the second page"]);

    const reviewPageCalls = calls.filter(
      (call) => call.query.includes("node(id:") && call.query.includes("reviews(first:"),
    );
    expect(reviewPageCalls.map((call) => call.variables)).toEqual([
      { nodeId: "PR_NODE_ID", first: 25, after: "REVIEW_CURSOR_2", reviewAuthor: "testuser" },
    ]);
  });
});

const rateLimitedError = () =>
  Object.assign(new Error("API rate limit exceeded"), {
    errors: [{ type: "RATE_LIMITED" }],
  });

describe("transient failure handling", () => {
  const issueSearchKey = "author:testuser is:issue";

  it("retries transient errors and succeeds", async () => {
    const warnings: string[] = [];
    failures.set(issueSearchKey, [Object.assign(new Error("Bad gateway"), { status: 502 })]);
    searchResponsesByQuery.set("author:testuser is:issue created:2024-01-01..2024-01-15", {
      issueCount: 1,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [issueNode("recovered")],
    });

    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    const issueTitles = events.filter((event) => event.type === "Issue").map((e) => e.title);
    expect(issueTitles).toEqual(["recovered"]);
    const retryWarnings = withoutWikiFeedWarnings(warnings);
    expect(retryWarnings).toHaveLength(1);
    expect(retryWarnings[0]).toContain("retrying");
    expect(retryWarnings[0]).toContain("Bad gateway");
  });

  it("gives up after the retry budget and names the failing fetcher", async () => {
    const warnings: string[] = [];
    failures.set(issueSearchKey, [
      rateLimitedError(),
      rateLimitedError(),
      rateLimitedError(),
      rateLimitedError(),
    ]);

    await expect(
      makeService({ onWarning: (message) => warnings.push(message) }).fetchAllEvents(),
    ).rejects.toThrow(/Failed to fetch issues: .*rate limit/);
    expect(warnings).toHaveLength(3);
  });

  it("does not retry non-retryable errors", async () => {
    const warnings: string[] = [];
    failures.set(issueSearchKey, [Object.assign(new Error("Bad credentials"), { status: 401 })]);

    await expect(
      makeService({ onWarning: (message) => warnings.push(message) }).fetchAllEvents(),
    ).rejects.toThrow("Failed to fetch issues: Bad credentials");
    expect(warnings).toEqual([]);
  });
});

describe("computeRetryDelayMs", () => {
  it("honors retry-after from RequestError-shaped errors (response.headers)", () => {
    const delay = computeRetryDelayMs({
      error: { response: { headers: { "retry-after": "5" } } },
      attempt: 0,
      baseDelayMs: 1000,
    });
    expect(delay).toBe(5000);
  });

  it("honors top-level headers from GraphqlResponseError-shaped errors", () => {
    const delay = computeRetryDelayMs({
      error: { headers: { "retry-after": 7 } },
      attempt: 0,
      baseDelayMs: 1000,
    });
    expect(delay).toBe(7000);
  });

  it("waits until x-ratelimit-reset, capped at one minute", () => {
    const resetInTwoMinutes = Math.round(Date.now() / 1000) + 120;
    const delay = computeRetryDelayMs({
      error: { headers: { "x-ratelimit-reset": resetInTwoMinutes } },
      attempt: 0,
      baseDelayMs: 1000,
    });
    expect(delay).toBe(60_000);
  });

  it("falls back to exponential backoff and rejects malformed header values", () => {
    const error = { headers: { "retry-after": "soon", "x-ratelimit-reset": "-5" } };
    expect(computeRetryDelayMs({ error, attempt: 0, baseDelayMs: 1000 })).toBe(1000);
    expect(computeRetryDelayMs({ error, attempt: 2, baseDelayMs: 1000 })).toBe(4000);
  });
});

describe("username override", () => {
  it("resolves the viewer login when no username is given", async () => {
    await makeService().fetchAllEvents();

    const viewerCalls = calls.filter((call) => call.query.includes("viewer"));
    expect(viewerCalls.length).toBeGreaterThan(0);

    const searchQueries = calls
      .map((call) => call.variables.searchQuery)
      .filter((value): value is string => typeof value === "string");
    expect(searchQueries.some((q) => q.includes("author:testuser"))).toBe(true);
  });

  it("searches as the given username and never queries the viewer", async () => {
    await makeService({ username: "octocat" }).fetchAllEvents();

    const viewerCalls = calls.filter((call) => call.query.includes("viewer"));
    expect(viewerCalls).toEqual([]);

    const searchQueries = calls
      .map((call) => call.variables.searchQuery)
      .filter((value): value is string => typeof value === "string");
    expect(searchQueries.some((q) => q.includes("author:octocat"))).toBe(true);
    expect(searchQueries.some((q) => q.includes("commenter:octocat"))).toBe(true);
    expect(searchQueries.some((q) => q.includes("reviewed-by:octocat"))).toBe(true);
    expect(searchQueries.some((q) => q.includes("testuser"))).toBe(false);

    // The commit contributions lookup must target the given user too.
    const contributionCalls = calls.filter((call) =>
      call.query.includes("contributionsCollection"),
    );
    expect(contributionCalls.length).toBeGreaterThan(0);
    for (const call of contributionCalls) {
      expect(call.variables.login).toBe("octocat");
    }
  });

  it("rejects a username that could inject extra search qualifiers", async () => {
    await expect(makeService({ username: "x is:public" }).fetchAllEvents()).rejects.toThrow(
      "Invalid GitHub username",
    );
    expect(calls).toEqual([]);
  });

  it("fails fast with a clear error when the given user does not exist", async () => {
    // `($login: String!) {` (immediately closed) only appears in the user-id
    // query; the contributions query declares more variables.
    failures.set("($login: String!) {", [
      new Error("Could not resolve to a User with the login of 'ghost'."),
    ]);

    await expect(makeService({ username: "ghost" }).fetchAllEvents()).rejects.toThrow(
      'Failed to fetch user "ghost"',
    );

    // No search must have been attempted after the failed lookup.
    const searchCalls = calls.filter((call) => call.query.includes("search(type:"));
    expect(searchCalls).toEqual([]);
  });
});

const fileEntry = (index: number) => ({
  filename: `file-${String(index)}.ts`,
  status: "modified",
  additions: 1,
  deletions: 0,
  patch: "+x",
});

describe("audit event collection", () => {
  const repoNode = { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" };

  it("collects in-range gists and groups secret gists with private", async () => {
    gistNodes.push(
      {
        name: "aaa111",
        description: "public in range",
        url: "https://gist.github.com/testuser/aaa111",
        createdAt: "2024-01-05T00:00:00Z",
        isPublic: true,
        files: [{ name: "leak.txt", size: 10, text: "hello" }],
      },
      {
        name: "bbb222",
        description: "secret in range",
        url: "https://gist.github.com/testuser/bbb222",
        createdAt: "2024-01-04T00:00:00Z",
        isPublic: false,
        files: [],
      },
      {
        name: "ccc333",
        description: "public out of range",
        url: "https://gist.github.com/testuser/ccc333",
        createdAt: "2023-12-01T00:00:00Z",
        isPublic: true,
        files: [],
      },
    );

    const publicEvents = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "Gist",
    );
    expect(publicEvents).toEqual([
      {
        type: "Gist",
        createdAt: "2024-01-05T00:00:00Z",
        description: "public in range",
        url: "https://gist.github.com/testuser/aaa111",
        files: [{ name: "leak.txt", size: 10, text: "hello" }],
        repository: { owner: "testuser", name: "aaa111", visibility: "PUBLIC" },
      },
    ]);

    const privateEvents = (await makeService({ visibility: "private" }).fetchAllEvents()).filter(
      (event) => event.type === "Gist",
    );
    expect(privateEvents.map((event) => event.repository.name)).toEqual(["bbb222"]);
  });

  it("tolerates a null gist files list", async () => {
    gistNodes.push({
      name: "ddd444",
      description: null,
      url: "https://gist.github.com/testuser/ddd444",
      createdAt: "2024-01-05T00:00:00Z",
      isPublic: true,
      files: null,
    });

    const events = (await makeService().fetchAllEvents()).filter((event) => event.type === "Gist");
    expect(events).toHaveLength(1);
    expect(events[0]?.type === "Gist" && events[0].files).toEqual([]);
  });

  it("warns and skips gists when the token lacks gist access", async () => {
    failures.set("gists(", [
      Object.assign(new Error("Resource not accessible by personal access token"), {
        errors: [{ type: "FORBIDDEN" }],
      }),
    ]);

    const warnings: string[] = [];
    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    expect(events.filter((event) => event.type === "Gist")).toEqual([]);
    expect(warnings.some((message) => message.includes("Gists could not be collected"))).toBe(true);
  });

  it("collects in-range commit comments with their edit history", async () => {
    commitCommentNodes.push(
      {
        body: "current text",
        url: "https://github.com/owner/repo/commit/abc#commitcomment-1",
        createdAt: "2024-01-05T00:00:00Z",
        commit: { oid: "abc123" },
        repository: repoNode,
        userContentEdits: {
          nodes: [{ editedAt: "2024-01-05T01:00:00Z", deletedAt: null, diff: "previous text" }],
        },
      },
      {
        body: "out of range",
        url: "https://github.com/owner/repo/commit/def#commitcomment-2",
        createdAt: "2023-11-01T00:00:00Z",
        commit: null,
        repository: repoNode,
        userContentEdits: null,
      },
    );

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "CommitComment",
    );
    expect(events).toEqual([
      {
        type: "CommitComment",
        createdAt: "2024-01-05T00:00:00Z",
        body: "current text",
        url: "https://github.com/owner/repo/commit/abc#commitcomment-1",
        commitOid: "abc123",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
        editHistory: [{ editedAt: "2024-01-05T01:00:00Z", deletedAt: null, diff: "previous text" }],
      },
    ]);
  });

  it("collects releases authored by the user from owned repositories", async () => {
    releaseRepoNodes.push({
      owner: { login: "testuser" },
      name: "repo",
      visibility: "PUBLIC",
      releases: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            name: "v1.1.0",
            tagName: "v1.1.0",
            url: "https://github.com/testuser/repo/releases/tag/v1.1.0",
            createdAt: "2024-01-10T00:00:00Z",
            publishedAt: null,
            description: "notes",
            isPrerelease: false,
            isDraft: false,
            author: { login: "testuser" },
            releaseAssets: {
              nodes: [
                {
                  name: "app.tgz",
                  downloadUrl: "https://github.com/testuser/repo/releases/download/v1.1.0/app.tgz",
                  size: 123,
                  contentType: "application/gzip",
                },
              ],
            },
          },
          {
            name: "published later",
            tagName: "v1.0.2",
            url: "https://github.com/testuser/repo/releases/tag/v1.0.2",
            createdAt: "2024-01-09T12:00:00Z",
            publishedAt: "2024-01-11T00:00:00Z",
            description: null,
            isPrerelease: false,
            isDraft: false,
            author: { login: "testuser" },
            releaseAssets: { nodes: [] },
          },
          {
            name: "by someone else",
            tagName: "v1.0.1",
            url: "https://github.com/testuser/repo/releases/tag/v1.0.1",
            createdAt: "2024-01-09T00:00:00Z",
            publishedAt: "2024-01-09T00:00:00Z",
            description: null,
            isPrerelease: false,
            isDraft: false,
            author: { login: "someone" },
            releaseAssets: { nodes: [] },
          },
        ],
      },
    });

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "Release",
    );
    expect(events).toEqual([
      {
        type: "Release",
        createdAt: "2024-01-10T00:00:00Z",
        title: "v1.1.0",
        tagName: "v1.1.0",
        url: "https://github.com/testuser/repo/releases/tag/v1.1.0",
        body: "notes",
        isPrerelease: false,
        isDraft: false,
        assets: [
          {
            name: "app.tgz",
            url: "https://github.com/testuser/repo/releases/download/v1.1.0/app.tgz",
            size: 123,
            contentType: "application/gzip",
          },
        ],
        repository: { owner: "testuser", name: "repo", visibility: "PUBLIC" },
      },
      {
        type: "Release",
        createdAt: "2024-01-11T00:00:00Z",
        title: "published later",
        tagName: "v1.0.2",
        url: "https://github.com/testuser/repo/releases/tag/v1.0.2",
        body: null,
        isPrerelease: false,
        isDraft: false,
        assets: [],
        repository: { owner: "testuser", name: "repo", visibility: "PUBLIC" },
      },
    ]);
  });

  it("collects repositories created within the range including their README", async () => {
    createdRepoNodes.push(
      {
        owner: { login: "testuser" },
        name: "new-repo",
        visibility: "PUBLIC",
        url: "https://github.com/testuser/new-repo",
        description: "desc",
        createdAt: "2024-01-08T00:00:00Z",
        isFork: false,
        object: { text: "# readme" },
      },
      {
        owner: { login: "testuser" },
        name: "old-repo",
        visibility: "PUBLIC",
        url: "https://github.com/testuser/old-repo",
        description: null,
        createdAt: "2023-01-01T00:00:00Z",
        isFork: false,
        object: null,
      },
    );

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "Repository",
    );
    expect(events).toEqual([
      {
        type: "Repository",
        createdAt: "2024-01-08T00:00:00Z",
        url: "https://github.com/testuser/new-repo",
        description: "desc",
        isFork: false,
        readme: "# readme",
        repository: { owner: "testuser", name: "new-repo", visibility: "PUBLIC" },
      },
    ]);
  });

  it("collects wiki page edits from the events feed", async () => {
    restResponsesByPath.set("/users/testuser/events", [
      {
        type: "GollumEvent",
        public: true,
        created_at: "2024-01-06T00:00:00Z",
        repo: { name: "owner/repo" },
        payload: {
          pages: [
            {
              page_name: "Home",
              title: "Home",
              action: "edited",
              html_url: "https://github.com/owner/repo/wiki/Home",
            },
          ],
        },
      },
      {
        type: "PushEvent",
        public: true,
        created_at: "2024-01-06T01:00:00Z",
        repo: { name: "owner/repo" },
        payload: {},
      },
      {
        type: "GollumEvent",
        public: true,
        created_at: "2023-12-01T00:00:00Z",
        repo: { name: "owner/repo" },
        payload: {
          pages: [
            {
              page_name: "Old",
              title: "Old",
              action: "created",
              html_url: "https://github.com/owner/repo/wiki/Old",
            },
          ],
        },
      },
    ]);

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "WikiPageEdit",
    );
    expect(events).toEqual([
      {
        type: "WikiPageEdit",
        createdAt: "2024-01-06T00:00:00Z",
        pageTitle: "Home",
        action: "edited",
        url: "https://github.com/owner/repo/wiki/Home",
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);
  });

  it("emits each commit once with every branch it was seen on with --branches all", async () => {
    contributionRepos.push(repoNode);
    branchRefNodes.push({ name: "main" }, { name: "feature" });
    const shared = {
      oid: "aaa",
      message: "shared commit",
      url: "https://github.com/owner/repo/commit/aaa",
      committedDate: "2024-01-05T00:00:00Z",
      author: { user: { login: "testuser" } },
    };
    const featureOnly = {
      oid: "bbb",
      message: "feature-only commit",
      url: "https://github.com/owner/repo/commit/bbb",
      committedDate: "2024-01-06T00:00:00Z",
      author: { user: { login: "testuser" } },
    };
    branchHistoryByRef.set("refs/heads/main", [shared]);
    branchHistoryByRef.set("refs/heads/feature", [shared, featureOnly]);

    const events = (await makeService({ branches: "all" }).fetchAllEvents()).filter(
      (event) => event.type === "Commit",
    );
    expect(events).toEqual([
      {
        type: "Commit",
        createdAt: "2024-01-05T00:00:00Z",
        message: "shared commit",
        url: "https://github.com/owner/repo/commit/aaa",
        oid: "aaa",
        branches: ["main", "feature"],
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
      {
        type: "Commit",
        createdAt: "2024-01-06T00:00:00Z",
        message: "feature-only commit",
        url: "https://github.com/owner/repo/commit/bbb",
        oid: "bbb",
        branches: ["feature"],
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);
  });

  it("attaches per-file diffs to commits with --commit-diff", async () => {
    contributionRepos.push(repoNode);
    defaultBranchHistoryNodes.push({
      oid: "abc",
      message: "commit with diff",
      url: "https://github.com/owner/repo/commit/abc",
      committedDate: "2024-01-05T00:00:00Z",
      author: { user: { login: "testuser" } },
    });
    restResponsesByPath.set("/repos/owner/repo/commits/abc", {
      files: [
        {
          filename: "src/secret.ts",
          status: "added",
          additions: 1,
          deletions: 0,
          patch: "+const key = 'x';",
        },
      ],
    });

    const events = (await makeService({ commitDiff: true }).fetchAllEvents()).filter(
      (event) => event.type === "Commit",
    );
    expect(events).toEqual([
      {
        type: "Commit",
        createdAt: "2024-01-05T00:00:00Z",
        message: "commit with diff",
        url: "https://github.com/owner/repo/commit/abc",
        oid: "abc",
        branches: ["main"],
        diff: [
          {
            filename: "src/secret.ts",
            status: "added",
            additions: 1,
            deletions: 0,
            patch: "+const key = 'x';",
          },
        ],
        repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
      },
    ]);
    expect(restCalls).toContain("/repos/owner/repo/commits/abc?page=1");
  });

  it("pages commit diffs past the 300-file REST cap", async () => {
    contributionRepos.push(repoNode);
    defaultBranchHistoryNodes.push({
      oid: "big",
      message: "vendored commit",
      url: "https://github.com/owner/repo/commit/big",
      committedDate: "2024-01-05T00:00:00Z",
      author: { user: { login: "testuser" } },
    });
    restResponsesByPath.set("/repos/owner/repo/commits/big?page=1", {
      files: Array.from({ length: 300 }, (_, index) => fileEntry(index)),
    });
    restResponsesByPath.set("/repos/owner/repo/commits/big?page=2", {
      files: [fileEntry(300)],
    });

    const events = (await makeService({ commitDiff: true }).fetchAllEvents()).filter(
      (event) => event.type === "Commit",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type === "Commit" && events[0].diff?.length).toBe(301);
  });

  it("adds own repositories pushed within the range with --branches all", async () => {
    pushedRepoNodes.push(
      // Never-pushed repositories must be skipped, not treated as an early stop.
      { owner: { login: "testuser" }, name: "never-pushed", visibility: "PUBLIC", pushedAt: null },
      {
        owner: { login: "testuser" },
        name: "pushed-repo",
        visibility: "PUBLIC",
        pushedAt: "2024-01-10T00:00:00Z",
      },
      {
        owner: { login: "testuser" },
        name: "private-repo",
        visibility: "PRIVATE",
        pushedAt: "2024-01-09T00:00:00Z",
      },
      {
        owner: { login: "testuser" },
        name: "old-repo",
        visibility: "PUBLIC",
        pushedAt: "2023-01-01T00:00:00Z",
      },
    );
    branchRefNodes.push({ name: "main" });
    branchHistoryByRef.set("refs/heads/main", [
      {
        oid: "ccc",
        message: "branch commit",
        url: "https://github.com/testuser/pushed-repo/commit/ccc",
        committedDate: "2024-01-11T00:00:00Z",
        author: { user: { login: "testuser" } },
      },
    ]);

    const events = (await makeService({ branches: "all" }).fetchAllEvents()).filter(
      (event) => event.type === "Commit",
    );
    // Only the public repository pushed within the range is scanned: the
    // private one is filtered by --visibility and the old one stops the scan.
    expect(events.map((event) => event.repository.name)).toEqual(["pushed-repo"]);
  });

  it("warns when the range predates the events feed coverage", async () => {
    const warnings: string[] = [];
    await makeService({ onWarning: (message) => warnings.push(message) }).fetchAllEvents();
    expect(warnings.some((message) => message.includes("most recent 90 days"))).toBe(true);
  });

  it("warns when the capped events feed does not reach --since", async () => {
    const now = Date.now();
    const feedItem = {
      type: "PushEvent",
      public: true,
      created_at: new Date(now - 60 * 60 * 1000).toISOString(),
      repo: { name: "owner/repo" },
      payload: {},
    };
    for (const page of [1, 2, 3]) {
      restResponsesByPath.set(
        `/users/testuser/events?per_page=100&page=${String(page)}`,
        Array.from({ length: 100 }, () => feedItem),
      );
    }

    const warnings: string[] = [];
    await makeService({
      since: new Date(now - 7 * 24 * 60 * 60 * 1000),
      until: new Date(now),
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    expect(warnings.some((message) => message.includes("did not reach --since"))).toBe(true);
    expect(warnings.some((message) => message.includes("most recent 90 days"))).toBe(false);
  });

  it("retries REST secondary rate limits using the response body message", async () => {
    restFailureQueue.push({
      status: 403,
      body: { message: "You have exceeded a secondary rate limit. Please wait." },
    });

    const warnings: string[] = [];
    const events = await makeService({
      onWarning: (message) => warnings.push(message),
    }).fetchAllEvents();

    expect(events).toEqual([]);
    expect(restCalls.filter((path) => path.includes("/events")).length).toBeGreaterThanOrEqual(2);
    expect(
      warnings.some((message) => message.includes("retrying") && message.includes("rate limit")),
    ).toBe(true);
  });

  it("omits diffs and uses the default branch without the new flags", async () => {
    contributionRepos.push(repoNode);
    defaultBranchHistoryNodes.push({
      oid: "abc",
      message: "plain commit",
      url: "https://github.com/owner/repo/commit/abc",
      committedDate: "2024-01-05T00:00:00Z",
      author: { user: { login: "testuser" } },
    });

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "Commit",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("diff");
    expect(events[0]).toMatchObject({ branches: ["main"] });
    expect(restCalls.filter((path) => path.startsWith("/repos/"))).toEqual([]);
  });

  it("attaches edit history to issue comments that were edited", async () => {
    issueCommentSearchNodes.push({
      id: "ISSUE_NODE_ID",
      title: "Issue",
      url: "https://github.com/owner/repo/issues/1",
      createdAt: "2024-01-02T00:00:00Z",
      repository: { owner: { login: "owner" }, name: "repo", visibility: "PUBLIC" },
      comments: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            body: "edited comment",
            url: "https://github.com/owner/repo/issues/1#issuecomment-1",
            createdAt: "2024-01-05T12:00:00Z",
            author: { login: "testuser" },
            userContentEdits: {
              nodes: [
                { editedAt: "2024-01-05T13:00:00Z", deletedAt: null, diff: "original wording" },
              ],
            },
          },
        ],
      },
    });

    const events = (await makeService().fetchAllEvents()).filter(
      (event) => event.type === "IssueComment",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      editHistory: [
        { editedAt: "2024-01-05T13:00:00Z", deletedAt: null, diff: "original wording" },
      ],
    });
  });
});

describe("GitHubService GraphQL variables", () => {
  it("never passes the reserved 'query' key to @octokit/graphql", async () => {
    const service = new GitHubService({
      token: "test-token",
      since: new Date("2024-01-01T00:00:00Z"),
      until: new Date("2024-01-15T00:00:00Z"),
      visibility: "public",
    });

    const events = await service.fetchAllEvents();
    expect(events).toEqual([]);

    // The service must actually have issued queries (otherwise the assertion
    // below would pass vacuously).
    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      expect(
        Object.hasOwn(call.variables, "query"),
        `@octokit/graphql reserves "query"; variables for the following query must not use it:\n${call.query}`,
      ).toBe(false);
    }

    // The search queries must supply their search string under the renamed
    // variable instead.
    const searchCalls = calls.filter((call) => call.query.includes("search(type:"));
    expect(searchCalls.length).toBeGreaterThan(0);
    for (const call of searchCalls) {
      expect(Object.hasOwn(call.variables, "searchQuery")).toBe(true);
    }
  });
});
