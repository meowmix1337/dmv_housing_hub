# Research

## Current execution shape

### Q1. Execution order in `go/cmd/ingest-all` and parallel-eligibility of source pairs

`go/cmd/ingest-all/main.go:55-62` constructs the source slice in fixed order and runs each one to completion sequentially before starting the next:

```go
sources := []ingest.DataSource{
    fred.New(fred.Config{APIKey: cfg.FREDAPIKey}, apiClient),
    census.New(census.Config{APIKey: cfg.CensusAPIKey}, apiClient),
    bls.New(bls.Config{APIKey: cfg.BLSAPIKey}, apiClient),
    qcew.New(apiClient),
    zillow.New(httpclient.New(httpclient.Options{Timeout: 120 * time.Second, MaxRetries: 3})),
    redfin.New(bigClient),
}

var errs []error
for _, src := range sources {
    if err := runOne(ctx, src, logger); err != nil {
        errs = append(errs, fmt.Errorf("%s: %w", src.Name(), err))
    }
}
```

Order: `fred → census → bls → qcew → zillow → redfin`.

Per-source state observable from the source code:

- Each `*Source` struct (`fred.Source`, `census.Source`, …) holds only an `*httpclient.Client`, a `*slog.Logger`, configuration, and a `baseURL`/`url` override hook for tests. None of the six structs holds mutable shared state between sources.
- `runOne` (`go/cmd/ingest-all/main.go:82-116`) collects each source's observations into its own `types.IngestResult` and writes to its own cache path `.cache/{src.Name()}.json` via `storage.WriteJSON`. Cache paths are disjoint (`fred.json`, `census.json`, `bls.json`, `qcew.json`, `zillow.json`, `redfin.json`).
- `storage.AtomicWrite` (`go/internal/storage/atomic.go:14-39`) creates a same-directory temp file and `os.Rename`s it into place; no shared lock; one file per source.
- The shared HTTP client (`apiClient`) is wired into FRED, Census, BLS, and QCEW; Zillow and Redfin each receive their own `httpclient.Client` instance. `httpclient.Client` wraps `&http.Client{Timeout: opts.Timeout}` (`go/internal/http/client.go:48`) — no per-host limiter or semaphore is configured by the code.
- The hostnames the sources hit are all different except for the two BLS sources:
  - FRED → `api.stlouisfed.org`
  - Census → `api.census.gov`
  - BLS LAUS/CES → `api.bls.gov`
  - QCEW → `data.bls.gov`
  - Zillow → `files.zillowstatic.com`
  - Redfin → `redfin-public-data.s3.us-west-2.amazonaws.com`

  BLS LAUS/CES and QCEW share the `bls.gov` parent domain but use different subdomains (`api.bls.gov` vs `data.bls.gov`); the codebase does not document whether BLS treats these as a single rate-limited tenant.

No `sync` primitive is shared between sources in `ingest-all`. The only `sync` in the ingest tree lives in `qcew/qcew.go` (its internal worker pool).

### Q2. Outbound HTTP request shape per `Fetch(ctx)`

- **FRED** (`go/internal/ingest/fred/fred.go:101-148`): one `GET /fred/series/observations?series_id=…` per series. `series` list contains: 2 national + 3 state series (issued once each, no sleep) and 2 county-scope series patterns (`ATNHPIUS{FIPS}A`, `HOSCCOUNTY{FIPS}`, `MELIPRCOUNTY{FIPS}`) — wait, the slice has 3 county specs (one ATNHPIUS, one HOSCCOUNTY, one MELIPRCOUNTY) issued for each county in `counties.All()`. `counties.All()` (`go/internal/counties/counties.go:16-43`) lists 21 counties. So per `Fetch`: 2 + 3 + 3×21 = **68 sequential GETs**, with a 600 ms `sleepCtx` between *every* county-scoped GET (`fred.go:140-142`). Note the sleep also fires when the series failed (the warn/skip path), keeping the call rate constant.

