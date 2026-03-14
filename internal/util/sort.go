package util

import (
	"slices"
	"sort"
	"time"

	"github.com/dyoshikawa/ghevents/internal/events"
)

func SortEvents(items []events.Event, order string) []events.Event {
	cloned := slices.Clone(items)
	sort.SliceStable(cloned, func(i int, j int) bool {
		left := parseEventTime(cloned[i].GetCreatedAt())
		right := parseEventTime(cloned[j].GetCreatedAt())
		if order == "desc" {
			return right.Before(left)
		}
		return left.Before(right)
	})
	return cloned
}

func parseEventTime(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}
	}
	return parsed.UTC()
}
