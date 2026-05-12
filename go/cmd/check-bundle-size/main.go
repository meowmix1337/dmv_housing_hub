// Command check-bundle-size walks web/dist/assets for .js bundles, computes
// each one's gzipped size, and fails if any chunk exceeds the budget.
// Ports scripts/check-bundle-size.ts: per-file 500 kB gzipped cap.
package main

import (
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const budgetBytes = 500 * 1024

func main() {
	// Resolve web/dist/assets relative to repo root. The expected invocation is
	// from go/ (Makefile sets cwd there); fall back to current directory if
	// invoked elsewhere.
	candidates := []string{
		filepath.Join("..", "web", "dist", "assets"),
		filepath.Join("web", "dist", "assets"),
	}
	var distDir string
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			distDir = c
			break
		}
	}
	if distDir == "" {
		fmt.Fprintf(os.Stderr, "check-bundle-size: web/dist/assets not found; run `npm run build` first\n")
		os.Exit(1)
	}

	entries, err := os.ReadDir(distDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", distDir, err)
		os.Exit(1)
	}

	type result struct {
		name string
		gz   int
	}
	var results []result
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".js") {
			continue
		}
		gz, err := gzipSize(filepath.Join(distDir, e.Name()))
		if err != nil {
			fmt.Fprintf(os.Stderr, "gzip %s: %v\n", e.Name(), err)
			os.Exit(1)
		}
		results = append(results, result{name: e.Name(), gz: gz})
	}

	sort.Slice(results, func(i, j int) bool { return results[i].gz > results[j].gz })

	failed := false
	for _, r := range results {
		kb := float64(r.gz) / 1024
		headroom := float64(budgetBytes-r.gz) / 1024
		status := fmt.Sprintf("headroom: %.1f kB", headroom)
		if r.gz > budgetBytes {
			status = "✗ OVER BUDGET"
			failed = true
		}
		fmt.Printf("%7.1f kB gz  %-20s  %s\n", kb, status, r.name)
	}

	if len(results) > 0 {
		fmt.Printf("\nlargest: %.1f kB / budget 500 kB\n", float64(results[0].gz)/1024)
	}

	if failed {
		fmt.Fprintln(os.Stderr, "\nBundle size check FAILED: one or more chunks exceed 500 kB gz")
		os.Exit(1)
	}
}

// gzipSize streams the file through gzip and counts bytes written. Default
// gzip.BestSpeed differs from Node's createGzip() default, which mirrors
// gzip(1)'s level 6; we match Node by leaving compression at the default
// level (gzip.DefaultCompression).
func gzipSize(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer func() { _ = f.Close() }()

	var count int
	cw := writeCounter{count: &count}
	gz := gzip.NewWriter(&cw)
	if _, err := io.Copy(gz, f); err != nil {
		return 0, err
	}
	if err := gz.Close(); err != nil {
		return 0, err
	}
	return count, nil
}

type writeCounter struct {
	count *int
}

func (w *writeCounter) Write(p []byte) (int, error) {
	*w.count += len(p)
	return len(p), nil
}
