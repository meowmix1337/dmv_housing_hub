package http

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

func TestRetryAfterHonored(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		if n == 1 {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "slow down", http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := New(Options{MaxRetries: 3})
	start := time.Now()
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	resp, err := c.Do(context.Background(), req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	elapsed := time.Since(start)
	if elapsed < 950*time.Millisecond {
		t.Errorf("expected >= 1s wait for Retry-After, got %v", elapsed)
	}
	if resp.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("calls: got %d, want 2", got)
	}
}

func TestNonRetryable4xx(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "nope", http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(Options{MaxRetries: 5})
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	_, err := c.Do(context.Background(), req)
	if err == nil {
		t.Fatal("expected error")
	}
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 404 {
		t.Errorf("expected *HTTPError 404, got %T %v", err, err)
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("calls: got %d, want 1 (no retry)", got)
	}
}

func TestRetryOn5xx(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		if n < 3 {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	c := New(Options{MaxRetries: 5})
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	resp, err := c.Do(context.Background(), req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	if got := calls.Load(); got != 3 {
		t.Errorf("calls: got %d, want 3", got)
	}
}

func TestParseRetryAfter(t *testing.T) {
	now := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		v    string
		ok   bool
		want time.Duration
	}{
		{"", false, 0},
		{"3", true, 3 * time.Second},
		{"0", true, 0},
		{strconv.Itoa(-5), true, 0},
		{"Sun, 10 May 2026 12:00:30 GMT", true, 30 * time.Second},
		{"Sun, 10 May 2026 11:59:30 GMT", true, 0}, // past dates clamp to 0
		{"garbage", false, 0},
	}
	for _, tt := range tests {
		got, ok := parseRetryAfter(tt.v, now)
		if ok != tt.ok {
			t.Errorf("parseRetryAfter(%q).ok = %v, want %v", tt.v, ok, tt.ok)
			continue
		}
		if ok && got != tt.want {
			t.Errorf("parseRetryAfter(%q) = %v, want %v", tt.v, got, tt.want)
		}
	}
}
