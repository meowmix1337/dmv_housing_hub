package transform

import "testing"

func TestParseVerificationMarkdown(t *testing.T) {
	md := `
# DMV Housing Hub data sources

## Sources

### fred

Stuff about FRED.

## Verification

### fred

- Last verified: 2026-05-10
- Notes: looks good

### census

- Last verified: 2026-05-10

### bls

- Last verified: bogus

### zillow

(no verification line)

## Next section

### Anything

- Last verified: 2099-01-01
`
	got := ParseVerificationMarkdown(md)
	got2 := make(map[string]string, len(got))
	for _, r := range got {
		got2[r.Source] = r.LastVerified
	}
	want := map[string]string{
		"fred":   "2026-05-10",
		"census": "2026-05-10",
	}
	if len(got2) != len(want) {
		t.Fatalf("got %v want %v", got2, want)
	}
	for k, v := range want {
		if got2[k] != v {
			t.Errorf("%s: got %q want %q", k, got2[k], v)
		}
	}
}
