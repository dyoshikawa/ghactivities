package util

import (
	"context"
	"errors"
	"testing"
)

func TestResolveGitHubTokenExplicit(t *testing.T) {
	got, err := ResolveGitHubToken(context.Background(), "my-token", func(string) string { return "" }, nil)
	if err != nil {
		t.Fatalf("ResolveGitHubToken returned error: %v", err)
	}
	if got != "my-token" {
		t.Fatalf("token = %q, want %q", got, "my-token")
	}
}

func TestResolveGitHubTokenFromEnv(t *testing.T) {
	got, err := ResolveGitHubToken(context.Background(), "", func(key string) string {
		if key == "GITHUB_TOKEN" {
			return "env-token"
		}
		return ""
	}, nil)
	if err != nil {
		t.Fatalf("ResolveGitHubToken returned error: %v", err)
	}
	if got != "env-token" {
		t.Fatalf("token = %q, want %q", got, "env-token")
	}
}

func TestResolveGitHubTokenFallsBackToGH(t *testing.T) {
	got, err := ResolveGitHubToken(context.Background(), "", func(string) string { return "" }, func(context.Context, string, ...string) (string, error) {
		return "gh-token\n", nil
	})
	if err != nil {
		t.Fatalf("ResolveGitHubToken returned error: %v", err)
	}
	if got != "gh-token" {
		t.Fatalf("token = %q, want %q", got, "gh-token")
	}
}

func TestResolveGitHubTokenReturnsGHError(t *testing.T) {
	_, err := ResolveGitHubToken(context.Background(), "", func(string) string { return "" }, func(context.Context, string, ...string) (string, error) {
		return "", errors.New("command not found")
	})
	if err == nil {
		t.Fatal("ResolveGitHubToken returned nil error")
	}
}
