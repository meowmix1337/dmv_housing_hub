# Questions

### Language & Runtime

1. What is the current release status of Go 1.26 — is it generally available, in beta, or unreleased — and what is its expected support window?
2. What language and standard-library features have changed between the most recent stable Go release and 1.26 that are relevant to networked data-fetching and JSON processing?
3. What are the recommended minimum versions of golangci-lint, gopls, and other tooling that fully support Go 1.26?
4. How does Go 1.26 behave under GitHub Actions' `ubuntu-latest` runners — is there a stable `setup-go` action version that supports it, and is a toolchain directive in `go.mod` required?

### Project Structure & Build

5. What are the prevailing conventions for laying out a Go CLI workspace that contains multiple related commands (e.g., one ingester per source plus a transform step), including `cmd/`, `internal/`, and module boundaries?
6. How are Go projects typically integrated alongside a Node.js workspace in a monorepo when both produce artifacts consumed by the same web build?
7. What are the available approaches in Go for sharing type definitions with a TypeScript consumer (code generation from Go structs to TS, schema-first via JSON Schema or Protobuf, etc.), and what are their trade-offs?
8. How is dependency management handled in Go modules for reproducible CI builds — what is the role of `go.sum`, vendoring, and the `GOFLAGS=-mod=...` setting?

### HTTP, Retries, and File I/O

9. What standard-library and well-maintained third-party packages are commonly used in Go for HTTP fetching with retries, exponential backoff, and respect for `Retry-After` headers?
10. What patterns exist in Go for atomic file writes (temp file + rename) and for streaming large TSV/CSV files without loading them fully into memory?
11. What logging libraries are idiomatic for Go in 2026 (e.g., `log/slog`, zerolog, zap), and how do they compare on structured output, performance, and ergonomics?
12. How is environment-variable configuration typically loaded in Go CLIs, and what libraries (if any) are equivalent to Node's `dotenv` for local development without committing secrets?

### Data Formats & Validation

13. What are the idiomatic approaches in Go for validating the shape of upstream JSON responses (struct tags, `encoding/json` decoders, third-party validators like `go-playground/validator`)?
14. How do Go libraries handle large CSV/TSV files with mixed types and embedded quotes, and what is the standard approach for filtering rows by column value while streaming?
15. What patterns exist in Go for representing nullable numeric observations where upstream may send sentinel strings like `"."` instead of `null`?

### Testing & CI

16. What testing patterns are standard in Go for HTTP clients that need to mock upstream APIs deterministically (httptest, recorded fixtures, table-driven tests)?
17. How are integration tests and golden-file tests typically organized in Go projects, and what tooling exists for snapshot comparison of generated JSON output?
18. What GitHub Actions patterns exist for caching Go build artifacts and module downloads, and how do they compare to npm caching in build-time impact?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/go-ingest-refactor/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `go-ingest-refactor`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
