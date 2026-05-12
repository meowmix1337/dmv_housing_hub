package counties

import "testing"

func TestAll(t *testing.T) {
	cs := All()
	if got, want := len(cs), 21; got != want {
		t.Errorf("All() len: got %d, want %d (1 DC + 9 MD + 11 VA)", got, want)
	}
}

func TestByFIPS(t *testing.T) {
	c, ok := ByFIPS("11001")
	if !ok || c.Name != "District of Columbia" {
		t.Errorf("ByFIPS(11001): got (%v, %v)", c, ok)
	}
	if _, ok := ByFIPS("00000"); ok {
		t.Error("ByFIPS unknown should be !ok")
	}
}

func TestByJurisdiction(t *testing.T) {
	if got := len(ByJurisdiction("DC")); got != 1 {
		t.Errorf("DC: got %d, want 1", got)
	}
	if got := len(ByJurisdiction("MD")); got != 9 {
		t.Errorf("MD: got %d, want 9", got)
	}
	if got := len(ByJurisdiction("VA")); got != 11 {
		t.Errorf("VA: got %d, want 11", got)
	}
}
