package util

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

type TokenRunner func(ctx context.Context, name string, args ...string) (string, error)

func ResolveGitHubToken(
	ctx context.Context,
	explicitToken string,
	getenv func(string) string,
	runner TokenRunner,
) (string, error) {
	if explicitToken != "" {
		return explicitToken, nil
	}

	if getenv != nil {
		if envToken := getenv("GITHUB_TOKEN"); envToken != "" {
			return envToken, nil
		}
	}

	if runner == nil {
		runner = defaultTokenRunner
	}

	token, err := runner(ctx, "gh", "auth", "token")
	if err != nil {
		return "", fmt.Errorf("failed to get GitHub token from \"gh auth token\": %w", err)
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return "", fmt.Errorf("no token returned from \"gh auth token\"")
	}

	return token, nil
}

func defaultTokenRunner(ctx context.Context, name string, args ...string) (string, error) {
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("%s", message)
	}
	return string(output), nil
}
