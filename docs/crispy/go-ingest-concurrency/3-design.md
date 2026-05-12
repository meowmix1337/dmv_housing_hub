# Design

## Current State

`cmd/ingest-all` runs the six `DataSource` implementations one after another in a fixed slice (`fred → census → bls → qcew → zillow → redfin`). Each `runOne` invocation is self-contained:

- Per-source state is private to its `*Source` struct (config + `*httpclient.Client` + `*slog.Logger`); no struct field is mutated across sources.
- Each source writes its own `.cache/{name}.json` atomically; the six cache filenames are disjoint, so concurrent writers cannot collide.
- The shared `httpclient.Client` (the `apiClient` instance wired into FRED/Census/BLS/QCEW, plus the two larger-timeout clients for Zillow and Redfin) is goroutine-safe: every state mutation in `Do` lives on per-call stacks or per-call `atomic.Int64` values.
- The six upstream hostnames are distinct except for `api.bls.gov` (BLS LAUS/CES) and `data.bls.gov` (QCEW), which share a parent domain but use different subdomains.
- QCEW already runs internally with `concurrency = 4` via a mutex-guarded index dispenser; no other ingester uses goroutines.
- Per-source failures are tolerated by `ingest-all` (it collects errors and exits 1 only at the end); within sources, FRED/Census/Zillow already swallow per-item errors as warns. BLS, QCEW (non-404), and Redfin propagate fatal errors.
- Transform (`SortAndDeduplicate` + `obsToPoints` + downstream builders) re-sorts and dedupes, so the cross-source order of `loadAllCaches` is independent of which ingester finishes first. Per-source internal observation order is unchanged by adding inter-source concurrency, since each source still owns a single goroutine writing its own cache.
- Wall-clock today is dominated by Redfin's ~226 MB gzipped stream and FRED's 63 county GETs with a 600 ms sleep between each (~38 s pure sleep). QCEW does ~950 small GETs at concurrency 4. The combined-pipeline wall-clock isn't checked into the repo.

## Desired End State

`make ingest` completes meaningfully faster on the GitHub Actions monthly run by overlapping the six sources in time, without:

- changing the on-disk `.cache/{source}.json` contracts (byte-equivalent observations),
- changing per-source success/failure semantics,
- changing `cmd/transform` or any downstream output,
- introducing new dependencies beyond the Go standard library and `golang.org/x/sync` (already idiomatic).

Concretely:

- `cmd/ingest-all` runs all six `DataSource.Fetch(ctx)` calls concurrently.
- Each source's `slog` lines stay attributable to that source even when interleaved.
- Per-source error semantics are preserved: one source failing does not kill the others; the orchestrator still exits non-zero iff any source failed.
- FRED's `countySleepDelay` either stays as-is (acceptable floor) or moves to a token-bucket pacing that lets us also parallelise within-FRED without exceeding 120 req/min.

## Architecture Decisions

### Decision 1: Inter-source concurrency in `cmd/ingest-all`

**Decision:** Replace the serial `for _, src := range sources` loop with a `golang.org/x/sync/errgroup` (or `sync.WaitGroup` + per-goroutine error slot) that runs all six sources concurrently. Each goroutine calls the existing `runOne`. Errors are still collected into the `errs` slice (now mutex-protected) and logged after every goroutine returns.

**Why:** All six sources are eligible for parallelism today: no shared mutable state, disjoint cache files, distinct upstream hosts (except `api.bls.gov`/`data.bls.gov` which already coexist), and a goroutine-safe shared HTTP client. The win is structural: Redfin's long stream overlaps with FRED's sleeps and QCEW's ~950 small GETs, instead of stacking.

**Trade-off:** Logs interleave across sources. Peak memory rises because all six observation slices live simultaneously rather than serially (Redfin observations dominate; the other five combined are modest). Network ceiling on the runner is now hit by six sources at once; if the runner caps egress aggressively, the speedup is smaller than the optimistic case.

### Decision 2: `errgroup.Group` over hand-rolled `sync.WaitGroup`

