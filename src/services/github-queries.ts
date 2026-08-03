export const VIEWER_QUERY = `
  query {
    viewer {
      login
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

export const VIEWER_ID_QUERY = `
  query {
    viewer {
      id
      login
    }
  }
`;