- **Census** (`go/internal/ingest/census/census.go:80-121`): one `GET /data/2024/acs/acs5?…` per `stateGroup`. `stateGroups` (lines 51-55) defines 3 groups (DC `county:001`, MD `county:*`, VA `county:*`). Total: **3 sequential GETs**, fan-out by-state. Each call returns a 2-D JSON array of every county in that state.

- **BLS** (`go/internal/ingest/bls/bls.go:116-153`): one `POST /publicAPI/v2/timeseries/data/` carrying all DMV-county LAUS series + the MSA federal series. `buildSeriesMeta` (lines 80-95) builds `len(counties.All())+1 = 22` series IDs, sent as a single JSON-body batch. Total: **1 POST per `Fetch`**.

- **QCEW** (`go/internal/ingest/qcew/qcew.go:69-137`): one `GET https://data.bls.gov/cew/data/api/{year}/{qtr}/area/{fips}.csv` per `(fips, year, qtr)` triple. Task count = `len(counties) × num_quarters_from_2015_to_current`. With 21 counties and ≈44 quarters (2015 Q1 through 2025 Q4 / mid-2026 Q2 depending on `s.now()`), this is **roughly 900–950 GETs per Fetch**. Issued via a goroutine worker pool with `concurrency = 4`.

- **Zillow** (`go/internal/ingest/zillow/zillow.go:97-121`): one `GET` per file in `DefaultFiles()`. The default list (`zillow.go:43-51`) has 5 files (3 county ZHVI variants, 1 county ZORI, 1 metro ZHVI). Total: **5 sequential GETs per Fetch**.

- **Redfin** (`go/internal/ingest/redfin/redfin.go:104-124`): a single `GET https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz`, streamed through `gzip.NewReader` → `bufio.Scanner`. Total: **1 streaming GET per Fetch**.

### Q3. Goroutines / in-process parallelism today

`grep -rn "go func\|sync\.\|errgroup" go/internal/ingest go/cmd` returns:

```
go/internal/ingest/qcew/qcew.go:90:  var mu sync.Mutex
go/internal/ingest/qcew/qcew.go:91:  var wg sync.WaitGroup
go/internal/ingest/qcew/qcew.go:93:  var errOnce sync.Once
go/internal/ingest/qcew/qcew.go:101:    go func() {
```

QCEW is the only package using goroutines. The pattern (`qcew.go:88-127`):

- `results := make([]*types.Observation, len(tasks))` — pre-allocated index-keyed result slice (preserves task order in the output).
- A monotonically-increasing `nextIdx` guarded by `sync.Mutex` hands out task indices (no buffered channel).
- `workerN := concurrency` (constant `concurrency = 4`, `qcew.go:29`); bounded down to `len(tasks)` if fewer.
- Per-task error: first error wins via `sync.Once` storing into `fatalErr`; on error, the worker returns. `ctx.Err()` is checked each iteration (line 111) — but other workers continue draining until each independently sees the cancelled context.
- A 404 is downgraded to a warn-and-skip inside `fetchOne` (`qcew.go:144-149`); only non-404 errors escalate.

No `errgroup`, no `golang.org/x/sync/semaphore`, no buffered channel fan-out, no `errors.Join` use inside an ingester. `errors.Join` appears once, in `ingest-all/main.go:76`, but only for documentation — the comment notes it is unused.

`internal/http.Client` itself contains no goroutine spawning; concurrency, if any, comes from the caller.

### Q4. Wall-clock duration on `ubuntu-latest`

Not recorded in the repository. The workflow file (`.github/workflows/ingest.yml`) emits no per-step timing; the GitHub Actions run-history is the only source. The Go pipeline does emit per-source `durationMs` into each `.cache/{source}.json`:

```go
result := types.IngestResult{
    Source:       src.Name(),
    StartedAt:    startedAt.Format(time.RFC3339Nano),
    FinishedAt:   finishedAt.Format(time.RFC3339Nano),
    DurationMs:   finishedAt.Sub(startedAt).Milliseconds(),
    ...
}
```

(`go/cmd/ingest-all/main.go:96-103`). These values are in the committed `.cache/*.json` if recently run locally — `ls go/.cache/` lists `bls.json census.json fred.json qcew.json redfin.json zillow.json` — but the on-runner total has not been transcribed into `docs/`.

