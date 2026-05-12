// Package http wraps net/http with retry, exponential backoff, and Retry-After
// honoring. All ingesters share one Client.
package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/avast/retry-go/v4"
)

const defaultUserAgent = "dmv-housing-app/0.1 (+https://github.com/meowmix1337/dmv_housing_hub)"

type Options struct {
	Timeout    time.Duration
	MaxRetries uint
	UserAgent  string
}

func (o *Options) defaults() {
	if o.Timeout == 0 {
		o.Timeout = 30 * time.Second
	}
	if o.MaxRetries == 0 {
		o.MaxRetries = 3
	}
	if o.UserAgent == "" {
		o.UserAgent = defaultUserAgent
	}
}

type Client struct {
	inner *http.Client
	opts  Options
}

func New(opts Options) *Client {
	opts.defaults()
	return &Client{
		inner: &http.Client{Timeout: opts.Timeout},
		opts:  opts,
	}
}

// HTTPError represents a non-retryable upstream failure.
type HTTPError struct {
	Status      int
	URL         string
	BodyExcerpt string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("http %d %s: %s", e.Status, e.URL, e.BodyExcerpt)
}

// Do executes req with retry on 429/5xx and Retry-After honoring.
// Non-retryable 4xx responses (except 408 and 429) return *HTTPError immediately.
func (c *Client) Do(ctx context.Context, req *http.Request) (*http.Response, error) {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", c.opts.UserAgent)
	}
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json, text/csv, text/tab-separated-values, */*")
	}

	// Buffer body so retries can replay it.
	var bodyBytes []byte
	if req.Body != nil {
		b, err := io.ReadAll(req.Body)
		if err != nil {
			return nil, fmt.Errorf("read request body: %w", err)
		}
		_ = req.Body.Close()
		bodyBytes = b
	}

	var (
		lastResp *http.Response
		// retryAfter caches the wait time computed from the most recent response.
		retryAfter atomic.Int64 // nanoseconds; 0 means "not set"
	)

	err := retry.Do(
		func() error {
			if bodyBytes != nil {
				req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			}
			resp, err := c.inner.Do(req.WithContext(ctx))
			if err != nil {
				return err
			}
			lastResp = resp
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}

			excerpt := readExcerpt(resp.Body)
			_ = resp.Body.Close()
			lastResp = nil // drained; force retry path to start fresh

			if isRetryable(resp.StatusCode) {
				if d, ok := parseRetryAfter(resp.Header.Get("Retry-After"), time.Now()); ok {
					retryAfter.Store(int64(d))
				} else {
					retryAfter.Store(0)
				}
				return fmt.Errorf("retryable http %d: %s", resp.StatusCode, excerpt)
			}
			// Non-retryable: wrap so retry.Do sees an Unrecoverable error.
			return retry.Unrecoverable(&HTTPError{
				Status:      resp.StatusCode,
				URL:         req.URL.String(),
				BodyExcerpt: excerpt,
			})
		},
		retry.Context(ctx),
		retry.Attempts(c.opts.MaxRetries+1),
		retry.DelayType(func(n uint, err error, cfg *retry.Config) time.Duration {
			if d := retryAfter.Load(); d > 0 {
				retryAfter.Store(0)
				return time.Duration(d)
			}
			return retry.BackOffDelay(n, err, cfg)
		}),
		retry.LastErrorOnly(true),
	)

	if err != nil {
		var he *HTTPError
		if errors.As(err, &he) {
			return nil, he
		}
		return nil, err
	}
	return lastResp, nil
}

func (c *Client) GetJSON(ctx context.Context, url, label string, out any) error {
	resp, err := c.get(ctx, url, label)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("%s: decode json: %w", label, err)
	}
	return nil
}

func (c *Client) GetText(ctx context.Context, url, label string) (string, error) {
	resp, err := c.get(ctx, url, label)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("%s: read body: %w", label, err)
	}
	return string(b), nil
}

func (c *Client) GetBytes(ctx context.Context, url, label string) ([]byte, error) {
	resp, err := c.get(ctx, url, label)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%s: read body: %w", label, err)
	}
	return b, nil
}

func (c *Client) get(ctx context.Context, url, label string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("%s: build request: %w", label, err)
	}
	resp, err := c.Do(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", label, err)
	}
	return resp, nil
}

func isRetryable(status int) bool {
	switch status {
	case 408, 429:
		return true
	}
	return status >= 500 && status < 600
}

// parseRetryAfter handles both seconds-integer and HTTP-date forms.
func parseRetryAfter(v string, now time.Time) (time.Duration, bool) {
	if v == "" {
		return 0, false
	}
	if secs, err := strconv.Atoi(v); err == nil {
		if secs < 0 {
			return 0, true
		}
		return time.Duration(secs) * time.Second, true
	}
	if t, err := http.ParseTime(v); err == nil {
		d := t.Sub(now)
		if d < 0 {
			d = 0
		}
		return d, true
	}
	return 0, false
}

func readExcerpt(r io.Reader) string {
	buf := make([]byte, 512)
	n, _ := io.ReadFull(r, buf)
	if n == 0 {
		return "<no body>"
	}
	return string(buf[:n])
}
