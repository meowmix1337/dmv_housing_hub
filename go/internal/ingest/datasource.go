// Package ingest defines the DataSource interface that every per-source
// ingester implements. cmd/ingest-* wrap one implementation each.
package ingest

import (
	"context"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

type DataSource interface {
	Name() string
	Cadence() types.Cadence
	Fetch(ctx context.Context) ([]types.Observation, error)
}
