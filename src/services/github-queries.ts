export const VIEWER_QUERY = `
  query {
    viewer {
      login
    }
  }
`;

export const ISSUE_SEARCH_QUERY = `
  query ($query: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $query, first: $first, after: $after) {
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
  query ($query: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $query, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Issue {
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
  query ($query: String!, $first: Int!, $after: String) {
    search(type: DISCUSSION, query: $query, first: $first, after: $after) {
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
  query ($query: String!, $first: Int!, $after: String) {
    search(type: DISCUSSION, query: $query, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Discussion {
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
  query ($query: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $query, first: $first, after: $after) {
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
  query ($query: String!, $first: Int!, $after: String) {
    search(type: ISSUE, query: $query, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
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
