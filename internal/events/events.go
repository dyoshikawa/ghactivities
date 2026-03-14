package events

type Event interface {
	GetCreatedAt() string
}

type Repository struct {
	Owner      string `json:"owner"`
	Name       string `json:"name"`
	Visibility string `json:"visibility"`
}

type IssueEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	Title      string     `json:"title"`
	URL        string     `json:"url"`
	Body       string     `json:"body"`
	Repository Repository `json:"repository"`
}

func (e IssueEvent) GetCreatedAt() string { return e.CreatedAt }

type IssueCommentEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	IssueTitle string     `json:"issueTitle"`
	IssueURL   string     `json:"issueUrl"`
	Body       string     `json:"body"`
	URL        string     `json:"url"`
	Repository Repository `json:"repository"`
}

func (e IssueCommentEvent) GetCreatedAt() string { return e.CreatedAt }

type DiscussionEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	Title      string     `json:"title"`
	URL        string     `json:"url"`
	Body       string     `json:"body"`
	Repository Repository `json:"repository"`
}

func (e DiscussionEvent) GetCreatedAt() string { return e.CreatedAt }

type DiscussionCommentEvent struct {
	Type            string     `json:"type"`
	CreatedAt       string     `json:"createdAt"`
	DiscussionTitle string     `json:"discussionTitle"`
	DiscussionURL   string     `json:"discussionUrl"`
	Body            string     `json:"body"`
	URL             string     `json:"url"`
	Repository      Repository `json:"repository"`
}

func (e DiscussionCommentEvent) GetCreatedAt() string { return e.CreatedAt }

type PullRequestEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	Title      string     `json:"title"`
	URL        string     `json:"url"`
	Body       string     `json:"body"`
	Repository Repository `json:"repository"`
}

func (e PullRequestEvent) GetCreatedAt() string { return e.CreatedAt }

type PullRequestCommentEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	PRTitle    string     `json:"prTitle"`
	PRURL      string     `json:"prUrl"`
	Body       string     `json:"body"`
	URL        string     `json:"url"`
	Repository Repository `json:"repository"`
}

func (e PullRequestCommentEvent) GetCreatedAt() string { return e.CreatedAt }

type CommitEvent struct {
	Type       string     `json:"type"`
	CreatedAt  string     `json:"createdAt"`
	Message    string     `json:"message"`
	URL        string     `json:"url"`
	OID        string     `json:"oid"`
	Repository Repository `json:"repository"`
}

func (e CommitEvent) GetCreatedAt() string { return e.CreatedAt }
