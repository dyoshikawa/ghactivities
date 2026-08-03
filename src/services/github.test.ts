import { beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubService } from "./github.js";

// Records every call the GitHubService makes to @octokit/graphql so the test
// can assert none of them uses a reserved variable key, and exposes a mutable
// node list served to the issue-comment search. Declared via vi.hoisted so
// both are available inside the (hoisted) vi.mock factory below.
const { calls, issueCommentSearchNodes, commentPagesByCursor, searchResponsesByQuery, failures } =
  vi.hoisted(() => ({
    calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
    issueCommentSearchNodes: [] as unknown[],
    commentPagesByCursor: new Map<string, unknown>(),
    searchResponsesByQuery: new Map<string, unknown>(),
    // Failure injection: while a substring's error list is non-empty, calls
    // whose query or searchQuery contains the substring reject with the next
    // error from the list.
    failures: new Map<string, unknown[]>(),
  }));

// Mock @octokit/graphql with a stub that returns empty-but-valid shapes for
// each query the service issues, and records the (query, variables) pairs.
vi.mock("@octokit/graphql", () => {
  const impl = (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });

    const failureKey = `${query} ${String(variables.searchQuery ?? "")}`;
    for (const [substring, errors] of failures) {
      if (errors.length > 0 && failureKey.includes(substring)) {
        return Promise.reject(errors.shift());
      }
    }

    if (query.includes("contributionsCollection")) {
      return Promise.resolve({
        user: { contributionsCollection: { commitContributionsByRepository: [] } },
      });
    }
    if (query.includes("defaultBranchRef")) {
      return Promise.resolve({ repository: { defaultBranchRef: null } });
    }
    // Nested comment pagination: serves the comment page registered for the
    // requested cursor. Must be checked before the viewer-id fallback because
    // this query text also contains "id".
    if (query.includes("node(id:")) {
      const page = commentPagesByCursor.get(String(variables.after ?? ""));
      return Promise.resolve({ node: page ? { comments: page } : null });
    }
    if (query.includes("search(type:")) {
      const searchQuery = String(variables.searchQuery ?? "");
      const preset = searchResponsesByQuery.get(searchQuery);
      if (preset) return Promise.resolve({ search: preset });
      const isIssueCommentSearch =
        searchQuery.includes("commenter:") && searchQuery.includes("is:issue");
      return Promise.resolve({
        search: {
          issueCount: 0,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: isIssueCommentSearch ? issueCommentSearchNodes : [],
        },
      });
    }
    // The only remaining queries are the two viewer lookups; the id variant is
    // the one that also selects the `id` field.
    if (query.includes("id")) {
      return Promise.resolve({ viewer: { id: "VIEWER_ID", login: "testuser" } });
    }
    return Promise.resolve({ viewer: { login: "testuser" } });
  };

  return { graphql: Object.assign(impl, { defaults: () => impl }) };
});

beforeEach(() => {
  calls.length = 0;
  issueCommentSearchNodes.length = 0;
  commentPagesByCursor.clear();
  searchResponsesByQuery.clear();
  failures.clear();
});

const makeService = (params?: {
  since?: Date;
  until?: Date;
  visibility?: "public" | "private" | "all";
  onWarning?: (message: string) => void;
  retry?: { maxAttempts?: number; baseDelayMs?: number };
}) =>
  new GitHubService({
    token: "test-token",
    since: params?.since ?? new Date("2024-01-01T00:00:00Z"),
    until: params?.until ?? new Date("2024-01-15T00:00:00Z"),
    visibility: params?.visibility ?? "public",
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
    expect(warnings).toEqual([]);
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
    expect(warnings).toEqual([]);
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1000");
    expect(warnings[0]).toContain("author:testuser is:issue created:2024-01-05..2024-01-05");
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("retrying");
    expect(warnings[0]).toContain("Bad gateway");
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
