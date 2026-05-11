// Package log builds an slog.Logger with JSON output in non-interactive
// environments (CI, redirected stderr) and human-friendly text output on a TTY.
package log

import (
	"log/slog"
	"os"
	"sync"

	"golang.org/x/term"
)

var (
	once    sync.Once
	logger  *slog.Logger
)

func New() *slog.Logger {
	var handler slog.Handler
	if term.IsTerminal(int(os.Stderr.Fd())) {
		handler = slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	return slog.New(handler)
}

func Default() *slog.Logger {
	once.Do(func() {
		logger = New()
	})
	return logger
}
