package util

import "time"

type DateRange struct {
	Since time.Time
	Until time.Time
}

func SplitDateRangeIntoYearPeriods(dateRange DateRange) []DateRange {
	since := dateRange.Since.UTC()
	until := dateRange.Until.UTC()
	if !since.Before(until) {
		return nil
	}

	ranges := make([]DateRange, 0)
	current := since
	for current.Before(until) {
		yearLater := current.AddDate(1, 0, 0)
		end := yearLater
		if end.After(until) {
			end = until
		}
		ranges = append(ranges, DateRange{Since: current, Until: end})
		current = end
	}

	return ranges
}
