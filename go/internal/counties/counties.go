// Package counties is the canonical DMV county list, mirroring scripts/lib/counties.ts.
package counties

import "github.com/meowmix1337/dmv_housing_hub/go/internal/types"

type County struct {
	FIPS              string             `json:"fips"`
	Name              string             `json:"name"`
	ShortName         string             `json:"shortName"`
	Jurisdiction      types.Jurisdiction `json:"jurisdiction"`
	IsIndependentCity bool               `json:"isIndependentCity,omitempty"`
	StateFips         string             `json:"stateFips"`
	CountyFips        string             `json:"countyFips"`
}

var all = []County{
	// DC
	{FIPS: "11001", Name: "District of Columbia", ShortName: "DC", Jurisdiction: types.JurisdictionDC, StateFips: "11", CountyFips: "001"},

	// MD
	{FIPS: "24003", Name: "Anne Arundel County", ShortName: "Anne Arundel", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "003"},
	{FIPS: "24005", Name: "Baltimore County", ShortName: "Baltimore Co.", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "005"},
	{FIPS: "24009", Name: "Calvert County", ShortName: "Calvert", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "009"},
	{FIPS: "24017", Name: "Charles County", ShortName: "Charles", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "017"},
	{FIPS: "24021", Name: "Frederick County", ShortName: "Frederick", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "021"},
	{FIPS: "24027", Name: "Howard County", ShortName: "Howard", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "027"},
	{FIPS: "24031", Name: "Montgomery County", ShortName: "Montgomery", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "031"},
	{FIPS: "24033", Name: "Prince George's County", ShortName: "Prince George's", Jurisdiction: types.JurisdictionMD, StateFips: "24", CountyFips: "033"},
	{FIPS: "24510", Name: "Baltimore city", ShortName: "Baltimore City", Jurisdiction: types.JurisdictionMD, IsIndependentCity: true, StateFips: "24", CountyFips: "510"},

	// VA
	{FIPS: "51013", Name: "Arlington County", ShortName: "Arlington", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "013"},
	{FIPS: "51059", Name: "Fairfax County", ShortName: "Fairfax", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "059"},
	{FIPS: "51107", Name: "Loudoun County", ShortName: "Loudoun", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "107"},
	{FIPS: "51153", Name: "Prince William County", ShortName: "Prince William", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "153"},
	{FIPS: "51177", Name: "Spotsylvania County", ShortName: "Spotsylvania", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "177"},
	{FIPS: "51179", Name: "Stafford County", ShortName: "Stafford", Jurisdiction: types.JurisdictionVA, StateFips: "51", CountyFips: "179"},
	{FIPS: "51510", Name: "Alexandria city", ShortName: "Alexandria", Jurisdiction: types.JurisdictionVA, IsIndependentCity: true, StateFips: "51", CountyFips: "510"},
	{FIPS: "51600", Name: "Fairfax city", ShortName: "Fairfax City", Jurisdiction: types.JurisdictionVA, IsIndependentCity: true, StateFips: "51", CountyFips: "600"},
	{FIPS: "51610", Name: "Falls Church city", ShortName: "Falls Church", Jurisdiction: types.JurisdictionVA, IsIndependentCity: true, StateFips: "51", CountyFips: "610"},
	{FIPS: "51683", Name: "Manassas city", ShortName: "Manassas", Jurisdiction: types.JurisdictionVA, IsIndependentCity: true, StateFips: "51", CountyFips: "683"},
	{FIPS: "51685", Name: "Manassas Park city", ShortName: "Manassas Park", Jurisdiction: types.JurisdictionVA, IsIndependentCity: true, StateFips: "51", CountyFips: "685"},
}

func All() []County {
	out := make([]County, len(all))
	copy(out, all)
	return out
}

func ByFIPS(fips string) (County, bool) {
	for _, c := range all {
		if c.FIPS == fips {
			return c, true
		}
	}
	return County{}, false
}

func ByName(name string) (County, bool) {
	for _, c := range all {
		if c.Name == name {
			return c, true
		}
	}
	return County{}, false
}

func ByJurisdiction(j types.Jurisdiction) []County {
	out := make([]County, 0)
	for _, c := range all {
		if c.Jurisdiction == j {
			out = append(out, c)
		}
	}
	return out
}