What can be computed from code alone (lower bound, assuming zero network latency):

- FRED's 21×3 = 63 county-scoped GETs each followed by 600 ms `sleepCtx` ⇒ a **floor of ~37.8 s** of intentional sleep per Fetch.
- The other ingesters carry no built-in sleeps.

Wall-clock for QCEW depends on per-CSV latency × 950/4 ≈ 238 sequential equivalents; for Redfin it is dominated by the ~226 MB gzipped download (`6-implement.md:160` calls the stream "~226 MB gzipped" — file size of upstream); for Zillow by 5 CSV downloads of varying size.

## Upstream rate limits and concurrent-request behavior

### Q5. Documented / observed rate limits per endpoint

From `DATA_SOURCES.md`:

- **FRED `/series/observations`**: "Rate limit: 120 req/min per key" (`DATA_SOURCES.md:13`). The `fred.go:22-23` comment cross-references this: "600 ms inter-call sleep on county series to stay under FRED's 120 req/min limit." 600 ms ⇒ 100 req/min, leaving headroom.
- **BLS `/timeseries/data/`**: "Rate limit: 500 queries/day with key (25 without)" and "Up to 50 series per request with key" (`DATA_SOURCES.md:118,145`). One call per Fetch uses well under the daily ceiling; the per-batch series cap is 50 — the current batch is 22 (one per county + 1 federal MSA), under the limit.
- **Census ACS**: `DATA_SOURCES.md` (§2) lists base URL and key but does **not** document a numeric rate limit. (Census documents "no key — 500 queries/day; with key — none stated" externally; the repo does not assert a number.)
- **BLS QCEW per-area CSVs (`data.bls.gov/cew/data/api/…`)**: no documented rate limit in this repo. The `qcew.go` comment block (lines 1-4) only describes the row-selection contract. `qcew.go:29` hardcodes `concurrency = 4` with no cited justification in code.
- **Zillow Research static CSVs (`files.zillowstatic.com`)**: no documented rate limit in this repo. `DATA_SOURCES.md:173` warns only that paths can change, not about per-IP limits.
- **Redfin S3 (`redfin-public-data.s3.us-west-2.amazonaws.com`)**: no documented rate limit in this repo (S3 has per-prefix request-rate guidance externally, not asserted here).

### Q6. `429` / `Retry-After` behavior of the shared client

`go/internal/http/client.go:64-144`:

- `isRetryable(status)` returns `true` for status `408`, `429`, and any `5xx`.
- When a retryable status is observed (`client.go:109-115`), the body is excerpted and dropped, and the `Retry-After` header is parsed via `parseRetryAfter` (lines 110-114, 206-224). The parser accepts both integer seconds and HTTP-date forms, clamps negatives to 0, and stores the duration into an `atomic.Int64`.
- The custom `retry.DelayType` (lines 126-132) consumes that stored duration on the next attempt, then resets it; absent a `Retry-After`, it falls back to `retry.BackOffDelay` (the `avast/retry-go/v4` exponential default).
- Total attempts = `c.opts.MaxRetries + 1`. `ingest-all` passes `MaxRetries: 3` to all three client constructions ⇒ 4 attempts per request.
- Non-retryable 4xx (other than 408/429) is wrapped as `*HTTPError{Status, URL, BodyExcerpt}` inside `retry.Unrecoverable` (lines 117-122), bubbling out without retry. QCEW special-cases 404 in `fetchOne` (`qcew.go:144-149`).

`client.go:74-83` buffers the request body up front so retries can replay it.

### Q7. TOS constraints on parallel access

Not asserted in code or docs:

- `DATA_SOURCES.md` mentions Redfin only requires "Cite Redfin and link back; required by their data license" (`DATA_SOURCES.md:214`). No concurrency clause is cited.
- Zillow's gotchas section (`DATA_SOURCES.md:175-181`) mentions wide-format and URL-mutation only; no concurrency clause.
- FRED, Census, BLS, QCEW documentation in this repo cites only the numeric rate limits listed in Q5.

