package util

import (
	"testing"

	"github.com/dyoshikawa/ghactivities/internal/events"
)

func TestSortEvents(t *testing.T) {
	tests := []struct {
		name  string
		order string
		want  []string
	}{
		{name: "ascending", order: "asc", want: []string{"2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z", "2024-03-01T00:00:00Z"}},
		{name: "descending", order: "desc", want: []string{"2024-03-01T00:00:00Z", "2024-02-01T00:00:00Z", "2024-01-01T00:00:00Z"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items := []events.Event{
				makeSortableEvent("2024-03-01T00:00:00Z"),
				makeSortableEvent("2024-01-01T00:00:00Z"),
				makeSortableEvent("2024-02-01T00:00:00Z"),
			}

			sorted := SortEvents(items, tt.order)
			for i, want := range tt.want {
				if got := sorted[i].GetCreatedAt(); got != want {
					t.Fatalf("sorted[%d] = %q, want %q", i, got, want)
				}
			}
		})
	}
}

func TestSortEventsDoesNotMutateOriginalSlice(t *testing.T) {
	items := []events.Event{
		makeSortableEvent("2024-02-01T00:00:00Z"),
		makeSortableEvent("2024-01-01T00:00:00Z"),
	}
	originalFirst := items[0].GetCreatedAt()
	originalSecond := items[1].GetCreatedAt()

	_ = SortEvents(items, "asc")

	if items[0].GetCreatedAt() != originalFirst || items[1].GetCreatedAt() != originalSecond {
		t.Fatal("SortEvents mutated the original slice")
	}
}

func TestSortEventsEmptySlice(t *testing.T) {
	sorted := SortEvents(nil, "asc")
	if len(sorted) != 0 {
		t.Fatalf("len(sorted) = %d, want 0", len(sorted))
	}
}

func makeSortableEvent(createdAt string) events.IssueEvent {
	return events.IssueEvent{
		Type:      "Issue",
		CreatedAt: createdAt,
		Title:     "test",
		URL:       "https://example.com",
		Body:      "",
		Repository: events.Repository{
			Owner:      "owner",
			Name:       "repo",
			Visibility: "PUBLIC",
		},
	}
}
