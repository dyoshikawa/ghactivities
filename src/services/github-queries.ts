export const VIEWER_QUERY = `
  query {
    viewer {
      login
    }
  }
`;

// Prior revisions of an edited comment (newest first). Capped at 5 per
// comment: the review search already nests PR > reviews > comments, and a
// larger page would push the query over GitHub's 500,000-node limit.
const CONTENT_EDIT_FIELDS = `
  userContentEdits(first: 5) {
    nodes {
      editedAt
      deletedAt
      diff
    }
  }
`;

export const ISSUE_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Issue {
          title
          url
          body
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
        }
      }
    }
  }
`;

export const ISSUE_COMMENT_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Issue {
          id
          title
          url
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
          comments(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              body
              url
              createdAt
              author { login }
              ${CONTENT_EDIT_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const DISCUSSION_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: DISCUSSION, query: $searchQuery, first: $first, after: $after) {
      discussionCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Discussion {
          title
          url
          body
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
        }
      }
    }
  }
`;

export const DISCUSSION_COMMENT_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: DISCUSSION, query: $searchQuery, first: $first, after: $after) {
      discussionCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Discussion {
          id
          title
          url
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
          comments(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              body
              url
              createdAt
              author { login }
              ${CONTENT_EDIT_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const PULL_REQUEST_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          title
          url
          body
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
        }
      }
    }
  }
`;

export const PULL_REQUEST_COMMENT_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
          title
          url
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
          comments(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              body
              url
              createdAt
              author { login }
              ${CONTENT_EDIT_FIELDS}
            }
          }
        }
      }
    }
  }
`;

// Fetches the next pages of a comment connection for a single issue,
// discussion, or pull request surfaced by a comment search whose first 100
// comments did not cover the whole thread.
const buildCommentsPageQuery = (
  typename: "Issue" | "Discussion" | "PullRequest" | "PullRequestReview",
): string => `
  query ($nodeId: ID!, $first: Int!, $after: String!) {
    node(id: $nodeId) {
      ... on ${typename} {
        comments(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            body
            url
            createdAt
            author { login }
            ${CONTENT_EDIT_FIELDS}
          }
        }
      }
    }
  }
`;

export const ISSUE_COMMENTS_PAGE_QUERY = buildCommentsPageQuery("Issue");
export const DISCUSSION_COMMENTS_PAGE_QUERY = buildCommentsPageQuery("Discussion");
export const PULL_REQUEST_COMMENTS_PAGE_QUERY = buildCommentsPageQuery("PullRequest");
export const REVIEW_COMMENTS_PAGE_QUERY = buildCommentsPageQuery("PullRequestReview");

// Reviews carry both a summary body and the inline review comments left on the
// diff. Nested `first` sizes stay small to respect GitHub's node limit; the
// tails are fetched through the page queries below. The states filter excludes
// PENDING so the viewer's draft reviews that are not yet submitted never leak
// into the export, and the author argument skips other users' reviews
// server-side.
const REVIEW_STATES = "[COMMENTED, APPROVED, CHANGES_REQUESTED, DISMISSED]";

const REVIEW_FIELDS = `
  id
  body
  url
  createdAt
  submittedAt
  author { login }
  ${CONTENT_EDIT_FIELDS}
  comments(first: 25) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      body
      url
      createdAt
      author { login }
      ${CONTENT_EDIT_FIELDS}
    }
  }
`;

export const PULL_REQUEST_REVIEW_SEARCH_QUERY = `
  query ($searchQuery: String!, $first: Int!, $after: String, $reviewAuthor: String!) {
    search(type: ISSUE, query: $searchQuery, first: $first, after: $after) {
      issueCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
          title
          url
          createdAt
          repository {
            owner { login }
            name
            visibility
          }
          reviews(first: 25, states: ${REVIEW_STATES}, author: $reviewAuthor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
${REVIEW_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const REVIEWS_PAGE_QUERY = `
  query ($nodeId: ID!, $first: Int!, $after: String!, $reviewAuthor: String!) {
    node(id: $nodeId) {
      ... on PullRequest {
        reviews(first: $first, after: $after, states: ${REVIEW_STATES}, author: $reviewAuthor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
${REVIEW_FIELDS}
          }
        }
      }
    }
  }