This is an **open question**: the data-provider TOS pages live off-repo and were not crawled here.

## Concurrency primitives and patterns already in the codebase

### Q8. What `internal/http.Client` exposes

From `go/internal/http/client.go`:

- `Options` (lines 22-26) only exposes `Timeout`, `MaxRetries`, `UserAgent`. No `MaxIdleConns`, `MaxConnsPerHost`, or custom `*http.Transport`.
- `New(opts)` (line 45) constructs `&http.Client{Timeout: opts.Timeout}` — the zero-value transport is `http.DefaultTransport`, whose Go-standard defaults (`MaxIdleConns: 100`, `MaxIdleConnsPerHost: 2`, no `MaxConnsPerHost`) apply implicitly. The codebase does not customise them.
- `Do(ctx, req)` (line 66) honours `ctx` cancellation: every attempt issues `c.inner.Do(req.WithContext(ctx))` (line 96), and `retry.Context(ctx)` (line 124) aborts the retry loop on cancellation.
- Per-attempt timeout = `opts.Timeout` (passed to `http.Client.Timeout`). There is no separate per-attempt deadline distinct from the overall `Timeout`.
- `Do` is safe to share across goroutines: the struct is immutable after `New`, the `atomic.Int64 retryAfter` is local to each `Do` call, and `*http.Client` is documented goroutine-safe.

### Q9. QCEW worker-pool reusability

Same code block as Q3. Per the three sub-questions:

- (a) **Per-task error propagation**: first-error-wins via `errOnce` + `fatalErr`; subsequent errors after the first are dropped on the floor. 404s are silently demoted to nil-result inside `fetchOne` and not surfaced. The pattern is monolithic (no `errgroup`), so adapting it elsewhere would require copying the mutex-and-`Once` plumbing.

- (b) **Context cancellation mid-flight**: each worker checks `ctx.Err() != nil` after acquiring its task index (`qcew.go:111-113`) and returns early. In-flight HTTP calls cancel via `req.WithContext(ctx)` in the shared client. Workers do not signal a cancel themselves on first error — they just exit; remaining queued tasks are not dequeued because the workers have already returned. (Other in-flight workers may still finish their current request.)

- (c) **Result ordering**: results write to `results[i]` at a fixed index handed out before the request, so the output order matches the task-construction order in `qcew.go:75-85` (outer year → quarter → county). Nil entries (404 / suppressed) are filtered in the final compaction loop (`qcew.go:129-134`).

The pattern is reusable in principle — `tasks[]` + `results[]` + index dispenser — but rebuilt rather than imported each time, because nothing in `internal/ingest/` exports a generic helper.

### Q10. Pattern for collecting multiple errors from concurrent goroutines

- `errors.Join` appears once: `ingest-all/main.go:76`, comment-marked as "for documentation; pkglog already emitted each." This is a serial collection of per-source errors, not a concurrent one.
- `errgroup.Group` does not appear in the repo.
- `qcew` uses `sync.Once` + `var fatalErr error` (single-error-wins, first to set the `Once` wins). This is the only concurrent error-collection pattern in the ingest tree.

## Observability and determinism

### Q11. Logging / timing signals per ingester

Each source emits structured `slog` records via `internal/log` (`pkglog.Default()`). The set of events observable in the code:

