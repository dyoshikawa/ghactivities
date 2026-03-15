package output

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/dyoshikawa/ghactivities/internal/events"
	"github.com/tiktoken-go/tokenizer"
)

func TestWriteEventsToFilesSingleFile(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEvent(1)}

	files, err := WriteEventsToFiles(items, outputPath, 1024*1024, 0)
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

	files, err := WriteEventsToFiles(items, outputPath, len(singleEvent)+10, 0)
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

	files, err := WriteEventsToFiles(nil, outputPath, 1024, 0)
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

func TestWriteEventsToFilesSplitsByMaxTokens(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEventWithBody(1, "alpha alpha alpha"), makeIssueEventWithBody(2, "beta beta beta"), makeIssueEventWithBody(3, "gamma gamma gamma")}

	codec, err := tokenizer.Get(tokenizer.O200kBase)
	if err != nil {
		t.Fatalf("tokenizer.Get returned error: %v", err)
	}

	firstTwo, err := marshalEvents(items[:2])
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}
	firstTwoTokens, err := codec.Count(string(firstTwo))
	if err != nil {
		t.Fatalf("codec.Count returned error: %v", err)
	}

	oneEvent, err := marshalEvents(items[:1])
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}
	oneEventTokens, err := codec.Count(string(oneEvent))
	if err != nil {
		t.Fatalf("codec.Count returned error: %v", err)
	}

	if firstTwoTokens <= oneEventTokens {
		t.Fatalf("firstTwoTokens = %d, want > %d", firstTwoTokens, oneEventTokens)
	}

	files, err := WriteEventsToFiles(items, outputPath, 1024*1024, firstTwoTokens-1)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if got, want := len(files), 3; got != want {
		t.Fatalf("len(files) = %d, want %d", got, want)
	}

	for i, path := range files {
		if got, want := filepath.Base(path), filepath.Base(numberedPath(tempDir, "events", ".json", i+1)); got != want {
			t.Fatalf("file %d = %q, want %q", i, got, want)
		}

		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile returned error: %v", err)
		}

		tokenCount, err := codec.Count(string(content))
		if err != nil {
			t.Fatalf("codec.Count returned error: %v", err)
		}
		if tokenCount > firstTwoTokens-1 {
			t.Fatalf("tokenCount = %d, want <= %d", tokenCount, firstTwoTokens-1)
		}

		parsed := readIssueNumbers(t, content)
		if !reflect.DeepEqual(parsed, []float64{float64(i + 1)}) {
			t.Fatalf("parsed ids = %v, want [%d]", parsed, i+1)
		}
	}
}

func TestWriteEventsToFilesUsesStricterOfSizeAndTokenLimits(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEventWithBody(1, "body 1"), makeIssueEventWithBody(2, "body 2"), makeIssueEventWithBody(3, "body 3")}

	singleEvent, err := marshalEvents(items[:1])
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}

	allEvents, err := marshalEvents(items)
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}

	files, err := WriteEventsToFiles(items, outputPath, len(singleEvent)+10, 100000)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if got, want := len(files), 3; got != want {
		t.Fatalf("len(files) = %d, want %d", got, want)
	}

	unsplitPath := filepath.Join(tempDir, "unsplit.json")
	unsplitFiles, err := WriteEventsToFiles(items, unsplitPath, len(allEvents)+10, 100000)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}
	if got, want := len(unsplitFiles), 1; got != want {
		t.Fatalf("len(unsplitFiles) = %d, want %d", got, want)
	}
}

func TestWriteEventsToFilesKeepsOrderedChunksWhenTokenSplitting(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{
		makeIssueEventWithBody(1, "short body"),
		makeIssueEventWithBody(2, "this body is much longer than the first event body and should force a split after the first chunk"),
		makeIssueEventWithBody(3, "tiny"),
	}

	codec, err := tokenizer.Get(tokenizer.O200kBase)
	if err != nil {
		t.Fatalf("tokenizer.Get returned error: %v", err)
	}

	firstTwo, err := marshalEvents(items[:2])
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}
	firstTwoTokens, err := codec.Count(string(firstTwo))
	if err != nil {
		t.Fatalf("codec.Count returned error: %v", err)
	}

	files, err := WriteEventsToFiles(items, outputPath, 1024*1024, firstTwoTokens-1)
	if err != nil {
		t.Fatalf("WriteEventsToFiles returned error: %v", err)
	}

	if got, want := len(files), 2; got != want {
		t.Fatalf("len(files) = %d, want %d", got, want)
	}

	firstContent, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	secondContent, err := os.ReadFile(files[1])
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}

	if got := readIssueNumbers(t, firstContent); !reflect.DeepEqual(got, []float64{1}) {
		t.Fatalf("first file ids = %v, want [1]", got)
	}
	if got := readIssueNumbers(t, secondContent); !reflect.DeepEqual(got, []float64{2, 3}) {
		t.Fatalf("second file ids = %v, want [2 3]", got)
	}
}

func TestWriteEventsToFilesRejectsSingleEventOverTokenLimit(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "events.json")
	items := []events.Event{makeIssueEventWithBody(1, strings.Repeat("token-heavy body ", 100))}

	codec, err := tokenizer.Get(tokenizer.O200kBase)
	if err != nil {
		t.Fatalf("tokenizer.Get returned error: %v", err)
	}

	content, err := marshalEvents(items)
	if err != nil {
		t.Fatalf("marshalEvents returned error: %v", err)
	}
	tokenCount, err := codec.Count(string(content))
	if err != nil {
		t.Fatalf("codec.Count returned error: %v", err)
	}

	_, err = WriteEventsToFiles(items, outputPath, len(content)+10, tokenCount-1)
	if err == nil {
		t.Fatal("WriteEventsToFiles returned nil error")
	}
	if !strings.Contains(err.Error(), "single event exceeds --max-tokens") {
		t.Fatalf("error = %v, want token limit error", err)
	}
}

func makeIssueEvent(id int) events.IssueEvent {
	return makeIssueEventWithBody(id, "Body")
}

func makeIssueEventWithBody(id int, body string) events.IssueEvent {
	return events.IssueEvent{
		Type:      "Issue",
		CreatedAt: "2024-01-01T00:00:00Z",
		Title:     "Issue",
		URL:       "https://github.com/owner/repo/issues/" + strconv.Itoa(id),
		Body:      body,
		Repository: events.Repository{
			Owner:      "owner",
			Name:       "repo",
			Visibility: "PUBLIC",
		},
	}
}

func readIssueNumbers(t *testing.T, content []byte) []float64 {
	t.Helper()

	var parsed []map[string]any
	if err := json.Unmarshal(content, &parsed); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	ids := make([]float64, 0, len(parsed))
	for _, item := range parsed {
		urlValue, ok := item["url"].(string)
		if !ok {
			t.Fatalf("url field = %T, want string", item["url"])
		}
		ids = append(ids, float64(urlValue[len(urlValue)-1]-'0'))
	}

	return ids
}
