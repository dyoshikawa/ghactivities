export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface RepositoryNode {
  owner: { login: string };
  name: string;
  visibility: "PUBLIC" | "PRIVATE";
}

export interface IssueNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export interface IssueSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: IssueNode[];
  };
}

export interface CommentNode {
  body: string;
  url: string;
  createdAt: string;
  author: { login: string } | null;
}

export interface IssueWithCommentsNode {
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: {
    pageInfo: PageInfo;
    nodes: CommentNode[];
  };
}

export interface IssueCommentSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: IssueWithCommentsNode[];
  };
}

export interface DiscussionNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export interface DiscussionSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: DiscussionNode[];
  };
}

export interface DiscussionWithCommentsNode {
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: {
    pageInfo: PageInfo;
    nodes: CommentNode[];
  };
}

export interface DiscussionCommentSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: DiscussionWithCommentsNode[];
  };
}

export interface PullRequestNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export interface PullRequestSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: PullRequestNode[];
  };
}

export interface PullRequestWithCommentsNode {
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: {
    pageInfo: PageInfo;
    nodes: CommentNode[];
  };
}

export interface PullRequestCommentSearchResponse {
  search: {
    pageInfo: PageInfo;
    nodes: PullRequestWithCommentsNode[];
  };
}

export interface CommitContributionNode {
  occurredAt: string;
  repository: {
    owner: { login: string };
    name: string;
    visibility: "PUBLIC" | "PRIVATE";
  };
  commitCount: number;
}

export interface ContributionsCollectionResponse {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: {
        repository: {
          owner: { login: string };
          name: string;
          visibility: "PUBLIC" | "PRIVATE";
        };
        contributions: {
          pageInfo: PageInfo;
          nodes: CommitContributionNode[];
        };
      }[];
    };
  };
}

export interface CommitHistoryNode {
  oid: string;
  message: string;
  url: string;
  committedDate: string;
  author: {
    user: { login: string } | null;
  };
}

export interface CommitHistoryResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history: {
          pageInfo: PageInfo;
          nodes: CommitHistoryNode[];
        };
      };
    } | null;
  };
}

export interface ViewerResponse {
  viewer: {
    login: string;
  };
}
