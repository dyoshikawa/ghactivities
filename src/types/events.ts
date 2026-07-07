export type GitHubEvent =
  | IssueEvent
  | IssueCommentEvent
  | DiscussionEvent
  | DiscussionCommentEvent
  | PullRequestEvent
  | PullRequestCommentEvent
  | CommitEvent;

interface BaseEvent {
  type: string;
  createdAt: string;
  repository: {
    owner: string;
    name: string;
    visibility: "PUBLIC" | "PRIVATE";
  };
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
}

export interface CommitEvent extends BaseEvent {
  type: "Commit";
  message: string;
  url: string;
  oid: string;
}
