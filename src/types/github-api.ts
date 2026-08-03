// Mirrors GitHub's GraphQL RepositoryVisibility enum. INTERNAL is used by
// organization-internal repositories on GitHub Enterprise.
export type RepositoryVisibility = "PUBLIC" | "PRIVATE" | "INTERNAL";

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface SearchConnection<TNode> {
  issueCount?: number;
  discussionCount?: number;
  pageInfo: PageInfo;
  nodes: TNode[];
}

export interface SearchResponse<TNode> {
  search: SearchConnection<TNode>;
}

export interface RepositoryNode {
  owner: { login: string };
  name: string;
  visibility: RepositoryVisibility;
}

export interface IssueNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export type IssueSearchResponse = SearchResponse<IssueNode>;

export interface CommentNode {
  body: string;
  url: string;
  createdAt: string;
  author: { login: string } | null;
}

export interface CommentsConnection {
  pageInfo: PageInfo;
  nodes: CommentNode[];
}

export interface CommentsPageResponse {
  node: { comments: CommentsConnection } | null;
}

export interface IssueWithCommentsNode {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: CommentsConnection;
}

export type IssueCommentSearchResponse = SearchResponse<IssueWithCommentsNode>;

export interface DiscussionNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export type DiscussionSearchResponse = SearchResponse<DiscussionNode>;

export interface DiscussionWithCommentsNode {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: CommentsConnection;
}

export type DiscussionCommentSearchResponse = SearchResponse<DiscussionWithCommentsNode>;

export interface PullRequestNode {
  title: string;
  url: string;
  body: string;
  createdAt: string;
  repository: RepositoryNode;
}

export type PullRequestSearchResponse = SearchResponse<PullRequestNode>;

export interface PullRequestWithCommentsNode {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  comments: CommentsConnection;
}

export type PullRequestCommentSearchResponse = SearchResponse<PullRequestWithCommentsNode>;

export interface CommitContributionNode {
  occurredAt: string;
  repository: {
    owner: { login: string };
    name: string;
    visibility: RepositoryVisibility;
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
          visibility: RepositoryVisibility;
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
