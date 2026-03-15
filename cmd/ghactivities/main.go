package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/dyoshikawa/ghactivities/internal/cli"
	gh "github.com/dyoshikawa/ghactivities/internal/github"
	"github.com/dyoshikawa/ghactivities/internal/output"
	"github.com/dyoshikawa/ghactivities/internal/util"
)

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout, os.Stderr, time.Now); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(
	ctx context.Context,
	argv []string,
	stdout *os.File,
	stderr *os.File,
	now func() time.Time,
) error {
	options, err := cli.ParseArgs(argv, now)
	if err != nil {
		if errors.Is(err, cli.ErrHelp) {
			_, writeErr := fmt.Fprint(stdout, cli.HelpText())
			if writeErr != nil {
				return writeErr
			}
			return nil
		}
		return fmt.Errorf("invalid arguments: %w", err)
	}

	token, err := util.ResolveGitHubToken(ctx, options.GitHubToken, os.Getenv, nil)
	if err != nil {
		return err
	}

	client := gh.NewClient(token, options.Since, options.Until, options.Visibility)
	events, err := client.FetchAllEvents(ctx)
	if err != nil {
		return err
	}

	sorted := util.SortEvents(events, options.Order)
	files, err := output.WriteEventsToFiles(sorted, options.Output, options.MaxLengthSize, options.MaxTokens)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(stdout, "Done! %d events collected. Written to %s\n", len(sorted), joinFiles(files))
	if err != nil {
		return err
	}

	_, _ = stderr.Write(nil)
	return nil
}

func joinFiles(files []string) string {
	if len(files) == 0 {
		return ""
	}

	result := files[0]
	for i := 1; i < len(files); i++ {
		result += ", " + files[i]
	}
	return result
}
