package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dyoshikawa/ghevents/internal/events"
	"github.com/dyoshikawa/ghevents/internal/util"
)

const graphQLEndpoint = "https://api.github.com/graphql"

type Client struct {
	httpClient *http.Client
	token      string
	since      time.Time
	until      time.Time
	visibility string
}

func NewClient(token string, since time.Time, until time.Time, visibility string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		token:      token,
		since:      since.UTC(),
		until:      until.UTC(),
		visibility: visibility,
	}
}

func (c *Client) FetchAllEvents(ctx context.Context) ([]events.Event, error) {
	v, err := c.fetchViewer(ctx)
	if err != nil {
		return nil, err
	}

	var all []events.Event

	fetchers := []func(context.Context, viewer) ([]events.Event, error){
		c.fetchIssues,
		c.fetchIssueComments,
		c.fetchDiscussions,
		c.fetchDiscussionComments,
		c.fetchPullRequests,
		c.fetchPullRequestComments,
		c.fetchCommits,
	}

	for _, fetch := range fetchers {
		items, fetchErr := fetch(ctx, v)
		if fetchErr != nil {
			return nil, fetchErr
		}
		all = append(all, items...)
	}

	return all, nil
}

type viewer struct {
	ID    string
	Login string
}

func (c *Client) fetchViewer(ctx context.Context) (viewer, error) {
	var response viewerResponse
	if err := c.doGraphQL(ctx, viewerQuery, nil, &response); err != nil {
		return viewer{}, err
	}

	return viewer{
		ID:    response.Viewer.ID,
		Login: response.Viewer.Login,
	}, nil
}

