import { describe, expect, it, vi } from "vitest";

import { GitHubService } from "./github.js";

// Records every call the GitHubService makes to @octokit/graphql so the test
// can assert none of them uses a reserved variable key. Declared via
// vi.hoisted so it is available inside the (hoisted) vi.mock factory below.
const { calls } = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; variables: Record<string, unknown> }>,
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
      return Promise.resolve({
        search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
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

describe("GitHubService GraphQL variables", () => {
  it("never passes the reserved 'query' key to @octokit/graphql", async () => {
    calls.length = 0;

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