- **FRED** (`fred.go:110-138`): `Info("fred fetched {scope} series", series, fips, count)` per series; `Warn("fred … failed", err)` on per-series failure. No per-series duration. Issued strictly sequentially.
- **Census** (`census.go:85-97, 160, 180-201`): `Info("census: fetching state group", stateFips)` and `Info("census: state group done", stateFips, count)` per state; `Warn("census: …", …)` for parse skips. No durations.
- **BLS** (`bls.go:123, 175, 183, 207`): `Info("bls: posting batch request", count)`, `Info("bls: parsed series", series, fips, count)` per series in the response, `Warn("bls: series absent from response", series)` for missing series.
- **QCEW** (`qcew.go:86, 135, 147, 160, 247, 252`): `Info("qcew: starting fetch", count)` and `Info("qcew: fetch complete", count)`; `Warn("qcew: 404 …", fips, year, qtr)` and `Warn("qcew: federal county total row not found …", fips, year, qtr)`; `Warn("qcew: suppressed …", fips, year, qtr)`. No per-task duration. Per-task `Info`-level logs do not exist (only Warn paths log per-task).
- **Zillow** (`zillow.go:101, 113, 104, 117-118`): `Info("zillow: fetching", url, metric, scope)` and `Info("zillow: file done", metric, scope, count)` per file; `Error("zillow: fetch/parse failed; skipping file", url, err)`; `Warn("zillow: zero observations …")` if everything came back empty.
- **Redfin** (`redfin.go:105, 265, 267`): `Info("redfin: fetching county market tracker", url)`, `Info("redfin: pipeline complete", rows_read, observations)`, `Warn("redfin: unrecognized property type; skipped", property_type, count)`.
- **Per-source roll-up** in `runOne` (`ingest-all/main.go:86-114`): `Info("ingest:start", source, cadence)` and `Info("ingest:done", source, count, durationMs, cachePath)`. `durationMs` is a single number per source and is written to `.cache/{source}.json` as `IngestResult.DurationMs`.

What changes under concurrent ingestion: today, log lines are temporally grouped by source (a contiguous block of FRED logs, then a block of Census logs, etc.). The `slog` handler is configured in `internal/log/log.go` — `pkglog.Default()` is shared by every source. If two sources run simultaneously, their lines interleave, breaking the visual grouping; the `source` field on `ingest:start` / `ingest:done` records is consistent, but per-source intermediate logs (`Info("fred fetched …")`, `Info("zillow: fetching …")`) do **not** carry the source name when it is already implicit in the message string. Filtering after the fact requires substring matching on `msg`, not a structured field.

The `runOne` durationMs is per-source — it measures `time.Now()` deltas around `src.Fetch(ctx)` regardless of how many other sources are running. The total wall-clock time is not currently logged anywhere; it would have to be computed by the caller (i.e., in `main` around the source loop).

### Q12. Determinism of `IngestResult.Observations` order and downstream re-sorting

The TS-cutover regression gate in `5-plan.md:334-339` and the QCEW-refactor design documents reference a `jq -S sort_by(...)` diff used to verify byte-equivalence between TS and Go outputs at the cutover. The output order written into `.cache/{source}.json` therefore matters for that diff but not necessarily for the runtime consumer.

Downstream:

- `cmd/transform/main.go:71` calls `transform.SortAndDeduplicate(obs)`. In `go/internal/transform/dedupe.go:22-58`, this is a **stable** `sort.SliceStable` that only reorders rows when **both sides are Redfin** and one is `:all_residential`. Non-Redfin rows preserve their input order; Redfin rows of the same kind preserve their input order. The dedup key is `(source, fips, metric, observedAt)` (with `series` added for Redfin `active_listings`), so two equal-key observations in different input orders would dedupe down to whichever appeared first.
- `obsToPoints` (`cmd/transform/main.go:164-176`) re-sorts by date (insertion-sort by `pts[j-1].Date > pts[j].Date`), making per-metric output independent of input order.
- `BuildCountyPages` is invoked from `cmd/transform/main.go:109` with the post-dedupe slice; its ordering behaviour is not shown in this research pass (see `internal/transform/county_pages.go`).

Within each ingester:

- FRED appends sequentially in spec order → spec ordering (national → state → county-by-county-by-series-spec).
- Census appends per `stateGroup`, then per row, then per variable.
- BLS appends per series in the response (response order, not request order).
- QCEW pre-allocates `results[i]` keyed by the index in the constructed task list (outer year → quarter → county) and filters nils into `out` in the same index order — output order is deterministic and independent of which worker finished first.
- Zillow appends per file in `DefaultFiles()` order, then per row.
- Redfin appends in input stream order (TSV order).

