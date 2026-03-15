package cli

import (
	"errors"
	"testing"
	"time"
)

func TestParseArgsParsesAllOptions(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC) }

	result, err := ParseArgs([]string{
		"--github-token", "my-token",
		"--output", "./out.json",
		"--since", "2024-01-01T00:00:00Z",
		"--until", "2024-06-01T00:00:00Z",
		"--visibility", "all",
		"--max-length-size", "2M",
		"--order", "desc",
	}, now)
	if err != nil {
		t.Fatalf("ParseArgs returned error: %v", err)
	}

	if result.GitHubToken != "my-token" {
		t.Fatalf("GitHubToken = %q, want %q", result.GitHubToken, "my-token")
	}
	if result.Output != "./out.json" {
		t.Fatalf("Output = %q, want %q", result.Output, "./out.json")
	}
	if got, want := result.Since.Format(time.RFC3339Nano), "2024-01-01T00:00:00Z"; got != want {
		t.Fatalf("Since = %q, want %q", got, want)
	}
	if got, want := result.Until.Format(time.RFC3339Nano), "2024-06-01T00:00:00Z"; got != want {
		t.Fatalf("Until = %q, want %q", got, want)
	}
	if result.Visibility != "all" {
		t.Fatalf("Visibility = %q, want %q", result.Visibility, "all")
	}
	if result.MaxLengthSize != 2*1024*1024 {
		t.Fatalf("MaxLengthSize = %d, want %d", result.MaxLengthSize, 2*1024*1024)
	}
	if result.Order != "desc" {
		t.Fatalf("Order = %q, want %q", result.Order, "desc")
	}
}

func TestParseArgsUsesDefaults(t *testing.T) {
	fixedNow := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	result, err := ParseArgs(nil, func() time.Time { return fixedNow })
	if err != nil {
		t.Fatalf("ParseArgs returned error: %v", err)
	}

	if result.Output != "./ghactivities.json" {
		t.Fatalf("Output = %q, want %q", result.Output, "./ghactivities.json")
	}
	if result.Visibility != "public" {
		t.Fatalf("Visibility = %q, want %q", result.Visibility, "public")
	}
	if result.MaxLengthSize != 1024*1024 {
		t.Fatalf("MaxLengthSize = %d, want %d", result.MaxLengthSize, 1024*1024)
	}
	if result.Order != "asc" {
		t.Fatalf("Order = %q, want %q", result.Order, "asc")
	}
	if got, want := result.Since, fixedNow.AddDate(0, 0, -14); !got.Equal(want) {
		t.Fatalf("Since = %s, want %s", got, want)
	}
	if got, want := result.Until, fixedNow; !got.Equal(want) {
		t.Fatalf("Until = %s, want %s", got, want)
	}
}

func TestParseArgsRejectsInvalidValues(t *testing.T) {
	now := func() time.Time { return time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC) }

	tests := []struct {
		name string
		argv []string
	}{
		{name: "visibility", argv: []string{"--visibility", "invalid"}},
		{name: "order", argv: []string{"--order", "random"}},
		{name: "since", argv: []string{"--since", "not-a-date"}},
		{name: "size", argv: []string{"--max-length-size", "abc"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ParseArgs(tt.argv, now); err == nil {
				t.Fatal("ParseArgs returned nil error")
			}
		})
	}
}

func TestParseArgsHelp(t *testing.T) {
	_, err := ParseArgs([]string{"--help"}, time.Now)
	if !errors.Is(err, ErrHelp) {
		t.Fatalf("error = %v, want ErrHelp", err)
	}
}
