# Questions

### Current execution shape

1. In `go/cmd/ingest-all`, what is the execution order of the six `DataSource` implementations, and is any source pair already eligible to run in parallel (no shared mutable state, no in-process resource contention)?
2. Inside each individual ingester (`internal/ingest/{fred,census,bls,qcew,zillow,redfin}`), how many outbound HTTP requests does a single `Fetch(ctx)` call issue, and in what shape — single batch POST, fixed loop, fan-out per FIPS, fan-out per year-quarter, single streaming download?
3. Which packages today already use goroutines or any form of in-process parallelism, and how is concurrency bounded in those places (worker count, semaphore, channel-buffered fan-out)?
4. What is the total wall-clock duration of a clean `make ingest` run on a GitHub Actions ubuntu-latest runner today, broken down by source?

### Upstream rate limits and concurrent-request behavior

5. For each upstream API/endpoint we hit (FRED `/series/observations`, Census ACS, BLS `/timeseries/data/`, BLS QCEW area CSVs, Zillow Research static CSVs, Redfin S3 `.tsv.gz`), what is the documented or empirically observed rate limit (requests per minute, concurrent connections per IP, daily quota)?
6. Which of these endpoints return `429` or `Retry-After` when overloaded, and what is the current behavior of `internal/http.Client` when it sees one?
7. Are there contractual restrictions in the data-provider terms of service that constrain parallel access (e.g., "no scraping," "single-threaded only," explicit concurrency cap)?

### Concurrency primitives and patterns already in the codebase

8. What concurrency utilities does `internal/http.Client` expose today (request-scoped context cancellation, per-host connection pool size, timeout per attempt)?
9. How does the existing QCEW worker pool (`internal/ingest/qcew`) handle (a) per-task error propagation, (b) context cancellation mid-flight, and (c) result ordering, and could that pattern be reused elsewhere as-is?
10. What pattern does the codebase use for collecting multiple errors from concurrent goroutines today (`errors.Join`, channel-of-errors, first-error-wins via `errgroup.Group`)?

### Observability and determinism

11. What logging / timing signals does each ingester emit today (start/done, per-series counts, per-task durations), and what would change about them when multiple tasks run concurrently (interleaving, lost ordering, missing per-source duration totals)?
12. Is the deterministic-output guarantee currently relied on anywhere (test goldens, the `jq -S sort_by(...)` cutover-gate diff)? If concurrent ingestion produces observations in a different order in `IngestResult.Observations`, does the downstream transform (`SortAndDeduplicate`, per-county `BuildCountyPages`) re-sort, or does it rely on the inbound order?

### Resource budget on the runner

13. What is the memory ceiling of the GitHub Actions `ubuntu-latest` runner, and what is the current peak resident set size of `make ingest` (in particular, the Redfin step which the plan documented at ~196 MB on its own)?
14. What is the CPU/core count and network bandwidth available on the runner, and which step is currently CPU-bound vs network-bound?

### Failure semantics

15. When one source fails mid-fetch today, what state is left behind — partial `.cache/{source}.json`, no file, a stale file from a previous run? And does `cmd/transform` recover gracefully from a missing or partial cache file?
16. What is the current policy in `cmd/ingest-all` when one source returns an error (continue with the rest, abort early, write a marker), and is that policy encoded in tests anywhere?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/go-ingest-concurrency/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `go-ingest-concurrency`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