`;

export const CONTRIBUTIONS_COLLECTION_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository {
          repository {
            owner { login }
            name
            visibility
          }
          contributions(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              occurredAt
              commitCount
              repository {
                owner { login }
                name
                visibility
              }
            }
          }
        }
      }
    }
  }
`;

export const COMMIT_HISTORY_QUERY = `
  query ($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $first: Int!, $after: String, $authorId: ID!) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        name
        target {
          ... on Commit {
            history(since: $since, until: $until, first: $first, after: $after, author: { id: $authorId }) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                oid
                message
                url
                committedDate
                author {
                  user { login }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const USER_ID_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      id
    }
  }
`;

export const BRANCH_REFS_QUERY = `
  query ($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      refs(refPrefix: "refs/heads/", first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
        }
      }
    }
  }
`;

export const BRANCH_COMMIT_HISTORY_QUERY = `
  query ($owner: String!, $name: String!, $qualifiedName: String!, $since: GitTimestamp!, $until: GitTimestamp!, $first: Int!, $after: String, $authorId: ID!) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $qualifiedName) {
        target {
          ... on Commit {
            history(since: $since, until: $until, first: $first, after: $after, author: { id: $authorId }) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                oid
                message
                url
                committedDate
                author {
                  user { login }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GISTS_QUERY = `
  query ($login: String!, $first: Int!, $after: String) {
    user(login: $login) {
      gists(privacy: ALL, first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          description
          url
          createdAt
          isPublic
          files(limit: 50) {
            name
            size
            text
          }
        }
      }
    }
  }
`;

export const COMMIT_COMMENTS_QUERY = `
  query ($login: String!, $first: Int!, $after: String) {
    user(login: $login) {
      commitComments(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          body
          url
          createdAt
          commit { oid }
          repository {
            owner { login }
            name
            visibility
          }
          ${CONTENT_EDIT_FIELDS}
        }
      }
    }
  }
`;

const RELEASE_FIELDS = `
  name
  tagName
  url
  createdAt
  description
  isPrerelease
  isDraft
  author { login }
  releaseAssets(first: 50) {
    nodes {
      name
      downloadUrl
      size
      contentType
    }
  }
`;

// The releases connection is ordered newest-first so the per-repository scan
// can stop as soon as it reaches a release older than --since.
export const REPOSITORIES_WITH_RELEASES_QUERY = `
  query ($login: String!, $first: Int!, $after: String) {
    user(login: $login) {
      repositories(ownerAffiliations: [OWNER], first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          owner { login }
          name
          visibility
          releases(first: 25, orderBy: { field: CREATED_AT, direction: DESC }) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              ${RELEASE_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export const RELEASES_PAGE_QUERY = `
  query ($owner: String!, $name: String!, $first: Int!, $after: String!) {
    repository(owner: $owner, name: $name) {
      releases(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${RELEASE_FIELDS}
        }
      }
    }
  }
`;

// Newest-first so the scan can stop at the first repository created before
// --since. The object expression reads README.md from the default branch.
export const CREATED_REPOSITORIES_QUERY = `
  query ($login: String!, $first: Int!, $after: String) {
    user(login: $login) {
      repositories(ownerAffiliations: [OWNER], first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          owner { login }
          name
          visibility
          url
          description
          createdAt
          isFork
          object(expression: "HEAD:README.md") {
            ... on Blob {
              text
            }
          }
        }
      }
    }
  }
`;

// Newest-pushed-first so the --branches all repository discovery can stop at
// the first repository whose last push predates --since.
export const PUSHED_REPOSITORIES_QUERY = `
  query ($login: String!, $first: Int!, $after: String) {
    user(login: $login) {
      repositories(ownerAffiliations: [OWNER], first: $first, after: $after, orderBy: { field: PUSHED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          owner { login }
          name
          visibility
          pushedAt
        }
      }
    }
  }
`;
