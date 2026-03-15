package output

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dyoshikawa/ghactivities/internal/events"
)

func WriteEventsToFiles(items []events.Event, output string, maxLengthSize int) ([]string, error) {
	content, err := marshalEvents(items)
	if err != nil {
		return nil, err
	}

	if len(content) <= maxLengthSize {
		if err := os.WriteFile(output, content, 0o644); err != nil {
			return nil, fmt.Errorf("write output file: %w", err)
		}
		return []string{output}, nil
	}

	return splitAndWriteFiles(items, output, maxLengthSize)
}

func splitAndWriteFiles(items []events.Event, output string, maxLengthSize int) ([]string, error) {
	dir := filepath.Dir(output)
	ext := filepath.Ext(output)
	base := strings.TrimSuffix(filepath.Base(output), ext)

	files := make([]string, 0)
	chunk := make([]events.Event, 0)
	fileIndex := 1

	for _, item := range items {
		chunk = append(chunk, item)
		content, err := marshalEvents(chunk)
		if err != nil {
			return nil, err
		}

		if len(content) <= maxLengthSize {
			continue
		}

		if len(chunk) == 1 {
			path := numberedPath(dir, base, ext, fileIndex)
			if err := os.WriteFile(path, content, 0o644); err != nil {
				return nil, fmt.Errorf("write output file: %w", err)
			}
			files = append(files, path)
			fileIndex++
			chunk = chunk[:0]
			continue
		}

		chunk = chunk[:len(chunk)-1]
		previousContent, err := marshalEvents(chunk)
		if err != nil {
			return nil, err
		}

		path := numberedPath(dir, base, ext, fileIndex)
		if err := os.WriteFile(path, previousContent, 0o644); err != nil {
			return nil, fmt.Errorf("write output file: %w", err)
		}
		files = append(files, path)
		fileIndex++
		chunk = []events.Event{item}
	}

	if len(chunk) > 0 {
		content, err := marshalEvents(chunk)
		if err != nil {
			return nil, err
		}
		path := numberedPath(dir, base, ext, fileIndex)
		if err := os.WriteFile(path, content, 0o644); err != nil {
			return nil, fmt.Errorf("write output file: %w", err)
		}
		files = append(files, path)
	}

	return files, nil
}

func numberedPath(dir string, base string, ext string, index int) string {
	return filepath.Join(dir, fmt.Sprintf("%s_%d%s", base, index, ext))
}

func marshalEvents(items []events.Event) ([]byte, error) {
	if items == nil {
		items = []events.Event{}
	}

	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(items); err != nil {
		return nil, fmt.Errorf("encode events JSON: %w", err)
	}

	content := buffer.Bytes()
	if len(content) > 0 && content[len(content)-1] == '\n' {
		content = content[:len(content)-1]
	}
	return content, nil
}
