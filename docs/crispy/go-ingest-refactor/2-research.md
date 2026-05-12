# Research

Date: 2026-05-10. Findings below are factual observations only — no recommendations or design choices.

## Language & Runtime

### Q1 — Go 1.26 release status and support window

- **Go 1.26.0 is generally available**, released 2026-02-10. Latest patch as of this research: **go1.26.3**, released 2026-05-07.
- Go's documented policy: "Each major Go release is supported until there are two newer major releases." ([go.dev/doc/devel/release](https://go.dev/doc/devel/release))
- Currently in support: Go 1.25 and Go 1.26. Go 1.24 left support on Go 1.26's release; its final patch was go1.24.13 (2026-02-04).
- Cadence: ~6 months per major release. Go 1.27 expected ~August 2026.

### Q2 — Stdlib changes (1.25 → 1.26) relevant to fetching & JSON

**Go 1.25 (2025-08-12)** — [go.dev/doc/go1.25](https://go.dev/doc/go1.25):
- `encoding/json/v2` and `encoding/json/jsontext` added **as experimental**, gated by `GOEXPERIMENT=jsonv2` at build time. When enabled, the legacy `encoding/json` package uses the new implementation; error messages can change. Decoding is "substantially faster." Proposal: [#71497](https://github.com/golang/go/issues/71497).
- `net/http`: new `CrossOriginProtection` type for Fetch-metadata-based CSRF protection (no tokens/cookies).
- `log/slog`: added `GroupAttrs` for building group `Attr` from slices; `Record.Source` returns source location.

**Go 1.26 (2026-02-10)** — [go.dev/doc/go1.26](https://go.dev/doc/go1.26):
- `encoding/json`: no listed changes. `encoding/json/v2` did **not** graduate to stable in 1.26 — still experimental.
- `net/http`:
  - `Transport.NewClientConn` for custom connection management.
  - `Dialer.DialIP`, `DialTCP`, `DialUDP`, `DialUnix` accept context values.
  - `HTTP2Config.StrictMaxConcurrentRequests` controls whether a new connection opens when an HTTP/2 stream limit is exceeded.
  - `Client` now uses cookies scoped to `Request.Host` when available rather than connection-address host.
  - `ServeMux` trailing-slash redirects changed from **HTTP 301 → HTTP 307**.
  - `httputil.ReverseProxy.Director` deprecated in favor of `ReverseProxy.Rewrite`.
- `log/slog`: `NewMultiHandler` fans out to multiple handlers.
- `net/url.Parse` now rejects malformed URLs with colons in the host subcomponent (e.g., `http://::1/`); GODEBUG `urlstrictcolons=0` restores old behavior.

### Q3 — Tooling minimums for Go 1.26

- **golangci-lint**: latest as of 2026-05-06 is **v2.12.2** ([releases](https://github.com/golangci/golangci-lint/releases)). Per the project's FAQ, binaries are built with `go1.25` "as long as go1.26 is not GA"; tracking issue [#6272](https://github.com/golangci/golangci-lint/issues/6272) covers the go1.26 transition.

> **User input (2026-05-10):** Use the latest available golangci-lint at adoption time (don't pin to a minimum). The exact first tag built against go1.26 is therefore not load-bearing.
- **gopls v0.18.0** added the `modernize` analyzer and reports unused functions/methods ([release notes](https://github.com/golang/tools/releases/tag/gopls/v0.18.0)). Officially supports the 2 most recent Go majors (1.25 + 1.26). Forward compatibility from Go 1.21+ means `go install golang.org/x/tools/gopls@latest` auto-fetches the right toolchain.

### Q4 — GitHub Actions support for Go 1.26

- `actions/setup-go@v6` is the current major version ([releases](https://github.com/actions/setup-go/releases)). `go-version: '1.26'` installs from the manifest or Go distribution site.

> **User input (2026-05-10):** Use the latest GitHub `setup-go` action (pin to major version `v6` so patches roll in automatically). The exact latest patch tag is therefore not load-bearing.
- Example:
  ```yaml
  - uses: actions/setup-go@v6
    with:
      go-version: '1.26'
  ```
- **Toolchain directive in `go.mod` is NOT required for Go 1.26.** Per [go.dev/doc/toolchain](https://go.dev/doc/toolchain), an omitted `toolchain` line is implicitly `toolchain go<version>` matching the `go` line. With default `GOTOOLCHAIN=auto`, the `go` command resolves toolchains automatically. An explicit `toolchain` directive helps when a module needs a lower minimum `go` version for compatibility but prefers a newer toolchain.

## Project Structure & Build

### Q5 — CLI workspace layout: `cmd/`, `internal/`, modules

Authoritative source: [go.dev/doc/modules/layout](https://go.dev/doc/modules/layout).

- **`cmd/`**: "A common convention is placing all commands in a repository into a `cmd` directory; while this isn't strictly necessary in a repository that consists only of commands, it's very useful in a mixed repository that has both commands and importable packages." Each sub-directory under `cmd/` has its own `main.go` and installs independently (e.g., `go install .../cmd/ingest-fred@latest`).
- **`internal/`**: compiler-enforced privacy. Packages under `internal/` cannot be imported by code outside the ancestor tree. The official guide: "Since other projects cannot import code from our `internal` directory, we're free to refactor its API and generally move things around without breaking external users." Sub-divisions like `internal/app/` and `internal/pkg/` are common.
- **Module boundaries**: a single `go.mod` at the repo root is the default. Multi-module workspaces (`go.work`) are for advanced use; the official guide does not recommend them by default.
- **`golang-standards/project-layout`** is widely referenced but is **not an official Go standard**. Russ Cox (core Go contributor) filed [issue #117](https://github.com/golang-standards/project-layout/issues/117): "this is not a standard Go project layout." Repo README acknowledges it is a "set of common historical and emerging project layout patterns."

### Q6 — Go + Node.js monorepo integration patterns

No single dominant standard exists. Observed patterns:

- **Plain Makefiles**: most common for small-to-medium polyglot repos. Root `Makefile` with `build-go`, `build-web`, `all` targets; each toolchain manages its own dependency graph; Make sequences them. Grafana used this pattern before moving to more elaborate tooling.
- **Bazel**: handles polyglot dependency graphs and hermetic builds. Significant configuration investment; supports `go_binary`/`go_library` and `js_library`/`ts_project` rules. Community boilerplate: [locol23/monorepo-boilerplate](https://github.com/locol23/monorepo-boilerplate) (TypeScript + Go + Turborepo + Bazel).
- **Turborepo**: primarily a JS/TS build orchestrator. Can invoke `go build` as a task with file-hash-based caching, but does not natively understand Go module semantics — cache keys must be configured manually. Suited to small-to-medium repos (5–50 packages per published benchmarks).
- **Nx**: plugin-extensible; can run Go via shell executors. More feature-rich than Turborepo with heavier setup.
- **Hugo + JS pattern**: Hugo is a Go binary consuming JS build output placed in `assets/`. The two pipelines are sequenced externally (CI or Make).

The Go toolchain has no built-in awareness of `package.json` workspaces; Node toolchains have no built-in awareness of Go modules. Cross-toolchain artifact handoff is always coordinated externally (Make, shell scripts, or an orchestrator).

Sources: [Monorepo in 2026](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/), [Aviator Monorepo Tools 2025](https://www.aviator.co/blog/monorepo-tools/).

### Q7 — Sharing Go type definitions with a TypeScript consumer

| Approach | Tools | Mechanism | Trade-off |
|---|---|---|---|
| **Direct source-level codegen** | [tygo](https://github.com/gzuidhof/tygo), [typescriptify-golang-structs](https://github.com/tkrajina/typescriptify-golang-structs), [struct2ts](https://github.com/OneOfOne/struct2ts) | Parses Go AST or reflects; emits `.d.ts` or `.ts` | No runtime dep; preserves comments/const groups (tygo); output drifts if codegen not re-run in CI |
| **JSON Schema intermediate** | [invopop/jsonschema](https://github.com/invopop/jsonschema) + [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) | Go emits JSON Schema; TS generates interfaces from schema | Two-step pipeline; schema is a stable contract; supports Draft 2020-12 |
| **Schema-first (Protobuf)** | protoc + [protoc-gen-ts](https://pkg.go.dev/github.com/join-com/protoc-gen-ts) | `.proto` files are source of truth; codegen for Go + TS | Canonical contract; strong versioning; overkill for JSON-only APIs |
| **OpenAPI / JSON Schema first** | openapi-generator, quicktype | Schema file drives both sides | Widest TS ecosystem; schema vs Go impl sync is manual unless generated |

**tygo specifics**: AST-based (not reflection); preserves comments and const groups; supports generics (Go 1.18+); enums or unions from `const` blocks; configured via `tygo.yaml`. Limitation: only processes exported types with JSON tags; complex embedded struct semantics may need manual overrides.

**typescriptify-golang-structs**: reflection-based (builds and runs a Go helper). Types must be manually registered. Does not preserve comments without extra tags.

**invopop/jsonschema**: emits JSON Schema Draft 2020-12 from Go types via struct tags. Used by GOBL as a cornerstone library.

### Q8 — Go modules for reproducible CI builds

Source: [go.dev/ref/mod](https://go.dev/ref/mod).

- **`go.sum`**: SHA-256 checksums of each module version's source tree and `go.mod`. `go` verifies downloads against these before use. Commit to VCS. Go 1.21 made checksum tracking stricter. Go 1.17+ includes only pruned-module-graph checksums; Go 1.16 mode includes the full graph for compatibility.
- **Vendoring** (`go mod vendor`): copies needed packages into `vendor/` and writes `vendor/modules.txt`.
  - Go 1.14+: if `vendor/` exists and `go.mod` declares `go 1.14+`, `-mod=vendor` is the implicit default.
  - `vendor/modules.txt` is checked for consistency with `go.mod` on every command.
  - Go 1.17+: `go mod vendor` omits dependency `go.mod`/`go.sum` from `vendor/`.
- **`-mod` flag** (`GOFLAGS=-mod=...`):
  - `-mod=readonly` (default in Go 1.16+ without `vendor/`): errors if `go.mod` needs updating; no network use.
  - `-mod=vendor`: uses `vendor/` exclusively; no network or module cache. Ideal for air-gapped CI.
  - `-mod=mod`: auto-updates `go.mod`; not recommended for CI.
- **`go.work`** files should **not** be committed for libraries: "CI systems should generally not be allowed to use the `go.work` file so that they can test the behavior of the module as it would be used when required by other modules."
- **Standard CI pattern**: commit `go.mod` + `go.sum`; use the module cache with `-mod=readonly`, or vendoring with `-mod=vendor` for fully offline builds.

## HTTP, Retries, and File I/O

### Q9 — HTTP with retries, exponential backoff, Retry-After

- **`net/http` (stdlib)**: no built-in retry logic. `Retry-After` parsing is manual.
- **hashicorp/go-retryablehttp**: thin `http.Client` wrapper. `RateLimitLinearJitterBackoff` reads `Retry-After` on HTTP 429/503. Last published 2025-06-18. 2,571+ known importers. [pkg.go.dev](https://pkg.go.dev/github.com/hashicorp/go-retryablehttp).
- **cenkalti/backoff**: Go port of Google's exponential backoff. v4 stable (Jan 2024); v5 module path exists but appears pre-release. Backoff-only — no built-in HTTP or `Retry-After` parsing. [pkg.go.dev/v4](https://pkg.go.dev/github.com/cenkalti/backoff/v4).
- **sethvargo/go-retry**: zero deps; context-aware; Fibonacci, exponential, constant, jitter backoffs. Benchmark: ~203M ops/s (5.73 ns/op) vs cenkalti ~13M ops/s (87 ns/op). No HTTP/`Retry-After` built-in; caller returns `retry.RetryableError`. 676–707 stars; low recent activity per Snyk advisor.
- **avast/retry-go**: `BackOffDelay` (exponential) and `FullJitterBackoffDelay`. No `Retry-After` parsing. [pkg.go.dev](https://pkg.go.dev/github.com/avast/retry-go).

> **User input (2026-05-10):** `avast/retry-go` is the chosen retry library. Since the package itself does not parse `Retry-After`, that header handling will need to be implemented in the caller (e.g., a custom `RetryIf` plus `Delay`/`DelayType` reading the response header).

### Q10 — Atomic file writes and streaming large TSV/CSV

- **Atomic write (stdlib)**: `os.CreateTemp(dir, pattern)` in the **same directory as the target** (rename across filesystems is not atomic), then `os.Rename(tmp, dst)`. On POSIX this is a single `rename(2)` syscall and is atomic. [pkg.go.dev/os#CreateTemp](https://pkg.go.dev/os#CreateTemp).
- **google/renameio v2**: wraps `CreateTemp` + `Rename` with `Cleanup()` on error and cross-filesystem guards. Latest v2 published 2021-10-02. Used by golangci-lint. **Windows explicitly unsupported** per package docs. [pkg.go.dev/v2](https://pkg.go.dev/github.com/google/renameio/v2).
- **Streaming CSV/TSV (`encoding/csv`)**: `csv.NewReader(r).Read()` in a loop streams one record at a time. `ReadAll()` loads everything — avoid for large files.
  - Footgun: with `LazyQuotes` enabled, malformed CSV can cause the reader to buffer the entire file as a single field ([golang/go#8059](https://github.com/golang/go/issues/8059), [#20169](https://github.com/golang/go/issues/20169)).
- **`bufio.Scanner` for line-by-line TSV**: default max token size **64 KB**. Lines longer cause `bufio.ErrTooLong` unless `scanner.Buffer(buf, maxSize)` is called first (e.g., `32<<20` for 32 MB). For TSV with predictable widths, `bufio.Scanner` + `strings.Split('\t')` is a common low-memory alternative.

### Q11 — Logging libraries (2026 status)

- **`log/slog` (stdlib)**: added in **Go 1.21** (Aug 2023). Stable. Structured KV API; swappable `slog.Handler`; zerolog and zap both ship slog-compatible handlers. Benchmark: ~650 ns/op, 40 B/op — fewest allocations of the three. Convergence as default for new projects per 2026 ecosystem surveys. [go.dev/blog/slog](https://go.dev/blog/slog).
- **rs/zerolog**: fastest of the three; benchmarks up to ~50,000 logs/sec with near-zero heap allocations using a builder/chaining API. Native API is fastest; the slog bridge is notably slower than native.
- **uber-go/zap**: ~420 ns/op. Production-proven at Uber's scale. Two APIs: fast `zap.Logger` (typed fields) and ergonomic `zap.SugaredLogger` (printf-style, ~50% slower).

Approximate benchmark table from cited sources:

| Library | Speed (ns/op) | Allocs/op | stdlib |
|---|---|---|---|
| zerolog (native) | fastest | ~0 | No |
| zap | ~420 | low | No |
| log/slog | ~650 | 40 B | Yes |

Sources: [Dash0 (2026)](https://www.dash0.com/guides/golang-logging-libraries), [Uptrace (2025)](https://uptrace.dev/blog/golang-logging).

### Q12 — Environment-variable configuration

- **`os.Getenv` / `os.LookupEnv` (stdlib)**: `Getenv` returns empty string for missing keys; `LookupEnv` returns `(value, ok)`. No file loading, no struct binding.
- **joho/godotenv**: direct equivalent of Node's `dotenv`. `godotenv.Load()` or `Overload()` reads `.env` into `os.Environ`. ~10,100 stars. v1.5.1 latest. Maintainer declared the project "complete" in June 2022 — bug fixes only, no new features.
- **caarlos0/env**: zero dependencies. Parses env into struct via tags (`env:"KEY,required"`). Latest **v11.3.1** (2024-12-20). ~6,000 stars. Actively maintained. Commonly paired with `godotenv.Load()` for local dev.
- **kelseyhightower/envconfig**: struct-tag binding with prefix support. Older but still used; no recent major activity.
- **spf13/viper**: full config (env + YAML/JSON/TOML + etcd/Consul + CLI flags). Used by Hugo, Docker Notary. Significant dependency weight; overkill for env-only.

Typical local-dev pattern:
```go
import "github.com/joho/godotenv"
_ = godotenv.Load() // load only if present; ignore error in prod
// then os.Getenv or caarlos0/env
```

## Data Formats & Validation

### Q13 — Validating upstream JSON shape

- **`encoding/json` struct tags**: `` `json:"name,options"` ``. Options: `omitempty`, `omitzero`, `string`, `-`. Unknown keys silently dropped by default.
- **`DisallowUnknownFields`**: `json.NewDecoder(r).DisallowUnknownFields()` errors on unknown keys. Added Go 1.10. Only on `json.Decoder`, not `json.Unmarshal`.
- **go-playground/validator/v10**: runs tag-driven rules after decode. Separate `validate:"..."` tag. Rules: `required`, `min`, `max`, `gt`, `eqfield`, etc. Errors come as `validator.ValidationErrors`.
  ```go
  type Obs struct {
      Value float64 `json:"value" validate:"required,gt=0"`
  }
  validate := validator.New(validator.WithRequiredStructEnabled())
  err := validate.Struct(obs)
  ```
- **invopop/jsonschema + gojsonschema**: complementary — generate schema from Go types at startup/build time, validate raw JSON at runtime before unmarshaling.
- **`encoding/json/v2` status (2026-05-10)**: experimental in Go 1.25, gated by `GOEXPERIMENT=jsonv2`. **Did NOT graduate in Go 1.26.** A working group was formed 2025-11-20 to prepare formal adoption. Not stable for production. [go.dev/blog/jsonv2-exp](https://go.dev/blog/jsonv2-exp), [#71497](https://github.com/golang/go/issues/71497).

### Q14 — Large CSV/TSV with mixed types, embedded quotes, streaming filter

Standard library `encoding/csv` — key config on `csv.Reader`:

| Field | Purpose |
|---|---|
| `Comma = '\t'` | TSV |
| `LazyQuotes = true` | Accept embedded/unescaped quotes |
| `FieldsPerRecord = -1` | Variable column counts |
| `FieldsPerRecord = N` | Enforce exactly N fields |
| `TrimLeadingSpace = true` | Strip leading whitespace |

All values returned as `[]string`; type conversion is the caller's job (`strconv.ParseFloat`, etc.). No built-in filter — idiom is explicit row-by-row check:

```go
r := csv.NewReader(f)
r.Comma = '\t'
r.LazyQuotes = true
for {
    rec, err := r.Read()
    if err == io.EOF { break }
    if err != nil { /* handle */ }
    if rec[stateColIdx] != "MD" { continue }
    // process rec
}
```

**gocarina/gocsv**: maps rows to structs via `csv:"column_name"` tags. Uses reflection. Default `UnmarshalFile`-style is non-streaming, but `UnmarshalToCallback` supports row-at-a-time processing. Adds a dependency. [pkg.go.dev/encoding/csv](https://pkg.go.dev/encoding/csv).

### Q15 — Nullable numerics with sentinel strings like `"."`

Three idiomatic patterns:

**1. Custom `UnmarshalJSON` on a wrapper type** (most idiomatic for sentinel strings):
```go
type MaybeFloat struct {
    Val   float64
    Valid bool
}
func (m *MaybeFloat) UnmarshalJSON(data []byte) error {
    var raw interface{}
    if err := json.Unmarshal(data, &raw); err != nil { return err }
    switch v := raw.(type) {
    case float64:
        m.Val, m.Valid = v, true
    case string:
        if v == "." { m.Valid = false; return nil }
        f, err := strconv.ParseFloat(v, 64)
        if err != nil { return err }
        m.Val, m.Valid = f, true
    case nil:
        m.Valid = false
    }
    return nil
}
```

**2. `database/sql.NullFloat64`-style optional types**: stdlib `sql.NullFloat64` has `{Float64, Valid}` but implements `Scanner` only — **not** `json.Unmarshaler`. Doesn't handle sentinel strings without adding a custom `UnmarshalJSON`. Go 1.22+ adds generic `sql.Null[T]`. Third-party `guregu/null` and `emvi/null` add `json.Marshaler`/`Unmarshaler` for `null` but not custom string sentinels.

**3. `json.RawMessage` + post-process**: capture bytes, then inspect:
```go
type Observation struct { Value json.RawMessage `json:"value"` }
func parseValue(raw json.RawMessage) (float64, bool) {
    s := string(raw)
    if s == `"."` || s == "null" { return 0, false }
    f, err := strconv.ParseFloat(s, 64)
    return f, err == nil
}
```

Sources: [pkg.go.dev/encoding/json](https://pkg.go.dev/encoding/json), [pkg.go.dev/database/sql#NullFloat64](https://pkg.go.dev/database/sql#NullFloat64).

## Testing & CI

### Q16 — Mocking upstream HTTP in tests

- **`net/http/httptest`**: `NewServer(handler)` starts a real loopback HTTP listener; tests point clients at `.URL`. `NewTLSServer` for TLS. `NewUnstartedServer` for deferred start. `NewRecorder` implements `http.ResponseWriter` in memory for unit-level handler calls.
- **h2non/gock**: intercepts outgoing HTTP by replacing `http.DefaultTransport` with a custom `RoundTripper`. Non-default clients require `gock.InterceptClient(client)` and `gock.RestoreClient(client)` cleanup. Mocks match in FIFO order on method, URL, headers, body. No server is spun up — interception is in-process. [github.com/h2non/gock](https://github.com/h2non/gock).
- **dnaeon/go-vcr**: records HTTP interactions to YAML "cassette" files on first run, replays on later runs. Injects a custom `http.Transport`. Modes: `ModeRecordOnly`, `ModeReplayOnly`, `ModeReplayWithNewEpisodes`. `SaveFilter` hook redacts sensitive data. Current major: v3 (`gopkg.in/dnaeon/go-vcr.v3`). [github.com/dnaeon/go-vcr](https://github.com/dnaeon/go-vcr).
- **Table-driven tests**: canonical idiom is a slice of structs (`name`, `in`, `want`) iterated with `t.Run(tt.name, func(t *testing.T) {...})`. `t.Errorf` (not `t.Fatalf`) so all failures surface in one run. **Go 1.22+ fixed the loop-variable scoping** — `tt := tt` shadow is no longer required. [go.dev/wiki/TableDrivenTests](https://go.dev/wiki/TableDrivenTests).

### Q17 — Integration tests, testdata, golden-file tooling

- **`testdata/` convention**: the `go` tool ignores any directory named `testdata`, making it the standard location for fixture inputs, expected output, and fuzz seed corpora (`testdata/fuzz/<FuzzTestName>/`). Used by the standard library itself. [pkg.go.dev/testing](https://pkg.go.dev/testing).
- **Integration test organization**: two common patterns. (1) Build-tag separation: `//go:build integration` files run via `go test -tags=integration ./...`. (2) Naming suffix separation: `*_integration_test.go` or `*_system_test.go` with build tags. Multi-package integration tests live in a top-level `integration/` or `e2e/` directory outside the SUT tree.
- **sebdah/goldie (v2)**: stores golden files in `testdata/` by default (changed from custom dir in v2.0.0). `go test -update ./...` writes current actual as new golden. API: `goldie.Assert`, `AssertJson`, `AssertXml`, `AssertWithTemplate`. [pkg.go.dev/v2](https://pkg.go.dev/github.com/sebdah/goldie/v2).
- **hexops/autogold**: stores expected values as **Go syntax inside `_test.go` files** (`autogold.Expect(want)`). `go test -update` rewrites the `want` argument in place via callstack line-number matching. `-update -clean` removes unused goldens. Does not fail on update by default; opt-in via `-fail-on-update`. [github.com/hexops/autogold](https://github.com/hexops/autogold).
- **gotest.tools/v3 golden**: stores files in `./testdata/` relative to test file. API: `golden.Assert(t, actual, filename)`, `golden.AssertBytes`, `golden.Get`. `-update` via `golden.FlagUpdate()`. [pkg.go.dev/gotest.tools/v3/golden](https://pkg.go.dev/gotest.tools/v3/golden).

### Q18 — GitHub Actions caching for Go vs npm

- **`actions/setup-go` built-in cache (v4+, default since 2023-03-24)**: enabled by default with `cache: true`. Caches `~/go/pkg/mod` (`GOMODCACHE`) and `~/.cache/go-build` (`GOCACHE`). Default cache key = OS + hash of `go.sum` at repo root. For monorepos, `cache-dependency-path` accepts globs. Disable: `cache: false`. [Changelog](https://github.blog/changelog/2023-03-24-github-actions-the-setup-go-action-now-enables-caching-by-default/).
- **Manual `actions/cache` pattern** (pre-v4 or custom keys):
  ```yaml
  - uses: actions/cache@v3
    with:
      path: |
        ~/go/pkg/mod
        ~/.cache/go-build
      key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
      restore-keys: |
        ${{ runner.os }}-go-
  ```
- **Cache-key debate**: tracked in [actions/setup-go#478](https://github.com/actions/setup-go/issues/478) — `go.sum` is append-only and not a strict lock file; some argue `go.mod` is more stable. Default remains `go.sum`.
- **Performance vs npm** (from separate public benchmarks, not controlled):
  - Go without cache: ~1m20s; with module+build cache: ~18s (~75% reduction).
  - npm without cache: ~3m30s of ~5m30s build; `node_modules` cache restore: ~30s.
  - npm caches only the package download (`~/.npm`), not compiled artifacts. Go's `~/.cache/go-build` adds a compile-artifact cache layer npm has no equivalent for.
  - Both ecosystems show 40–80% CI time reductions from effective caching.

Sources: [actuated.com caching](https://actuated.com/blog/caching-in-github-actions), [danp.net Go cache](https://danp.net/posts/github-actions-go-cache/), [actions/cache](https://github.com/actions/cache).

## Open Questions

- **Q18 (caching comparison)**: No reproducible, controlled benchmark directly comparing Go vs. npm cache hit time savings on identical hardware was found. Numbers reported are from separate posts with different project sizes.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/go-ingest-refactor/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `go-ingest-refactor`.
