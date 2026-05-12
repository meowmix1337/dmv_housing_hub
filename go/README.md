# go/

Go 1.26 implementation of the DMV Housing Hub ingest + transform pipeline.
Producer of the JSON files in `web/public/data/`. Runs in GitHub Actions
once per month; runs locally for development and ad-hoc reruns.

This pipeline replaces the Node/TypeScript pipeline that used to live in
`scripts/`. The handoff was end-to-end byte-equivalent — see
`docs/crispy/go-ingest-refactor/6-implement.md` for the slice-by-slice
cutover log.

## Prerequisites

- **Go 1.26+** (`go version` to check; `brew install go` on macOS).
- **API keys** in repo-root `.env` (see [`.env.example`](../.env.example)):
  - `FRED_API_KEY` — free at https://fred.stlouisfed.org/docs/api/api_key.html
  - `CENSUS_API_KEY` — free at https://api.census.gov/data/key_signup.html
  - `BLS_API_KEY` — free at https://data.bls.gov/registrationEngine/

Commands in `go/cmd/*/main.go` load the `.env` file at repo root via
`godotenv.Load("../.env", ".env")`, so running from the `go/` directory
(or from the Makefile, which `cd`s into `go/`) picks up keys automatically.

## Layout

```
go/
├── cmd/                          # binaries (one main.go each)
│   ├── ingest-all/               # run every source sequentially
│   ├── ingest-{fred,census,bls,qcew,zillow,redfin}/   # one source each
│   ├── transform/                # cache → per-county JSON + DMV aggregates
│   └── check-bundle-size/        # gate web/dist/assets/*.js gzipped size
├── internal/
│   ├── types/                    # hand-mirror of shared/src/types.ts
│   ├── log/                      # slog wrapper (TTY-aware handler)
│   ├── http/                     # retry-go-backed client
│   ├── storage/                  # atomic temp-then-rename writer
│   ├── counties/                 # static 21-county DMV list
│   ├── ingest/                   # DataSource interface + per-source ports
│   │   ├── datasource.go
│   │   ├── fred/                 # FRED series fetcher
│   │   ├── census/               # Census ACS 5-year
│   │   ├── bls/                  # BLS LAUS + MSA federal employment
│   │   ├── qcew/                 # BLS QCEW federal county employment
│   │   ├── zillow/               # ZHVI/ZORI wide CSV transposer
│   │   └── redfin/               # streaming gzipped TSV (~226 MB)
│   └── transform/                # join + DMV aggregates + affordability/marketHealth
└── .cache/                       # raw IngestResult per source (gitignored)
```

## Running locally

From repo root, use the Makefile:

```bash
make ingest         # ~3 min: hits every upstream; writes go/.cache/*.json
make transform      # ~1 s: reads go/.cache/, writes web/public/data/
make web            # vite build → web/dist/
make check-bundle-size   # gates web/dist/assets/*.js to ≤ 500 kB gz
make test           # go test ./... + npm test
```

Or call binaries directly from `go/`:

```bash
cd go
go run ./cmd/ingest-fred       # one source
go run ./cmd/ingest-all        # all sources, sequential, collected errors
go run ./cmd/transform         # writes ../web/public/data/
go test ./...
golangci-lint run ./...
```

`OUT_DATA_DIR=/tmp/foo go run ./cmd/transform` writes elsewhere — handy
when comparing two transform runs without clobbering committed data.

## Key design decisions

- **No backend, no DB, no auth** — same constraints as the rest of the
  project (see `../ARCHITECTURE.md`). The pipeline is a batch job that
  produces static JSON; the SPA fetches that JSON directly.
- **One Go module under `go/`**, not at repo root. Keeps the Node/Vite
  tree at repo root unchanged and isolates Go tooling.
- **Source-of-truth types in `shared/`**: `internal/types/types.go`
  hand-mirrors `shared/src/types.ts`; a contract test round-trips a
  real county JSON to catch drift.
- **`MaybeFloat`** custom (un)marshaller handles FRED's `"."` sentinel,
  null, and number-or-string-encoded numerics in one type.
- **Retry-After honored**: `internal/http` parses both numeric seconds
  and HTTP-date forms; non-retryable 4xx (except 408/429) fail fast.
- **Redfin streams** through `gzip.NewReader` → `bufio.Scanner` (1 MB
  initial, 32 MB max buffer). Hot-path filtering avoids allocating
  per-field slices until a row clears the DMV state-code + duration +
  region-type + property-type gates. Peak RSS on the real ~226 MB
  download is ~200 MB.
- **Cross-language FP parity**: `internal/transform/affordability.go`
  uses `math.Exp(n*math.Log(1+r))` instead of `math.Pow(1+r, n)` to match
  V8's `Math.pow` algorithm in the last ULP (Go's `math.Pow` takes a
  fast integer-exponent path that diverges from V8 at the 14th
  significant digit on this input). Without this, every county's
  `affordabilityIndex` differed from the TS pipeline by ~1e-13.

## Adding a new ingester

1. Add a package under `internal/ingest/{source}/` implementing
   `DataSource` (`Name`, `Cadence`, `Fetch(ctx)`).
2. Add a `cmd/ingest-{source}/main.go` that mirrors any of the existing
   `cmd/ingest-*` shapes — load env, run, write
   `IngestResult` to `.cache/{source}.json`.
3. Register the new source in `cmd/ingest-all/main.go` and add a
   constant to the `knownSources` list in `cmd/transform/main.go` so the
   transform loads its cache and includes it in the manifest.
4. Add a fixture under `internal/ingest/{source}/testdata/` and a
   parse-from-fixture test plus an `httptest` end-to-end test.
5. Verify with `diff <(jq -S '.observations | sort_by(.fips, .series, .observedAt)' …)` against the TS pipeline (while `scripts/` still exists) or against a checked-in golden once TS is gone.
