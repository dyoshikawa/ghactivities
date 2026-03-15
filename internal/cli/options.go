package cli

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/dyoshikawa/ghactivities/internal/util"
)

var ErrHelp = errors.New("help requested")

type Options struct {
	GitHubToken   string
	Output        string
	Since         time.Time
	Until         time.Time
	Visibility    string
	MaxLengthSize int
	Order         string
}

func ParseArgs(argv []string, now func() time.Time) (Options, error) {
	defaults := defaultOptions(now)
	fs := flag.NewFlagSet("ghactivities", flag.ContinueOnError)
	fs.SetOutput(io.Discard)

	githubToken := fs.String("github-token", defaults.GitHubToken, "GitHub access token")
	output := fs.String("output", defaults.Output, "Output file path")
	since := fs.String("since", defaults.Since.Format(time.RFC3339Nano), "Start date in ISO8601 format")
	until := fs.String("until", defaults.Until.Format(time.RFC3339Nano), "End date in ISO8601 format")
	visibility := fs.String("visibility", defaults.Visibility, "Repository visibility")
	maxLengthSize := fs.String("max-length-size", fmt.Sprintf("%dB", defaults.MaxLengthSize), "Max output file size")
	order := fs.String("order", defaults.Order, "Event order")
	help := fs.Bool("help", false, "Show help")

	if err := fs.Parse(argv); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return Options{}, ErrHelp
		}
		return Options{}, err
	}

	if *help {
		return Options{}, ErrHelp
	}

	parsedSince, err := parseISO8601(*since, "--since")
	if err != nil {
		return Options{}, err
	}

	parsedUntil, err := parseISO8601(*until, "--until")
	if err != nil {
		return Options{}, err
	}

	if !isOneOf(*visibility, "public", "private", "all") {
		return Options{}, fmt.Errorf("invalid value for --visibility: %q", *visibility)
	}

	if !isOneOf(*order, "asc", "desc") {
		return Options{}, fmt.Errorf("invalid value for --order: %q", *order)
	}

	parsedSize, err := util.ParseSize(*maxLengthSize)
	if err != nil {
		return Options{}, fmt.Errorf("invalid value for --max-length-size: %w", err)
	}

	return Options{
		GitHubToken:   *githubToken,
		Output:        *output,
		Since:         parsedSince,
		Until:         parsedUntil,
		Visibility:    *visibility,
		MaxLengthSize: parsedSize,
		Order:         *order,
	}, nil
}

func HelpText() string {
	return strings.TrimLeft(`Usage: ghactivities [options]

Options:
  --github-token      GitHub access token (env: GITHUB_TOKEN or "gh auth token")
  --output            Output file path (default: ./ghactivities.json)
  --since             Start date in ISO8601 format (default: 2 weeks ago)
  --until             End date in ISO8601 format (default: now)
  --visibility        Repository visibility: public, private, all (default: public)
  --max-length-size   Max output file size: e.g. 1B, 2K, 2M (default: 1M)
  --order             Event order: asc, desc (default: asc)
  --help              Show this help message
`, "\n")
}

func defaultOptions(now func() time.Time) Options {
	current := now().UTC()
	return Options{
		Output:        "./ghactivities.json",
		Since:         current.AddDate(0, 0, -14),
		Until:         current,
		Visibility:    "public",
		MaxLengthSize: 1024 * 1024,
		Order:         "asc",
	}
}

func parseISO8601(value string, name string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid ISO8601 date format for %s", name)
	}
	return parsed.UTC(), nil
}

func isOneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
