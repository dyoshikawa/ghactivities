import { describe, expect, it, vi } from "vitest";

import { GitHubService } from "./github.js";

// Records every call the GitHubService makes to @octokit/graphql so the test
// can assert none of them uses a reserved variable key, and exposes a mutable
// node list served to the issue-comment search. Declared via vi.hoisted so
// both are available inside the (hoisted) vi.mock factory below.
const { calls, issueCommentSearchNodes } = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
  issueCommentSearchNodes: [] as unknown[],
}));

// Mock @octokit/graphql with a stub that returns empty-but-valid shapes for
// each query the service issues, and records the (query, variables) pairs.
vi.mock("@octokit/graphql", () => {
  const impl = (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });

    if (query.includes("contributionsCollection")) {
      return Promise.resolve({
        user: { contributionsCollection: { commitContributionsByRepository: [] } },
      });
    }
    if (query.includes("defaultBranchRef")) {
      return Promise.resolve({ repository: { defaultBranchRef: null } });
    }
    if (query.includes("search(type:")) {
      const searchQuery = String(variables.searchQuery ?? "");
      const isIssueCommentSearch =
        searchQuery.includes("commenter:") && searchQuery.includes("is:issue");
      return Promise.resolve({
        search: {
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

const makeService = () =>
  new GitHubService({
    token: "test-token",
    since: new Date("2024-01-01T00:00:00Z"),
    until: new Date("2024-01-15T00:00:00Z"),
    visibility: "public",
  });

describe("search date qualifiers", () => {
  it("bounds author searches by created: and commenter searches by updated:>= only", async () => {
    calls.length = 0;
    issueCommentSearchNodes.length = 0;

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
    // A `created:` bound on a commenter search would match the parent item's
    // creation date and silently drop comments left on older items.
    for (const searchQuery of commenterQueries) {
      expect(searchQuery).toContain("updated:>=2024-01-01");
      expect(searchQuery).not.toContain("created:");
      expect(searchQuery).not.toContain("updated:>=2024-01-01..");
    }
  });

  it("collects an in-range comment on an issue created before the range", async () => {
    calls.length = 0;
    issueCommentSearchNodes.length = 0;
    issueCommentSearchNodes.push({
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
});

describe("GitHubService GraphQL variables", () => {
  it("never passes the reserved 'query' key to @octokit/graphql", async () => {
    calls.length = 0;
    issueCommentSearchNodes.length = 0;

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
