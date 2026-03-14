package util

import (
	"testing"
	"time"
)

func TestSplitDateRangeIntoYearPeriods(t *testing.T) {
	tests := []struct {
		name  string
		since string
		until string
		want  []DateRange
	}{
		{
			name:  "single range shorter than a year",
			since: "2024-01-01T00:00:00Z",
			until: "2024-06-01T00:00:00Z",
			want: []DateRange{{
				Since: mustTime("2024-01-01T00:00:00Z"),
				Until: mustTime("2024-06-01T00:00:00Z"),
			}},
		},
		{
			name:  "multiple year periods",
			since: "2022-06-15T00:00:00Z",
			until: "2024-09-20T00:00:00Z",
			want: []DateRange{
				{Since: mustTime("2022-06-15T00:00:00Z"), Until: mustTime("2023-06-15T00:00:00Z")},
				{Since: mustTime("2023-06-15T00:00:00Z"), Until: mustTime("2024-06-15T00:00:00Z")},
				{Since: mustTime("2024-06-15T00:00:00Z"), Until: mustTime("2024-09-20T00:00:00Z")},
			},
		},
		{
			name:  "equal dates returns empty",
			since: "2024-01-01T00:00:00Z",
			until: "2024-01-01T00:00:00Z",
			want:  nil,
		},
		{
			name:  "exactly one year",
			since: "2024-01-01T00:00:00Z",
			until: "2025-01-01T00:00:00Z",
			want: []DateRange{{
				Since: mustTime("2024-01-01T00:00:00Z"),
				Until: mustTime("2025-01-01T00:00:00Z"),
			}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SplitDateRangeIntoYearPeriods(DateRange{Since: mustTime(tt.since), Until: mustTime(tt.until)})
			if len(got) != len(tt.want) {
				t.Fatalf("len(got) = %d, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if !got[i].Since.Equal(tt.want[i].Since) || !got[i].Until.Equal(tt.want[i].Until) {
					t.Fatalf("got[%d] = %+v, want %+v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func mustTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		panic(err)
	}
	return parsed.UTC()
}