**Decision:** Use `errgroup.WithContext(ctx)` in `cmd/ingest-all`. Each goroutine returns `nil` for *expected* per-source failures (so the errgroup doesn't cancel sibling sources) and writes the error into an external mutex-guarded `[]error` instead. The errgroup is purely the wait/cancel primitive; the existing "continue with the rest, exit 1 at the end" policy is preserved.

**Why:** `errgroup`'s wait + context-cancel plumbing is exactly what we need for SIGINT propagation, which is already wired through `signal.NotifyContext`. Returning errors *through* the errgroup would cancel siblings — which would change the current "every source gets a chance" policy. Keeping the explicit `errs []error` slice plus a `sync.Mutex` mirrors how `ingest-all` already shapes the error set.

**Trade-off:** A first-time reader has to notice that errgroup is being used unconventionally (errors stashed externally, not returned). A short comment in the source covers that.

### Decision 3: Source-tagged `slog` for interleaved output

**Decision:** Build a per-source `*slog.Logger` in `runOne` via `pkglog.Default().With("source", src.Name())` and inject it back into the source before `Fetch`. Add a `SetLogger(*slog.Logger)` (or `WithLogger`) method on each `*Source`, used only by the orchestrator. Each ingester's existing log lines keep their current `msg` strings — we add the `source` attribute, not rename messages.

**Why:** Today the orchestrator already emits `Info("ingest:start", "source", src.Name())` and `Info("ingest:done", "source", src.Name())` with a `source` attribute. Mid-fetch lines (e.g., `"fred fetched national series"`) embed the source name in the message string but lack a structured field; interleaved output becomes hard to grep without the field. Adding the attribute via `With` is a one-line per-source wiring change.

**Trade-off:** Touches every source struct to add a setter (or constructor option). Logs grow slightly (an extra k/v pair per record). Pre-existing log assertions in unit tests may need updates if they match on full record shape — none in scope appear to.

### Decision 4: Keep per-source concurrency unchanged in this pass

**Decision:** Do not add concurrency inside FRED, Census, BLS, Zillow, or Redfin. Leave QCEW's existing `concurrency = 4` pool alone. Do not raise QCEW's worker count.

**Why:** The biggest single lever (overlap the six sources) is achieved by Decision 1 alone. Adding within-source parallelism multiplies risk surface (rate-limit tripping on FRED, BLS hostname contention, Zillow's undocumented limit) without a clear time win once inter-source concurrency has already removed serialisation. FRED's 38 s of pure sleep is already shorter than Redfin's stream; parallelising FRED would not move the critical path.

**Trade-off:** We leave a measurable FRED speedup on the table (potentially ~30 s if parallelised carefully under 120 req/min). Revisitable in a follow-up CRISPY once we have wall-clock measurements from the new shape.

### Decision 5: Cap simultaneous ingesters at six (no semaphore)

**Decision:** Do not introduce a semaphore or worker-pool bound at the `ingest-all` level. Spawn one goroutine per source, six total, fixed. No envvar knob.

**Why:** Six is small, fixed, and a natural one-per-`DataSource`. A semaphore would add a parameter, a code path, and a way to misconfigure the pipeline for no clear gain on a 2-core ubuntu-latest runner. If the runner saturates, the `Fetch` calls naturally slow down rather than fail.

**Trade-off:** No throttle knob exists if a future ingester is added that misbehaves under load. Adding a knob is a five-line change later.

### Decision 6: Aggregate wall-clock timing in `cmd/ingest-all`

**Decision:** Add `Info("ingest-all: started", "sources", len(sources))` at the top of `main` and `Info("ingest-all: complete", "totalDurationMs", …, "failed", len(errs))` at the bottom, replacing the existing terminal `"ingest-all: complete"` line. Per-source `durationMs` continues to live in `.cache/{source}.json` via `IngestResult` and in the existing `ingest:done` log.

**Why:** The whole point of this change is wall-clock improvement. Today, the *total* wall-clock isn't logged anywhere; it would have to be computed by reading two log timestamps. A single log line makes before/after comparison trivial in the GitHub Actions log.

**Trade-off:** One extra field in one log line. None substantive.

## Patterns to Follow

- **Follow QCEW's index-keyed result pattern** when introducing in-process parallelism: pre-allocated `results[i]` plus a single appender at the end keeps output order deterministic and avoids channel orchestration overhead. *(Not used in this design pass — Decision 4 — but reaffirmed for future within-source work.)*
- **Follow `ingest-all`'s "collect all, exit-1 if any" error contract.** Continuing on per-source failure is the existing user-visible policy; concurrent execution must preserve it.
- **Follow the atomic-write contract in `internal/storage`.** Each goroutine still writes its own cache via `storage.WriteJSON`; same-directory temp file + `os.Rename`. Already concurrency-safe across distinct destination paths.
- **Reject `errgroup`'s default first-error-cancels behaviour.** It would silently change the current per-source-failure policy from "every source runs" to "first failure cancels the rest." Suppress by returning `nil` from goroutines and stashing errors externally.
- **Reject adding an `internal/ingest/parallel` helper package** in this pass. Six goroutines + a mutex + a slice + an errgroup is ~25 lines in `cmd/ingest-all/main.go`. Premature abstraction.
- **Reject changing `httpclient.Client` to expose a per-host limiter or custom `Transport`.** The default `http.DefaultTransport` (with its standard `MaxIdleConnsPerHost: 2`) is enough for six concurrent sources against six distinct hosts; nothing in research suggests we need more.

## Open Questions

- **Should QCEW's `concurrency = 4` be lowered when running alongside five other ingesters?** If QCEW's `data.bls.gov` workers are running concurrently with BLS LAUS/CES against `api.bls.gov`, the parent-domain rate-limit posture matters. Research did not establish whether BLS treats these as one tenant. Default in this design: leave at 4 unless measurement shows 429s.
- **Do we want a kill-switch envvar (`INGEST_SEQUENTIAL=1`) to fall back to today's behaviour** for local debugging or for the rare run where one upstream is misbehaving? Cheap to add (a single `if` in `main`); useful as a safety valve. Default in this design: skip until needed.
- **Does the test suite need an end-to-end test for the orchestrator?** No `cmd/ingest-all/*_test.go` exists today. Adding one would let us encode the concurrent-execution contract (six fakes, one fails, others still write their caches, exit 1 reported). Default in this design: yes, a small `main_test.go` with fake `DataSource`s.
- **Combined-pipeline RSS on the runner after change.** Redfin alone peaks ~196 MB; adding ~tens of MB for the other five running simultaneously may approach but not exceed ubuntu-latest's 7 GB. Worth measuring once but not designing for. Default: trust the headroom, add a one-time measurement to the verification checklist.
- **Should `cmd/transform`'s `loadAllCaches` continue to iterate `knownSources` in fixed order** for the dedupe pass? Yes — the order matters for `SortAndDeduplicate`'s `:all_residential` priority among Redfin rows only, and the order between *sources* in the combined slice is not load-bearing. No change needed.

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/go-ingest-concurrency/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `go-ingest-concurrency`.
