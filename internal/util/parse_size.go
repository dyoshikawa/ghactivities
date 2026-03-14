package util

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var sizePattern = regexp.MustCompile(`^(\d+(?:\.\d+)?)\s*([BKMG])$`)

var sizeUnits = map[string]float64{
	"B": 1,
	"K": 1024,
	"M": 1024 * 1024,
	"G": 1024 * 1024 * 1024,
}

func ParseSize(value string) (int, error) {
	trimmed := strings.TrimSpace(value)
	match := sizePattern.FindStringSubmatch(strings.ToUpper(trimmed))
	if match == nil {
		return 0, fmt.Errorf("invalid size format: %q", value)
	}

	number, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		return 0, fmt.Errorf("invalid size value: %q", value)
	}

	multiplier, ok := sizeUnits[match[2]]
	if !ok {
		return 0, fmt.Errorf("unknown size unit: %q", match[2])
	}

	return int(math.Floor(number * multiplier)), nil
}