If `ingest-all` ran sources concurrently, the order of `.cache/*.json` files would be unaffected because each source writes its own file; the order **within** each source's `IngestResult.Observations` would be unchanged because no source today has its own data interleaved across sources. The cross-source order in the combined `obs` slice inside `cmd/transform` depends on `loadAllCaches` iterating `knownSources` (`cmd/transform/main.go:27`) in a fixed order (`"fred", "census", "bls", "zillow", "redfin", "qcew"`) regardless of which order the ingesters finished.

The `:all_residential`-priority sort in `SortAndDeduplicate` runs on the combined slice; the Redfin dedup that depends on rows being sorted by series suffix is preserved as long as Redfin's own internal ordering is preserved — which it is, since concurrency would only parallelise *across* sources, not within Redfin's single-stream parse.

## Resource budget on the runner

### Q13. Memory ceiling on `ubuntu-latest` and current peak RSS

Not documented inside this repo. The only concrete measurement is in `docs/crispy/go-ingest-refactor/6-implement.md:171`:

> "Maximum resident set size: 205,373,440 B (~196 MB). Peak memory footprint: 191,726,432 B (~183 MB). Both well under the plan's 256 MB cap."

This figure was collected for the Redfin step in isolation. The 256 MB cap was a plan-imposed budget (`5-plan.md:336` — "Must report < 256 MB (= 262144 KB)"), not a runner ceiling. The actual GitHub-Actions-hosted ubuntu-latest runner spec is not asserted in this repo. The redfin code comment (`redfin.go:1-4`) describes the streaming design as "to stay under the 256MB RSS cap" — internal budget, not runner ceiling.

No measurements exist for FRED, Census, BLS, QCEW, or Zillow individually, nor for `make ingest` running everything in series.

### Q14. CPU/core count and network bandwidth

Not asserted in this repo. The `qcew.go` `concurrency = 4` constant is the only place in code that bounds parallel network use, and its justification is implicit (in `6-implement.md:120`: "Concurrency 4 across ~970 tasks via a goroutine pool; index-keyed result slice keeps ordering stable" — without citing CPU or NIC).

The repo holds no benchmarks indicating which step is CPU-bound vs network-bound. From code inspection:

- Redfin (`redfin/redfin.go:104-269`): single HTTP stream + per-line `strings.Split` + `strconv.ParseFloat`. Likely **CPU + bandwidth bound** (203 MB compressed inbound; gzip + scanning + per-row filter chain).
- QCEW (`qcew/qcew.go:139-166`): ~950 small CSV GETs (low-kB each), parsed via `encoding/csv`. Likely **network-latency-bound** per request; aggregate throughput limited by `concurrency = 4` and per-host connection cap.
- FRED: 600 ms sleeps dominate wall-clock; **artificially network-throttled**.
- Census, BLS, Zillow: low request count; **bandwidth/latency bound** on a few large-ish payloads.

## Failure semantics

### Q15. State left after a mid-fetch failure

For `cmd/ingest-all`:

- `runOne` (`ingest-all/main.go:82-116`) returns the source's error **before** any `storage.WriteJSON` call (`storage.WriteJSON` only runs on the success branch at line 105). Consequently a per-source failure leaves no new `.cache/{source}.json` and **does not overwrite** the prior cache file. Any pre-existing `.cache/{source}.json` from an earlier successful run is preserved untouched.
- `storage.AtomicWrite` (`storage/atomic.go:14-39`) writes to a same-directory temp file and uses `os.Rename` to swap; a crash between create and rename leaves an orphan temp file in `.cache/` (not the target name).
- `signal.NotifyContext(ctx, os.Interrupt)` (`ingest-all/main.go:49`) cancels `ctx` on SIGINT; in-flight `Fetch` calls observe `ctx.Done()` via `req.WithContext(ctx)` and return errors; same write-skip behaviour applies — no partial cache file.

For `cmd/transform`:

- `loadAllCaches` (`cmd/transform/main.go:196-231`) iterates `knownSources` and, on missing or unreadable cache for a source, **logs a warn and continues**, marking that source's manifest entry `Status: "stale"` with `LastUpdated = epoch zero`. The function only hard-errors on JSON-decode failure (`return nil, nil, fmt.Errorf("decode %s: %w", path, err)`, line 218). So a missing cache (e.g., source failed today) degrades gracefully but a corrupt cache halts the whole transform.
- The downstream sanity check at `main.go:67-69`: `if len(obs) == 0 { os.Exit(1) }` — only fires when **every** cache is missing.

