package transform

import (
	"os"
	"regexp"
	"strings"
)

// VerificationRecord pairs a source name with its last-verified ISO date.
type VerificationRecord struct {
	Source       string
	LastVerified string
}

var (
	isoDateRe     = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	subsectionRe  = regexp.MustCompile(`(?m)^### (\S+)$`)
	lastVerifyRe  = regexp.MustCompile(`(?i)Last verified:\s*(\S+)`)
)

// ParseVerificationMarkdown extracts "Last verified: YYYY-MM-DD" entries from
// the `## Verification` section of DATA_SOURCES.md, keyed by `### <source>`.
// Mirrors scripts/lib/verification.ts.
func ParseVerificationMarkdown(markdown string) []VerificationRecord {
	const header = "\n## Verification"
	start := strings.Index(markdown, header)
	if start == -1 {
		return nil
	}
	tail := markdown[start+1:]
	// Section ends at the next top-level "## " heading (but not "### ").
	end := len(tail)
	// search for "\n## " not "\n###"
	for i := 0; i < len(tail)-3; i++ {
		if tail[i] == '\n' && tail[i+1] == '#' && tail[i+2] == '#' && tail[i+3] == ' ' {
			// require char i+4 != '#' (which would have been matched as "### " — but since we required " ", we're good)
			if i > 0 { // skip the initial "## Verification" header at i==0 after slicing
				end = i
				break
			}
		}
	}
	section := tail[:end]

	// Find each "### <source>" subsection.
	loc := subsectionRe.FindAllStringSubmatchIndex(section, -1)
	if loc == nil {
		return nil
	}

	var out []VerificationRecord
	for i, m := range loc {
		nameStart, nameEnd := m[2], m[3]
		source := strings.TrimSpace(section[nameStart:nameEnd])
		if source == "" {
			continue
		}
		bodyStart := m[1]
		bodyEnd := len(section)
		if i+1 < len(loc) {
			bodyEnd = loc[i+1][0]
		}
		body := section[bodyStart:bodyEnd]
		dm := lastVerifyRe.FindStringSubmatch(body)
		if len(dm) < 2 {
			continue
		}
		date := strings.TrimSpace(dm[1])
		if !isoDateRe.MatchString(date) {
			continue
		}
		out = append(out, VerificationRecord{Source: source, LastVerified: date})
	}
	return out
}

// ReadVerificationFromMarkdown reads a DATA_SOURCES.md-style file and parses
// it. Missing or unreadable files yield an empty result rather than an error.
func ReadVerificationFromMarkdown(path string) []VerificationRecord {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return ParseVerificationMarkdown(string(data))
}
