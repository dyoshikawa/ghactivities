import { describe, expect, it } from "vitest";

import type { GitHubEvent } from "../types/events.js";

import { sortEvents } from "./sort-events.js";

const makeEvent = (createdAt: string): GitHubEvent => ({
  type: "Issue",
  createdAt,
  title: "test",
  url: "https://example.com",
  body: "",
  repository: { owner: "owner", name: "repo", visibility: "PUBLIC" },
});

describe("sortEvents", () => {
  it("sorts events in ascending order", () => {
    const events = [
      makeEvent("2024-03-01T00:00:00Z"),
      makeEvent("2024-01-01T00:00:00Z"),
      makeEvent("2024-02-01T00:00:00Z"),
    ];
    const sorted = sortEvents({ events, order: "asc" });
    expect(sorted[0]!.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(sorted[1]!.createdAt).toBe("2024-02-01T00:00:00Z");
    expect(sorted[2]!.createdAt).toBe("2024-03-01T00:00:00Z");
  });

  it("sorts events in descending order", () => {
    const events = [
      makeEvent("2024-01-01T00:00:00Z"),
      makeEvent("2024-03-01T00:00:00Z"),
      makeEvent("2024-02-01T00:00:00Z"),
    ];
    const sorted = sortEvents({ events, order: "desc" });
    expect(sorted[0]!.createdAt).toBe("2024-03-01T00:00:00Z");
    expect(sorted[1]!.createdAt).toBe("2024-02-01T00:00:00Z");
    expect(sorted[2]!.createdAt).toBe("2024-01-01T00:00:00Z");
  });

  it("does not mutate the original array", () => {
    const events = [makeEvent("2024-02-01T00:00:00Z"), makeEvent("2024-01-01T00:00:00Z")];
    const original = [...events];
    sortEvents({ events, order: "asc" });
    expect(events[0]!.createdAt).toBe(original[0]!.createdAt);
    expect(events[1]!.createdAt).toBe(original[1]!.createdAt);
  });

  it("handles empty array", () => {
    expect(sortEvents({ events: [], order: "asc" })).toEqual([]);
  });
});
