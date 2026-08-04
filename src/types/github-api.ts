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

export interface UserContentEditNode {
  editedAt: string;
  deletedAt: string | null;
  diff: string | null;
}

export interface UserContentEditsConnection {
  nodes: UserContentEditNode[];
}

export interface CommentNode {
  body: string;
  url: string;
  createdAt: string;
  author: { login: string } | null;
  userContentEdits: UserContentEditsConnection | null;
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

export interface ReviewNode {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  /** Null while a review is a pending draft; set once it is submitted. */
  submittedAt: string | null;
  author: { login: string } | null;
  comments: CommentsConnection;
  userContentEdits: UserContentEditsConnection | null;
}

export interface ReviewsConnection {
  pageInfo: PageInfo;
  nodes: ReviewNode[];
}

export interface ReviewsPageResponse {
  node: { reviews: ReviewsConnection } | null;
}

export interface PullRequestWithReviewsNode {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  repository: RepositoryNode;
  reviews: ReviewsConnection;
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
      name: string;
      target: {
        history: {
          pageInfo: PageInfo;
          nodes: CommitHistoryNode[];
        };
      };
    } | null;
  };
}

export interface BranchRefsResponse {
  repository: {
    refs: {
      pageInfo: PageInfo;
      nodes: { name: string }[];
    };
  } | null;
}

export interface BranchCommitHistoryResponse {
  repository: {
    ref: {
      target: {
        history: {
          pageInfo: PageInfo;
          nodes: CommitHistoryNode[];
        };
      } | null;
    } | null;
  } | null;
}

export interface GistNode {
  name: string;
  description: string | null;
  url: string;
  createdAt: string;
  isPublic: boolean;
  /** The list and its entries are nullable in GitHub's schema. */
  files:
    | ({
        name: string;
        size: number;
        text: string | null;
      } | null)[]
    | null;
}

export interface GistsResponse {
  user: {
    gists: {
      pageInfo: PageInfo;
      nodes: GistNode[];
    };
  } | null;
}

export interface CommitCommentNode {
  body: string;
  url: string;
  createdAt: string;
  commit: { oid: string } | null;
  repository: RepositoryNode;
  userContentEdits: UserContentEditsConnection | null;
}

export interface CommitCommentsResponse {
  user: {
    commitComments: {
      pageInfo: PageInfo;
      nodes: CommitCommentNode[];
    };
  } | null;
}

export interface ReleaseNode {
  name: string | null;
  tagName: string;
  url: string;
  createdAt: string;
  /** Null while the release is an unpublished draft. */
  publishedAt: string | null;
  description: string | null;
  isPrerelease: boolean;
  isDraft: boolean;
  author: { login: string } | null;
  releaseAssets: {
    nodes: {
      name: string;
      downloadUrl: string;
      size: number;
      contentType: string;
    }[];
  };
}

export interface ReleasesConnection {
  pageInfo: PageInfo;
  nodes: ReleaseNode[];
}

export interface RepositoryWithReleasesNode {
  owner: { login: string };
  name: string;
  visibility: RepositoryVisibility;
  releases: ReleasesConnection;
}

export interface RepositoriesWithReleasesResponse {
  user: {
    repositories: {
      pageInfo: PageInfo;
      nodes: RepositoryWithReleasesNode[];
    };
  } | null;
}

export interface ReleasesPageResponse {
  repository: {
    releases: ReleasesConnection;
  } | null;
}

export interface CreatedRepositoryNode {
  owner: { login: string };
  name: string;
  visibility: RepositoryVisibility;
  url: string;
  description: string | null;
  createdAt: string;
  isFork: boolean;
  object: { text: string | null } | null;
}

export interface CreatedRepositoriesResponse {
  user: {
    repositories: {
      pageInfo: PageInfo;
      nodes: CreatedRepositoryNode[];
    };
  } | null;
}

export interface PushedRepositoryNode {
  owner: { login: string };
  name: string;
  visibility: RepositoryVisibility;
  pushedAt: string | null;
}

export interface PushedRepositoriesResponse {
  user: {
    repositories: {
      pageInfo: PageInfo;
      nodes: PushedRepositoryNode[];
    };
  } | null;
}

/** REST: one item of GET /users/{login}/events (only the fields we read). */
export interface RestUserEvent {
  type: string;
  public: boolean;
  created_at: string;
  repo: { name: string };
  payload: {
    pages?: {
      page_name: string;
      title: string;
      action: string;
      html_url: string;
    }[];
  };
}

/** REST: GET /repos/{owner}/{name}/commits/{oid} (only the fields we read). */
export interface RestCommitDetail {
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
}

export interface ViewerResponse {
  viewer: {
    login: string;
  };
}

export interface UserIdResponse {
  user: {
    id: string;
  } | null;
}
