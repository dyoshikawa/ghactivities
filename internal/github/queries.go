package github

const viewerQuery = `
query {
  viewer {
    id
    login
  }
}
`

const issueSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
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
`

const issueCommentSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
  search(type: ISSUE, query: $query, first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Issue {
        title
        url
        repository {
          owner { login }
          name
          visibility
        }
        comments(first: 100) {
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
`

const discussionSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
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
`

const discussionCommentSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
  search(type: DISCUSSION, query: $query, first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Discussion {
        title
        url
        repository {
          owner { login }
          name
          visibility
        }
        comments(first: 100) {
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
`

const pullRequestSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
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
`

const pullRequestCommentSearchQuery = `
query($query: String!, $first: Int!, $after: String) {
  search(type: ISSUE, query: $query, first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {
        title
        url
        repository {
          owner { login }
          name
          visibility
        }
        comments(first: 100) {
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
`

const contributionsCollectionQuery = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository {
        repository {
          owner { login }
          name
          visibility
        }
      }
    }
  }
}
`

const commitHistoryQuery = `
query($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $first: Int!, $after: String, $authorId: ID!) {
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
            }
          }
        }
      }
    }
  }
}
`
