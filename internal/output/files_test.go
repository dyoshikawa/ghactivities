package output

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/dyoshikawa/ghactivities/internal/events"
)

func TestWriteEventsToFilesSingleFile(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEvent(1)}

	files, err := WriteEventsToFiles(items, outputPath, 1024*1024)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if len(files) != 1 || files[0] != outputPath {
		t.Fatalf("files = %v, want [%s]", files, outputPath)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}

	var parsed []map[string]any
	if err := json.Unmarshal(content, &parsed); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if len(parsed) != 1 {
		t.Fatalf("len(parsed) = %d, want 1", len(parsed))
	}
}

func TestWriteEventsToFilesSplitsFiles(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEvent(1), makeIssueEvent(2), makeIssueEvent(3)}

	singleEvent, err := marshalEvents([]events.Event{makeIssueEvent(1)})
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}

	files, err := WriteEventsToFiles(items, outputPath, len(singleEvent)+10)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if len(files) < 2 {
		t.Fatalf("len(files) = %d, want at least 2", len(files))
	}
	if filepath.Base(files[0]) != "events_1.json" {
		t.Fatalf("first file = %q, want events_1.json", filepath.Base(files[0]))
	}
}

func TestWriteEventsToFilesEmptyArray(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")

	files, err := WriteEventsToFiles(nil, outputPath, 1024)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if len(files) != 1 || files[0] != outputPath {
		t.Fatalf("files = %v, want [%s]", files, outputPath)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	if string(content) != "[]" {
		t.Fatalf("content = %q, want []", string(content))
	}
}

func makeIssueEvent(id int) events.IssueEvent {
	return events.IssueEvent{
		Type:      "Issue",
		CreatedAt: "2024-01-01T00:00:00Z",
		Title:     "Issue",
		URL:       "https://github.com/owner/repo/issues/1",
		Body:      "Body",
		Repository: events.Repository{
			Owner:      "owner",
			Name:       "repo",
			Visibility: "PUBLIC",
		},
	}
}
