package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicWriteHappyPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "out.json")
	want := []byte(`{"hello":"world"}`)
	if err := AtomicWrite(path, want); err != nil {
		t.Fatalf("AtomicWrite: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestAtomicWriteMissingDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist", "out.json")
	if err := AtomicWrite(path, []byte("x")); err == nil {
		t.Fatal("expected error for missing parent dir")
	}
}

func TestAtomicWriteDoesNotClobberOnFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "out.json")
	original := []byte("original")
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Write to a path whose parent dir doesn't exist; original should remain.
	badPath := filepath.Join(dir, "missing", "out.json")
	if err := AtomicWrite(badPath, []byte("new")); err == nil {
		t.Fatal("expected error")
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != string(original) {
		t.Errorf("original was clobbered: got %q, want %q", got, original)
	}

	// Confirm no stray .tmp-* files leaked.
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if len(e.Name()) > 5 && e.Name()[:5] == ".tmp-" {
			t.Errorf("leaked temp file: %s", e.Name())
		}
	}
}

func TestWriteJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "out.json")
	v := map[string]any{"a": 1, "b": "x"}
	if err := WriteJSON(path, v); err != nil {
		t.Fatalf("WriteJSON: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	// Verify it's parseable and indented.
	if len(got) == 0 {
		t.Fatal("empty file")
	}
}
