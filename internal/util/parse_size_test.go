package util

import "testing"

func TestParseSize(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    int
		wantErr bool
	}{
		{name: "bytes", input: "1B", want: 1},
		{name: "kilobytes", input: "2K", want: 2048},
		{name: "megabytes", input: "1M", want: 1024 * 1024},
		{name: "gigabytes", input: "1G", want: 1024 * 1024 * 1024},
		{name: "case insensitive", input: "1m", want: 1024 * 1024},
		{name: "decimal", input: "1.5M", want: int(1.5 * 1024 * 1024)},
		{name: "trim whitespace", input: "  1M  ", want: 1024 * 1024},
		{name: "invalid", input: "abc", wantErr: true},
		{name: "empty", input: "", wantErr: true},
		{name: "unknown unit", input: "1X", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseSize(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatal("ParseSize returned nil error")
				}
				return
			}

			if err != nil {
				t.Fatalf("ParseSize returned error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("ParseSize(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
