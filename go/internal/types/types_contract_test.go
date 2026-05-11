package types

import (
	"bytes"
	"encoding/json"
	"os"
	"sort"
	"testing"
)

// TestCountySummaryRoundTrip decodes a real CountySummary golden into the Go
// struct, re-encodes it, and asserts byte-equivalence after key-sorting both
// sides. This catches any drift between shared/src/types.ts and types.go.
func TestCountySummaryRoundTrip(t *testing.T) {
	data, err := os.ReadFile("testdata/county_summary_golden.sorted.json")
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}

	var cs CountySummary
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cs); err != nil {
		t.Fatalf("decode golden: %v", err)
	}

	gotBytes, err := json.Marshal(cs)
	if err != nil {
		t.Fatalf("re-encode: %v", err)
	}

	wantSorted, err := canonicalize(data)
	if err != nil {
		t.Fatalf("canonicalize golden: %v", err)
	}
	gotSorted, err := canonicalize(gotBytes)
	if err != nil {
		t.Fatalf("canonicalize got: %v", err)
	}

	if !bytes.Equal(wantSorted, gotSorted) {
		t.Errorf("round-trip differs.\n--- want ---\n%s\n--- got ---\n%s",
			truncate(wantSorted), truncate(gotSorted))
	}
}

func TestMetricIdValid(t *testing.T) {
	all := []MetricId{
		MetricFhfaHpi, MetricMedianSalePrice, MetricMedianListPrice,
		MetricMedianPricePerSqft, MetricZhviAllHomes, MetricZhviSFH,
		MetricZhviCondo, MetricZoriRent, MetricActiveListings,
		MetricNewListings, MetricHomesSold, MetricMonthsSupply,
		MetricDaysOnMarket, MetricSaleToListRatio, MetricPctSoldAboveList,
		MetricPctPriceDrops, MetricMortgage30yRate, MetricMortgage15yRate,
		MetricMedianHouseholdInc, MetricMedianHomeValue, MetricMedianGrossRent,
		MetricUnemploymentRate, MetricFederalEmployment, MetricBuildingPermits,
		MetricHotnessScore, MetricHotnessRank, MetricPopulation,
	}
	for _, m := range all {
		if !m.Valid() {
			t.Errorf("expected %q to be valid", m)
		}
	}
	for _, bad := range []MetricId{"", "not_a_metric", "fhfa_HPI"} {
		if bad.Valid() {
			t.Errorf("expected %q to be invalid", bad)
		}
	}
}

func TestMaybeFloatRoundTrip(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantValid bool
		wantVal   float64
		wantJSON  string
	}{
		{"number", "3.14", true, 3.14, "3.14"},
		{"integer", "42", true, 42, "42"},
		{"null", "null", false, 0, "null"},
		{"dot sentinel", `"."`, false, 0, "null"},
		{"empty string", `""`, false, 0, "null"},
		{"stringified number", `"7.25"`, true, 7.25, "7.25"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var m MaybeFloat
			if err := json.Unmarshal([]byte(tt.input), &m); err != nil {
				t.Fatalf("unmarshal %q: %v", tt.input, err)
			}
			if m.Valid != tt.wantValid {
				t.Errorf("Valid: got %v, want %v", m.Valid, tt.wantValid)
			}
			if m.Valid && m.Val != tt.wantVal {
				t.Errorf("Val: got %v, want %v", m.Val, tt.wantVal)
			}
			out, err := json.Marshal(m)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if string(out) != tt.wantJSON {
				t.Errorf("marshal: got %s, want %s", string(out), tt.wantJSON)
			}
		})
	}
}

// canonicalize re-encodes JSON with sorted keys recursively, so two semantically
// equivalent documents become byte-identical for comparison.
func canonicalize(data []byte) ([]byte, error) {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}
	return marshalSorted(v)
}

func marshalSorted(v any) ([]byte, error) {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var buf bytes.Buffer
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			kb, _ := json.Marshal(k)
			buf.Write(kb)
			buf.WriteByte(':')
			vb, err := marshalSorted(t[k])
			if err != nil {
				return nil, err
			}
			buf.Write(vb)
		}
		buf.WriteByte('}')
		return buf.Bytes(), nil
	case []any:
		var buf bytes.Buffer
		buf.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			vb, err := marshalSorted(item)
			if err != nil {
				return nil, err
			}
			buf.Write(vb)
		}
		buf.WriteByte(']')
		return buf.Bytes(), nil
	default:
		return json.Marshal(v)
	}
}

func truncate(b []byte) string {
	const max = 400
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "...(truncated)"
}
