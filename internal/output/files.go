package output

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dyoshikawa/ghactivities/internal/events"
	"github.com/tiktoken-go/tokenizer"
)

type splitConstraints struct {
	maxLengthSize int
	maxTokens     int
	countTokens   func([]byte) (int, error)
}

func WriteEventsToFiles(items []events.Event, output string, maxLengthSize int, maxTokens int) ([]string, error) {
	constraints, err := newSplitConstraints(maxLengthSize, maxTokens)
	if err != nil {
		return nil, err
	}

	content, err := marshalEvents(items)
	if err != nil {
		return nil, err
	}

	fits, err := constraints.fits(content)
	if err != nil {
		return nil, err
	}

	if fits {
		if err := os.WriteFile(output, content, 0o644); err != nil {
			return nil, fmt.Errorf("write output file: %w", err)
		}
		return []string{output}, nil
	}

	return splitAndWriteFiles(items, output, constraints)
}

func splitAndWriteFiles(items []events.Event, output string, constraints splitConstraints) ([]string, error) {
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

		fits, err := constraints.fits(content)
		if err != nil {
			return nil, err
		}

		if fits {
			continue
		}

		if len(chunk) == 1 {
			if exceedsTokens, err := constraints.exceedsTokens(content); err != nil {
				return nil, err
			} else if exceedsTokens {
				return nil, fmt.Errorf("single event exceeds --max-tokens limit after JSON rendering")
			}

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
		if err := constraints.validateChunk(previousContent); err != nil {
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
		if err := constraints.validateChunk(content); err != nil {
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

func newSplitConstraints(maxLengthSize int, maxTokens int) (splitConstraints, error) {
	constraints := splitConstraints{
		maxLengthSize: maxLengthSize,
		maxTokens:     maxTokens,
	}

	if maxTokens <= 0 {
		return constraints, nil
	}

	codec, err := tokenizer.Get(tokenizer.O200kBase)
	if err != nil {
		return splitConstraints{}, fmt.Errorf("load tokenizer: %w", err)
	}

	constraints.countTokens = func(content []byte) (int, error) {
		count, err := codec.Count(string(content))
		if err != nil {
			return 0, fmt.Errorf("count rendered JSON tokens: %w", err)
		}
		return count, nil
	}

	return constraints, nil
}

func (constraints splitConstraints) fits(content []byte) (bool, error) {
	if len(content) > constraints.maxLengthSize {
		return false, nil
	}

	exceedsTokens, err := constraints.exceedsTokens(content)
	if err != nil {
		return false, err
	}

	return !exceedsTokens, nil
}

func (constraints splitConstraints) exceedsTokens(content []byte) (bool, error) {
	if constraints.maxTokens <= 0 {
		return false, nil
	}

	tokenCount, err := constraints.countTokens(content)
	if err != nil {
		return false, err
	}

	return tokenCount > constraints.maxTokens, nil
}

func (constraints splitConstraints) validateChunk(content []byte) error {
	exceedsTokens, err := constraints.exceedsTokens(content)
	if err != nil {
		return err
	}
	if exceedsTokens {
		return fmt.Errorf("single event exceeds --max-tokens limit after JSON rendering")
	}

	return nil
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
