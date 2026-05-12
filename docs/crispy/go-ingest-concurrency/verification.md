# Verification — go-ingest-concurrency

Wall-clock and memory measurements taken 2026-05-11, host = Darwin 25.2.0 arm64, network = home residential. Both runs used the same `.env` keys against the live upstream APIs.

| Metric                          | Baseline (serial) | After (concurrent) | Delta            |
|---------------------------------|-------------------|--------------------|------------------|
| Sum of per-source `durationMs`  | 95,897 ms         | 101,266 ms         | +5.6% (no-op)    |
| Wall-clock `totalDurationMs`    | ≈ 95,897 ms       | 56,939 ms          | **−40.6%**       |
| `/usr/bin/time -l` real         | not measured      | 58.15 s            | —                |
| Peak RSS (`maximum resident…`)  | not measured      | 217,120,768 B (~207 MB) | —          |

## Per-source durations (concurrent run)

| Source  | Concurrent `durationMs` | Serial baseline `durationMs` |
|---------|-------------------------|------------------------------|
| bls     | 824                     | 981                          |
| census  | 1,197                   | 1,821                        |
| zillow  | 3,168                   | 3,282                        |
| redfin  | 17,180                  | 17,561                       |
| qcew    | 21,990                  | 19,697                       |
| fred    | 56,907                  | 52,555                       |
| **sum** | **101,266**             | **95,897**                   |

Concurrent total wall-clock is dominated by FRED (56.9 s of 56.9 s), as predicted by the design — FRED's 600 ms × ~60 county GETs is the binding floor. Sum-of-durations being roughly equal between the two runs confirms each source did the same work; the speedup comes entirely from overlap.

## Byte-equivalence check

For every `.cache/{source}.json` under the concurrent run:

```bash
diff <(jq -S '.observations | sort_by(.source, .series, .fips, .observedAt, .value)' baseline/$name) \
     <(jq -S '.observations | sort_by(.source, .series, .fips, .observedAt, .value)' .cache/$name)
```

Result: all six diffs empty. Observations are byte-equivalent modulo the timestamp fields (`startedAt`, `finishedAt`, `durationMs`).

## Notes

- Baseline `durationMs` values read from `.cache/*.json` left over from the prior serial run on `feat/go-ingest-refactor` (mtime 2026-05-11 21:47). Serial wall-clock was not separately logged before this change; the sum of per-source `durationMs` is an upper bound on what serial wall-clock would have been because the orchestrator added no measurable overhead between sources.
- Concurrent `totalDurationMs` read from the new `ingest-all: complete` log line emitted by `cmd/ingest-all`.
- Peak RSS measured via `/usr/bin/time -l` on Darwin. Linux runner (`ubuntu-latest`) RSS not re-measured; the ~207 MB figure is consistent with prior measurements from `docs/crispy/go-ingest-refactor/6-implement.md:171` (Redfin alone peaked at ~196 MB), so headroom against the 7 GB runner ceiling is large.
- Predicted lower bound for concurrent wall-clock was `max(per-source durationMs)`, i.e., Redfin or FRED whichever is larger. FRED won, as expected; further win would require parallelising FRED's county loop — deferred per Design Decision 4.
- `INGEST_SEQUENTIAL=1` toggle was not added per Design open-question resolution. If the GitHub Actions monthly run ever needs to fall back, re-add the serial loop as a ~5-line `if` in `run`.

## Resolving Open Questions from research

- **Q4 (wall-clock duration of `make ingest`)**: serial ≈ 95.9 s, concurrent 58.2 s on this host. Runner numbers will differ but the ratio should hold.
- **Q13 (combined-pipeline peak RSS)**: ~207 MB on Darwin under the concurrent shape.
