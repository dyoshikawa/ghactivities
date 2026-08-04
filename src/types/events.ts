import type { RepositoryVisibility } from "./github-api.js";

export type GitHubEvent =
  | IssueEvent
  | IssueCommentEvent
  | DiscussionEvent
  | DiscussionCommentEvent
  | PullRequestEvent
  | PullRequestCommentEvent
  | PullRequestReviewCommentEvent
  | CommitEvent
  | CommitCommentEvent
  | GistEvent
  | ReleaseEvent
  | RepositoryEvent
  | WikiPageEditEvent;

interface BaseEvent {
  type: string;
  createdAt: string;
  repository: {
    owner: string;
    name: string;
    visibility: RepositoryVisibility;
  };
}

/**
 * One prior revision of an edited comment. Present on comment events only
 * when the comment has been edited, so "deleted right after posting" content
 * stays auditable.
 */
export interface ContentEdit {
  editedAt: string;
  deletedAt: string | null;
  diff: string | null;
}

export interface IssueEvent extends BaseEvent {
  type: "Issue";
  title: string;
  url: string;
  body: string;
}

export interface IssueCommentEvent extends BaseEvent {
  type: "IssueComment";
  issueTitle: string;
  issueUrl: string;
  body: string;
  url: string;
  editHistory?: ContentEdit[];
}

export interface DiscussionEvent extends BaseEvent {
  type: "Discussion";
  title: string;
  url: string;
  body: string;
}

export interface DiscussionCommentEvent extends BaseEvent {
  type: "DiscussionComment";
  discussionTitle: string;
  discussionUrl: string;
  body: string;
  url: string;
  editHistory?: ContentEdit[];
}

export interface PullRequestEvent extends BaseEvent {
  type: "PullRequest";
  title: string;
  url: string;
  body: string;
}

export interface PullRequestCommentEvent extends BaseEvent {
  type: "PullRequestComment";
  prTitle: string;
  prUrl: string;
  body: string;
  url: string;
  editHistory?: ContentEdit[];
}

export interface PullRequestReviewCommentEvent extends BaseEvent {
  type: "PullRequestReviewComment";
  prTitle: string;
  prUrl: string;
  body: string;
  url: string;
  editHistory?: ContentEdit[];
}

/** One changed file of a commit, fetched via the REST API with --commit-diff. */
export interface CommitDiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff text; null for binary or oversized files. */
  patch: string | null;
}

export interface CommitEvent extends BaseEvent {
  type: "Commit";
  message: string;
  url: string;
  oid: string;
  /** Branches the commit was collected from (the default branch, or every branch with --branches all). */
  branches: string[];
  /** Present only with --commit-diff. */
  diff?: CommitDiffFile[];
}

export interface CommitCommentEvent extends BaseEvent {
  type: "CommitComment";
  body: string;
  url: string;
  /** Null when the commented commit is no longer resolvable. */
  commitOid: string | null;
  editHistory?: ContentEdit[];
}

export interface GistFileEntry {
  name: string;
  size: number;
  /** File content; null for binary files. */
  text: string | null;
}

/**
 * A gist created by the user. Gists have no repository; `repository` carries
 * the gist owner as `owner`, the gist id as `name`, and PUBLIC/PRIVATE for
 * public/secret gists so the --visibility filter applies uniformly.
 */
export interface GistEvent extends BaseEvent {
  type: "Gist";
  description: string | null;
  url: string;
  files: GistFileEntry[];
}

export interface ReleaseAssetEntry {
  name: string;
  url: string;
  size: number;
  contentType: string;
}

export interface ReleaseEvent extends BaseEvent {
  type: "Release";
  title: string;
  tagName: string;
  url: string;
  body: string | null;
  isPrerelease: boolean;
  isDraft: boolean;
  assets: ReleaseAssetEntry[];
}

/** A repository created by the user within the date range. */
export interface RepositoryEvent extends BaseEvent {
  type: "Repository";
  url: string;
  description: string | null;
  isFork: boolean;
  /** Content of README.md on the default branch, when present. */
  readme: string | null;
}

export interface WikiPageEditEvent extends BaseEvent {
  type: "WikiPageEdit";
  pageTitle: string;
  action: string;
  url: string;
}
