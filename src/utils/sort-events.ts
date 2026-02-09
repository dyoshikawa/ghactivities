import type { Order } from "../types/cli.js";
import type { GitHubEvent } from "../types/events.js";

export function sortEvents(params: { events: GitHubEvent[]; order: Order }): GitHubEvent[] {
  const { events, order } = params;
  return events.toSorted((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return order === "asc" ? dateA - dateB : dateB - dateA;
  });
}