func (c *Client) fetchIssues(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("author:%s is:issue", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response issueSearchResponse
		if err := c.doGraphQL(ctx, issueSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			collected = append(collected, events.IssueEvent{
				Type:      "Issue",
				CreatedAt: node.CreatedAt,
				Title:     node.Title,
				URL:       node.URL,
				Body:      node.Body,
				Repository: events.Repository{
					Owner:      node.Repository.Owner.Login,
					Name:       node.Repository.Name,
					Visibility: node.Repository.Visibility,
				},
			})
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchIssueComments(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("commenter:%s is:issue", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response issueCommentSearchResponse
		if err := c.doGraphQL(ctx, issueCommentSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			for _, comment := range node.Comments.Nodes {
				if comment.Author == nil || comment.Author.Login != viewer.Login || !c.isWithinDateRange(comment.CreatedAt) {
					continue
				}

				collected = append(collected, events.IssueCommentEvent{
					Type:       "IssueComment",
					CreatedAt:  comment.CreatedAt,
					IssueTitle: node.Title,
					IssueURL:   node.URL,
					Body:       comment.Body,
					URL:        comment.URL,
					Repository: events.Repository{
						Owner:      node.Repository.Owner.Login,
						Name:       node.Repository.Name,
						Visibility: node.Repository.Visibility,
					},
				})
			}
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchDiscussions(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("author:%s type:discussion", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response discussionSearchResponse
		if err := c.doGraphQL(ctx, discussionSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			collected = append(collected, events.DiscussionEvent{
				Type:      "Discussion",
				CreatedAt: node.CreatedAt,
				Title:     node.Title,
				URL:       node.URL,
				Body:      node.Body,
				Repository: events.Repository{
					Owner:      node.Repository.Owner.Login,
					Name:       node.Repository.Name,
					Visibility: node.Repository.Visibility,
				},
			})
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchDiscussionComments(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("commenter:%s type:discussion", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response discussionCommentSearchResponse
		if err := c.doGraphQL(ctx, discussionCommentSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			for _, comment := range node.Comments.Nodes {
				if comment.Author == nil || comment.Author.Login != viewer.Login || !c.isWithinDateRange(comment.CreatedAt) {
					continue
				}

				collected = append(collected, events.DiscussionCommentEvent{
					Type:            "DiscussionComment",
					CreatedAt:       comment.CreatedAt,
					DiscussionTitle: node.Title,
					DiscussionURL:   node.URL,
					Body:            comment.Body,
					URL:             comment.URL,
					Repository: events.Repository{
						Owner:      node.Repository.Owner.Login,
						Name:       node.Repository.Name,
						Visibility: node.Repository.Visibility,
					},
				})
			}
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchPullRequests(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("author:%s is:pr", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response pullRequestSearchResponse
		if err := c.doGraphQL(ctx, pullRequestSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			collected = append(collected, events.PullRequestEvent{
				Type:      "PullRequest",
				CreatedAt: node.CreatedAt,
				Title:     node.Title,
				URL:       node.URL,
				Body:      node.Body,
				Repository: events.Repository{
					Owner:      node.Repository.Owner.Login,
					Name:       node.Repository.Name,
					Visibility: node.Repository.Visibility,
				},
			})
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchPullRequestComments(ctx context.Context, viewer viewer) ([]events.Event, error) {
	query := c.buildSearchQuery(fmt.Sprintf("commenter:%s is:pr", viewer.Login))
	var collected []events.Event
	cursor := ""

	for {
		var response pullRequestCommentSearchResponse
		if err := c.doGraphQL(ctx, pullRequestCommentSearchQuery, map[string]any{
			"query": query,
			"first": 100,
			"after": nullableString(cursor),
		}, &response); err != nil {
			return nil, err
		}

		for _, node := range response.Search.Nodes {
			if !c.matchesVisibility(node.Repository.Visibility) {
				continue
			}

			for _, comment := range node.Comments.Nodes {
				if comment.Author == nil || comment.Author.Login != viewer.Login || !c.isWithinDateRange(comment.CreatedAt) {
					continue
				}

				collected = append(collected, events.PullRequestCommentEvent{
					Type:      "PullRequestComment",
					CreatedAt: comment.CreatedAt,
					PRTitle:   node.Title,
					PRURL:     node.URL,
					Body:      comment.Body,
					URL:       comment.URL,
					Repository: events.Repository{
						Owner:      node.Repository.Owner.Login,
						Name:       node.Repository.Name,
						Visibility: node.Repository.Visibility,
					},
				})
			}
		}

		if !response.Search.PageInfo.HasNextPage {
			break
		}
		cursor = response.Search.PageInfo.EndCursor
	}

	return collected, nil
}

func (c *Client) fetchCommits(ctx context.Context, viewer viewer) ([]events.Event, error) {
	periods := util.SplitDateRangeIntoYearPeriods(util.DateRange{
		Since: c.since,
		Until: c.until,
	})

	repositories := make(map[string]string)
	for _, period := range periods {
		var response contributionsCollectionResponse
		if err := c.doGraphQL(ctx, contributionsCollectionQuery, map[string]any{
			"login": viewer.Login,
			"from":  period.Since.Format(time.RFC3339Nano),
			"to":    period.Until.Format(time.RFC3339Nano),
		}, &response); err != nil {
			return nil, err
		}

		for _, repo := range response.User.ContributionsCollection.CommitContributionsByRepository {
			if !c.matchesVisibility(repo.Repository.Visibility) {
				continue
			}
			key := repo.Repository.Owner.Login + "/" + repo.Repository.Name
			repositories[key] = repo.Repository.Visibility
		}
	}

	var collected []events.Event
	for key, visibility := range repositories {
		owner, name, ok := strings.Cut(key, "/")
		if !ok {
			continue
		}

		cursor := ""
		for {
			var response commitHistoryResponse
			if err := c.doGraphQL(ctx, commitHistoryQuery, map[string]any{
				"owner":    owner,
				"name":     name,
				"since":    c.since.Format(time.RFC3339Nano),
				"until":    c.until.Format(time.RFC3339Nano),
				"first":    100,
				"after":    nullableString(cursor),
				"authorId": viewer.ID,
			}, &response); err != nil {
				return nil, err
			}

			if response.Repository.DefaultBranchRef == nil {
				break
			}

			for _, node := range response.Repository.DefaultBranchRef.Target.History.Nodes {
				collected = append(collected, events.CommitEvent{
					Type:      "Commit",
					CreatedAt: node.CommittedDate,
					Message:   node.Message,
					URL:       node.URL,
					OID:       node.OID,
					Repository: events.Repository{
						Owner:      owner,
						Name:       name,
						Visibility: visibility,
					},
				})
			}

			history := response.Repository.DefaultBranchRef.Target.History
			if !history.PageInfo.HasNextPage {
				break
			}
			cursor = history.PageInfo.EndCursor
		}
	}

	return collected, nil
}

func (c *Client) buildSearchQuery(qualifiers string) string {
	since := c.since.Format("2006-01-02")
	until := c.until.Format("2006-01-02")
	return qualifiers + " created:" + since + ".." + until
}

func (c *Client) matchesVisibility(value string) bool {
	switch c.visibility {
	case "all":
		return true
	case "public":
		return value == "PUBLIC"
	default:
		return value == "PRIVATE"
	}
}

func (c *Client) isWithinDateRange(value string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return false
	}
	parsed = parsed.UTC()
	return !parsed.Before(c.since) && !parsed.After(c.until)
}

func (c *Client) doGraphQL(ctx context.Context, query string, variables map[string]any, out any) error {
	body, err := json.Marshal(graphQLRequest{Query: query, Variables: variables})
	if err != nil {
		return fmt.Errorf("marshal GitHub GraphQL request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, graphQLEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create GitHub GraphQL request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("call GitHub GraphQL API: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read GitHub GraphQL response: %w", err)
	}

	var payload graphQLResponse
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return fmt.Errorf("decode GitHub GraphQL response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := strings.TrimSpace(string(responseBody))
		if joined := payload.joinErrors(); joined != "" {
			message = joined
		}
		return fmt.Errorf("GitHub GraphQL API returned %s: %s", resp.Status, message)
	}

	if joined := payload.joinErrors(); joined != "" {
		return fmt.Errorf("GitHub GraphQL API error: %s", joined)
	}

	if out == nil {
		return nil
	}

	if err := json.Unmarshal(payload.Data, out); err != nil {
		return fmt.Errorf("decode GitHub GraphQL data: %w", err)
	}

	return nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func (r graphQLResponse) joinErrors() string {
	if len(r.Errors) == 0 {
		return ""
	}

	parts := make([]string, 0, len(r.Errors))
	for _, item := range r.Errors {
		if item.Message != "" {
			parts = append(parts, item.Message)
		}
	}
	return strings.Join(parts, "; ")
}

type pageInfo struct {
	HasNextPage bool   `json:"hasNextPage"`
	EndCursor   string `json:"endCursor"`
}

type repositoryNode struct {
	Owner struct {
		Login string `json:"login"`
	} `json:"owner"`
	Name       string `json:"name"`
	Visibility string `json:"visibility"`
}

type viewerResponse struct {
	Viewer struct {
		ID    string `json:"id"`
		Login string `json:"login"`
	} `json:"viewer"`
}

type issueSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Body       string         `json:"body"`
			CreatedAt  string         `json:"createdAt"`
			Repository repositoryNode `json:"repository"`
		} `json:"nodes"`
	} `json:"search"`
}

type issueCommentSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Repository repositoryNode `json:"repository"`
			Comments   struct {
				Nodes []struct {
					Body      string `json:"body"`
					URL       string `json:"url"`
					CreatedAt string `json:"createdAt"`
					Author    *struct {
						Login string `json:"login"`
					} `json:"author"`
				} `json:"nodes"`
			} `json:"comments"`
		} `json:"nodes"`
	} `json:"search"`
}

type discussionSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Body       string         `json:"body"`
			CreatedAt  string         `json:"createdAt"`
			Repository repositoryNode `json:"repository"`
		} `json:"nodes"`
	} `json:"search"`
}

type discussionCommentSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Repository repositoryNode `json:"repository"`
			Comments   struct {
				Nodes []struct {
					Body      string `json:"body"`
					URL       string `json:"url"`
					CreatedAt string `json:"createdAt"`
					Author    *struct {
						Login string `json:"login"`
					} `json:"author"`
				} `json:"nodes"`
			} `json:"comments"`
		} `json:"nodes"`
	} `json:"search"`
}

type pullRequestSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Body       string         `json:"body"`
			CreatedAt  string         `json:"createdAt"`
			Repository repositoryNode `json:"repository"`
		} `json:"nodes"`
	} `json:"search"`
}

type pullRequestCommentSearchResponse struct {
	Search struct {
		PageInfo pageInfo `json:"pageInfo"`
		Nodes    []struct {
			Title      string         `json:"title"`
			URL        string         `json:"url"`
			Repository repositoryNode `json:"repository"`
			Comments   struct {
				Nodes []struct {
					Body      string `json:"body"`
					URL       string `json:"url"`
					CreatedAt string `json:"createdAt"`
					Author    *struct {
						Login string `json:"login"`
					} `json:"author"`
				} `json:"nodes"`
			} `json:"comments"`
		} `json:"nodes"`
	} `json:"search"`
}

type contributionsCollectionResponse struct {
	User struct {
		ContributionsCollection struct {
			CommitContributionsByRepository []struct {
				Repository repositoryNode `json:"repository"`
			} `json:"commitContributionsByRepository"`
		} `json:"contributionsCollection"`
	} `json:"user"`
}

type commitHistoryResponse struct {
	Repository struct {
		DefaultBranchRef *struct {
			Target struct {
				History struct {
					PageInfo pageInfo `json:"pageInfo"`
					Nodes    []struct {
						OID           string `json:"oid"`
						Message       string `json:"message"`
						URL           string `json:"url"`
						CommittedDate string `json:"committedDate"`
					} `json:"nodes"`
				} `json:"history"`
			} `json:"target"`
		} `json:"defaultBranchRef"`
	} `json:"repository"`
}