### Q16. Policy on per-source errors in `cmd/ingest-all`; tests

Policy from `ingest-all/main.go:64-78`:

```go
var errs []error
for _, src := range sources {
    if err := runOne(ctx, src, logger); err != nil {
        errs = append(errs, fmt.Errorf("%s: %w", src.Name(), err))
    }
}

if len(errs) > 0 {
    logger.Error("ingest-all: one or more sources failed", "count", len(errs))
    for _, e := range errs {
        logger.Error("ingest-all failure", "err", e)
    }
    _ = errors.Join(errs...) // for documentation; pkglog already emitted each
    os.Exit(1)
}
```

→ "**continue with the rest, then exit 1 if any failed**". Earlier failures do not abort subsequent sources.

Within an individual source the policy varies:

- **FRED** and **Zillow** swallow per-series / per-file errors as warns and continue; `Fetch` returns nil error if the loop completes (`fred.go:109-145`, `zillow.go:104-110`). A whole-Fetch error would require something like `ctx.Err()` from `sleepCtx` propagating up.
- **Census** swallows per-state errors as `Error` log + continue (`census.go:85-98`); `Fetch` returns nil error always (today).
- **BLS** returns its single batch error fatally (one POST, one chance) (`bls.go:141-150`).
- **QCEW** returns the first non-404 error fatally via the `errOnce` channel; warns for 404 / suppressed and continues (`qcew.go:114-127, 144-152`).
- **Redfin** returns any download / gzip / parse error fatally (`redfin.go:111-123`).

No test in the repo encodes the "continue-then-exit-1" policy of `cmd/ingest-all` end-to-end; there is no `cmd/ingest-all/*_test.go` file in the listing produced from `find go -type f -name "*.go"`. Unit tests exist per-package (`{fred,bls,census,qcew,zillow,redfin}_test.go`, `internal/http/client_test.go`, `internal/storage/atomic_test.go`, `internal/transform/*_test.go`) but exercise individual fetchers, not the orchestrator.

## Open Questions

- **Q4 — actual wall-clock duration on `ubuntu-latest` for `make ingest`.** The Go pipeline records per-source `durationMs` in `.cache/{source}.json` but no checked-in artifact in `docs/` reports a recent number. Would require either reading GitHub Actions run logs from the `Ingest` workflow or running locally and copying the values from `.cache/*.json`.
- **Q5 (partial) — documented numeric rate limits for Census ACS, BLS QCEW, Zillow static CSVs, Redfin S3.** `DATA_SOURCES.md` only enumerates FRED (120 req/min) and BLS LAUS/CES (500 queries/day + 50 series/batch). The other four endpoints have no asserted numeric ceiling in this repo.
- **Q7 — TOS / data-license restrictions on parallel access.** The data-provider terms-of-service pages are off-repo; the only license-derived note that survives in `DATA_SOURCES.md` is the Redfin citation requirement, with no concurrency clause.
- **Q11 (partial) — concrete behaviour of `slog` interleaving under concurrent sources.** The handler used by `pkglog.Default()` was not opened in this pass; whether it serialises lines, whether it adds a `source` attribute when not in the message string, and whether `runOne`'s `with("source", …)` is propagated into the source's own `slog.Logger` is unknown until `internal/log/log.go` is inspected.
- **Q13 — actual memory ceiling of `ubuntu-latest` and combined-pipeline peak RSS.** Only Redfin-in-isolation has been measured (~196 MB RSS). The ubuntu-latest runner spec is well-known in GitHub docs but is not asserted in this repo, and no combined-pipeline measurement has been taken.
- **Q14 — CPU/core count and network bandwidth on `ubuntu-latest`, plus per-step CPU-vs-network split.** Inferred from code shape (FRED throttled, Redfin gzip-heavy, QCEW many-small-GETs), but no benchmark exists in the repo.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/go-ingest-concurrency/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `go-ingest-concurrency`.
