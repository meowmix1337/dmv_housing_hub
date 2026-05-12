package transform

import (
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

type SourceMeta struct {
	Name         string
	Cadence      types.Cadence
	LastUpdated  string
	Status       string // "ok" | "stale" | "error"
	LastVerified *string
}

func BuildManifest(sources []SourceMeta, generatedAt time.Time) types.Manifest {
	entries := make([]types.ManifestSourceEntry, 0, len(sources))
	for _, s := range sources {
		entries = append(entries, types.ManifestSourceEntry{
			Name:         s.Name,
			LastUpdated:  s.LastUpdated,
			Cadence:      s.Cadence,
			Status:       s.Status,
			LastVerified: s.LastVerified,
		})
	}
	return types.Manifest{
		GeneratedAt: generatedAt.UTC().Format(time.RFC3339),
		Sources:     entries,
	}
}

// CadenceFor returns the published cadence for each known source. Mirrors
// scripts/transform/build-county-pages.ts cadenceFor.
func CadenceFor(source string) types.Cadence {
	switch source {
	case "fred", "bls", "zillow":
		return types.CadenceMonthly
	case "census":
		return types.CadenceAnnual
	case "redfin":
		return types.CadenceWeekly
	case "qcew":
		return types.CadenceQuarterly
	}
	return types.CadenceMonthly
}
