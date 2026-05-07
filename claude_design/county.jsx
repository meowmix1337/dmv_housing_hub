/* global React, Recharts */
const { useState: useStateCounty, useMemo: useMemoCounty } = React;
const {
  LineChart: LC, Line: LL, AreaChart: AC, Area: AA, BarChart: BC, Bar: BB,
  XAxis: XA, YAxis: YA, Tooltip: TT, ResponsiveContainer: RC,
  ReferenceLine: RL, ReferenceArea: RA, CartesianGrid: CG, Legend: LG,
} = Recharts;

function CountyPage({ fips, onBack, onPickCounty }) {
  const c = window.COUNTY_DETAIL[fips];
  if (!c) return <div style={{ padding: 64 }}>County not found.</div>;

  return (
    <main style={{ background: "var(--bg-paper)", minHeight: "100vh" }}>
      <CountyHeader c={c} onBack={onBack} />
      <window.Container style={{ marginTop: 32 }}>
        <CountySnapshot c={c} />
      </window.Container>
      <window.Container style={{ marginTop: 64 }}>
        <BigChart c={c} />
      </window.Container>
      <window.Container style={{ marginTop: 64 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32 }}>
          <Affordability c={c} />
          <MarketHealthBreakdown c={c} />
        </div>
      </window.Container>
      <window.Container style={{ marginTop: 64 }}>
        <ForecastCone c={c} />
      </window.Container>
      <window.Container style={{ marginTop: 64 }}>
        <FederalExposure c={c} />
      </window.Container>
    </main>
  );
}

// ============= Header =============
function CountyHeader({ c, onBack }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border-soft)", background: "var(--bg-paper)" }}>
      <window.Container style={{ paddingTop: 32, paddingBottom: 32 }}>
        <button onClick={onBack} style={{
          background: "transparent", border: "none", padding: 0,
          fontSize: 13, color: "var(--fg-2)", cursor: "pointer",
          fontFamily: "var(--font-body)", marginBottom: 16,
        }}>← Back to overview</button>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 48, alignItems: "end" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <window.JurisdictionBadge j={c.jurisdiction} />
              <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>FIPS {c.fips}</span>
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>·</span>
              <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
                Pop. {c.population.toLocaleString("en-US")}
              </span>
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600,
              letterSpacing: "-0.022em", lineHeight: 1.05, color: "var(--fg-1)",
            }}>{c.name}</h1>
            <p style={{ marginTop: 14, fontSize: 16, color: "var(--fg-2)", lineHeight: 1.55, maxWidth: 620 }}>
              {c.summary}
            </p>
          </div>
          <div style={{
            background: "var(--surface-1)", border: "1px solid var(--border-soft)",
            borderRadius: 12, padding: 16, fontSize: 13,
          }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>At a glance</div>
            <KV k="Median household income" v={window.fmtMoney(c.income)} />
            <KV k="Property tax rate" v={(c.propertyTaxRate * 100).toFixed(2) + "%"} />
            <KV k="Federal-job exposure" v={(c.fedExposure * 100).toFixed(0) + "% of jobs"} last />
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Data current as of {window.METRO.lastUpdated}
        </div>
      </window.Container>
    </div>
  );
}

function KV({ k, v, last }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "6px 0", borderBottom: last ? "none" : "1px solid var(--border-soft)",
    }}>
      <span style={{ color: "var(--fg-3)" }}>{k}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

// ============= Snapshot row =============
function CountySnapshot({ c }) {
  const cards = [
    { label: "Typical home value", value: window.fmtMoney(c.zhvi), change: c.zhviYoY, source: "Zillow ZHVI" },
    { label: "Median sale price",  value: window.fmtMoney(c.medianSalePrice), change: c.zhviYoY * 0.9, source: "Redfin · monthly" },
    { label: "Days on market",     value: c.daysOnMarket + " days", source: "Redfin · Apr 2026" },
    { label: "Months of supply",   value: c.monthsSupply.toFixed(1) + " mo", source: "Bright MLS" },
    { label: "Market health",      value: Math.round(c.marketHealth) + " / 100", source: "Composite", health: c.marketHealth },
    { label: "Affordability",      value: (c.affordability * 100).toFixed(0) + "% of income", source: "vs. 30% rule" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
      {cards.map((m, i) => <SnapshotCard key={i} {...m} />)}
    </div>
  );
}

function SnapshotCard({ label, value, change, source, health }) {
  const color = change != null ? window.dirColor(change) : null;
  const hc = health != null ? window.healthColor(health) : null;
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 14,
      border: "1px solid var(--border-soft)", padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 4, minHeight: 116,
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600,
        letterSpacing: "-0.015em", color: hc || "var(--fg-1)", fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
      }}>{value}</div>
      {change != null && (
        <div style={{ fontSize: 12, color, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
          {window.fmtPct(change, { signed: true })} <span style={{ color: "var(--fg-3)", fontWeight: 400 }}>YoY</span>
        </div>
      )}
      <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{source}</div>
    </div>
  );
}

// ============= Big chart (long-run HPI with overlays) =============
function BigChart({ c }) {
  const NEIGHBORS = window.COUNTIES
    .filter(x => x.fips !== c.fips)
    .sort((a, b) => Math.abs(a.zhvi - c.zhvi) - Math.abs(b.zhvi - c.zhvi))
    .slice(0, 6);
  const [overlays, setOverlays] = useStateCounty(["metro"]);
  const [range, setRange] = useStateCounty("all"); // 'all' | '20y' | '10y'

  const toggle = (id) => setOverlays(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  // Combine base + overlays into chart data
  const base = c.series.fhfaHpi;
  const dataMap = new Map(base.map(p => [p.year, { year: p.year, [c.fips]: p.value }]));
  // Metro median = average across counties
  if (overlays.includes("metro")) {
    const allSeries = window.COUNTIES.map(x => window.COUNTY_DETAIL[x.fips]?.series.fhfaHpi).filter(Boolean);
    base.forEach(p => {
      const yearVals = allSeries.map(s => s.find(q => q.year === p.year)?.value).filter(v => v != null);
      const avg = yearVals.reduce((a, b) => a + b, 0) / yearVals.length;
      const m = dataMap.get(p.year);
      if (m) m.metro = +avg.toFixed(1);
    });
  }
  NEIGHBORS.forEach(n => {
    if (!overlays.includes(n.fips)) return;
    const s = window.COUNTY_DETAIL[n.fips]?.series.fhfaHpi;
    if (!s) return;
    s.forEach(p => {
      const m = dataMap.get(p.year);
      if (m) m[n.fips] = p.value;
    });
  });
  let data = Array.from(dataMap.values());
  if (range === "20y") data = data.filter(d => d.year >= 2006);
  if (range === "10y") data = data.filter(d => d.year >= 2016);

  const overlayColors = {
    metro: "#9A9384",
    "11001": "#dc2626", "24031": "#A4243B", "24027": "#1f8b54",
    "51059": "#1d4ed8", "51107": "#0f766e", "51013": "#7c3aed",
    "24033": "#ea580c", "24003": "#0891b2", "24021": "#65a30d",
    "51153": "#be185d",
  };

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>The long view</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Home prices since 1975
          </h2>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginTop: 4 }}>
            FHFA House Price Index, indexed to 100 in 2000. Compare against neighbors or the metro median.
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--paper-100)", padding: 4, borderRadius: 10 }}>
          {[{id:"all",l:"All"},{id:"20y",l:"20 yr"},{id:"10y",l:"10 yr"}].map(r => (
            <button key={r.id} onClick={() => setRange(r.id)} style={{
              padding: "6px 14px", fontSize: 13, fontWeight: 500,
              border: "none", borderRadius: 6, cursor: "pointer",
              background: range === r.id ? "var(--surface-1)" : "transparent",
              color: range === r.id ? "var(--fg-1)" : "var(--fg-2)",
              boxShadow: range === r.id ? "var(--shadow-1)" : "none",
              fontFamily: "var(--font-body)",
            }}>{r.l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 24px 8px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginRight: 4 }}>Overlay:</span>
        <Chip active label="DMV metro median" color={overlayColors.metro} on={overlays.includes("metro")} onClick={() => toggle("metro")} />
        {NEIGHBORS.map(n => (
          <Chip key={n.fips} label={n.shortName} color={overlayColors[n.fips] || "#888"} on={overlays.includes(n.fips)} onClick={() => toggle(n.fips)} jur={n.jurisdiction} />
        ))}
      </div>

      <div style={{ height: 380, padding: "8px 16px 8px 8px" }}>
        <RC>
          <LC data={data} margin={{ top: 10, right: 24, bottom: 16, left: 8 }}>
            <CG stroke="#F4EFE5" vertical={false} />
            <RA x1={2007} x2={2011} fill="#fce7e7" fillOpacity={0.4} />
            <XA dataKey="year" tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                axisLine={{ stroke: "#C9C2B4" }} tickLine={false}
                ticks={range === "all" ? [1975, 1985, 1995, 2005, 2015, 2026] : range === "20y" ? [2006, 2010, 2014, 2018, 2022, 2026] : [2016, 2018, 2020, 2022, 2024, 2026]} />
            <YA tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                axisLine={false} tickLine={false} width={42}
                tickFormatter={(v) => v.toFixed(0)} />
            <TT contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8", padding: "8px 12px" }}
                formatter={(v, n) => {
                  const label = n === "metro" ? "DMV metro" : n === c.fips ? c.shortName : (window.COUNTIES.find(x => x.fips === n)?.shortName || n);
                  return [v.toFixed(1), label];
                }} />
            <RL y={100} stroke="#C9C2B4" strokeDasharray="3 3" label={{ value: "100 (year 2000)", position: "insideTopRight", fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }} />
            {overlays.includes("metro") && <LL type="monotone" dataKey="metro" stroke={overlayColors.metro} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
            {NEIGHBORS.filter(n => overlays.includes(n.fips)).map(n => (
              <LL key={n.fips} type="monotone" dataKey={n.fips} stroke={overlayColors[n.fips] || "#888"} strokeWidth={1.5} dot={false} opacity={0.8} />
            ))}
            <LL type="monotone" dataKey={c.fips} stroke="#2B201A" strokeWidth={2.5} dot={false} />
          </LC>
        </RC>
      </div>
      <div style={{ padding: "8px 24px 20px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Source: U.S. Federal Housing Finance Agency, via FRED · annual, indexed
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Shaded: 2007–2011 housing crisis
        </span>
      </div>
    </div>
  );
}

function Chip({ label, color, on, onClick, jur }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 11px", fontSize: 13, fontWeight: 500,
      border: "1px solid", borderColor: on ? color : "var(--border-soft)",
      background: on ? "var(--surface-1)" : "var(--surface-1)",
      color: on ? "var(--fg-1)" : "var(--fg-3)", cursor: "pointer",
      borderRadius: 999, fontFamily: "var(--font-body)",
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: on ? color : "var(--paper-300)" }} />
      {jur && <window.JurisdictionBadge j={jur} />}
      {label}
    </button>
  );
}

window.CountyPage = CountyPage;
window.BigChart = BigChart; // for next file split

// ============= Affordability calculator =============
function Affordability({ c }) {
  const [income, setIncome] = useStateCounty(c.income);
  const [downPct, setDownPct] = useStateCounty(20);
  const [rate, setRate] = useStateCounty(window.METRO.mortgageRate * 100);

  const price = c.medianSalePrice;
  const down = price * downPct / 100;
  const principal = price - down;
  const r = rate / 100 / 12;
  const n = 360;
  const piPayment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const taxMonthly = price * c.propertyTaxRate / 12;
  const insurance = price * 0.0035 / 12;
  const total = piPayment + taxMonthly + insurance;
  const pctOfIncome = total / (income / 12);

  let status, statusColor;
  if (pctOfIncome <= 0.30)      { status = "Within the 30% rule"; statusColor = "#059669"; }
  else if (pctOfIncome <= 0.40) { status = "Above 30%, manageable"; statusColor = "#d97706"; }
  else                          { status = "Cost-burdened territory"; statusColor = "#dc2626"; }

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-soft)", padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Affordability calculator</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Could you afford the median home here?
      </h2>
      <p style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 6, marginBottom: 20 }}>
        Uses {c.shortName}&rsquo;s actual property tax rate ({(c.propertyTaxRate * 100).toFixed(2)}%) and median sale price.
      </p>

      <Slider label="Annual household income" value={income} setValue={setIncome} min={40000} max={400000} step={5000} fmt={(v) => window.fmtMoney(v)} />
      <Slider label="Down payment" value={downPct} setValue={setDownPct} min={0} max={50} step={1} fmt={(v) => v + "%"} sub={"= " + window.fmtMoney(down, { compact: true })} />
      <Slider label="Mortgage rate" value={rate} setValue={setRate} min={3} max={9} step={0.05} fmt={(v) => v.toFixed(2) + "%"} />

      <div style={{ marginTop: 20, padding: "20px 22px", background: "var(--paper-100)", borderRadius: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Total monthly cost
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg-1)", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
              {window.fmtMoney(total)}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              Principal &amp; int. {window.fmtMoney(piPayment)} · Tax {window.fmtMoney(taxMonthly)} · Ins. {window.fmtMoney(insurance)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Share of monthly income
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", color: statusColor, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
              {(pctOfIncome * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 12, color: statusColor, fontWeight: 500, marginTop: 2 }}>{status}</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ position: "relative", height: 10, background: "var(--surface-1)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: Math.min(100, pctOfIncome * 100) + "%", background: statusColor }} />
            <div style={{ position: "absolute", top: -2, bottom: -2, left: "30%", width: 2, background: "var(--fg-1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            <span>0%</span><span style={{ position: "absolute", marginLeft: "calc(30% - 18px)" }}>30% rule</span><span>50%</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 16 }}>
        Assumes 30-yr fixed, 0.35% annual insurance, no HOA. Tax rate sourced from county records.
      </div>
    </div>
  );
}

function Slider({ label, value, setValue, min, max, step, fmt, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--fg-2)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>
          {fmt(value)}{sub && <span style={{ color: "var(--fg-3)", fontWeight: 400, marginLeft: 6 }}>{sub}</span>}
        </span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => setValue(+e.target.value)}
        style={{ width: "100%", accentColor: "var(--primary)" }} />
    </div>
  );
}

// ============= Market health breakdown =============
function MarketHealthBreakdown({ c }) {
  const score = c.marketHealth;
  const color = window.healthColor(score);
  const items = [
    { label: "Months of supply",   ...c.healthBreakdown.monthsSupply,    fmt: (v) => v.toFixed(1) + " mo" },
    { label: "Sale-to-list ratio", ...c.healthBreakdown.saleToList,      fmt: (v) => (v * 100).toFixed(1) + "%" },
    { label: "% sold above list",  ...c.healthBreakdown.pctSoldAboveList,fmt: (v) => (v * 100).toFixed(0) + "%" },
    { label: "Inventory YoY",      ...c.healthBreakdown.inventoryYoY,    fmt: (v) => window.fmtPct(v, { signed: true }) },
  ];
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-soft)", padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Market health, decomposed</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em" }}>
        What&rsquo;s the {Math.round(score)} made of?
      </h2>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 24 }}>
        <Donut score={score} color={color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color }}>
            {score < 36 ? "Concerning" : score < 56 ? "Cooling" : score < 76 ? "Balanced" : "Tight / strong"}
          </div>
          <p style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 4, lineHeight: 1.5 }}>
            Composite of supply, pricing pressure, and inventory trend. 0–35 concerning, 36–55 cooling, 56–75 balanced, 76+ tight.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map(it => (
          <div key={it.label}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 44px", gap: 14, alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{it.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--fg-1)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{it.fmt(it.value)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textAlign: "right" }}>{it.weight}%</span>
            </div>
            <div style={{ height: 6, background: "var(--paper-100)", borderRadius: 3 }}>
              <div style={{ width: it.score + "%", height: "100%", background: window.healthColor(it.score), borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 20 }}>
        Source: derived from Bright MLS, Redfin Data Center · Apr 2026
      </div>
    </div>
  );
}

function Donut({ score, color }) {
  const R = 52, C = 2 * Math.PI * R;
  const offset = C * (1 - score / 100);
  return (
    <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
      <svg viewBox="0 0 132 132" width="132" height="132">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--paper-100)" strokeWidth="14" />
        <circle cx="66" cy="66" r={R} fill="none" stroke={color} strokeWidth="14"
                strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
                transform="rotate(-90 66 66)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--fg-1)", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {Math.round(score)}
        </div>
        <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
}

// ============= Forecast cone =============
function ForecastCone({ c }) {
  const current = c.medianSalePrice;
  const fcs = c.forecasts;
  const minPct = Math.min(...fcs.map(f => f.changePct));
  const maxPct = Math.max(...fcs.map(f => f.changePct));

  // Series for chart: history (last 36 months) + forecast band to +12 months
  const zhviRecent = c.series.zhvi.slice(-36);
  const lastDate = new Date(zhviRecent[zhviRecent.length - 1].date);
  const future = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
    const tFrac = i / 12;
    future.push({
      date: d.toISOString().slice(0, 10),
      lo: Math.round(current * (1 + minPct * tFrac)),
      hi: Math.round(current * (1 + maxPct * tFrac)),
      mid: Math.round(current * (1 + ((minPct + maxPct) / 2) * tFrac)),
    });
  }
  const data = [
    ...zhviRecent.map(p => ({ date: p.date, value: p.value })),
    ...future,
  ];

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>2026 forecast</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Forecasters disagree by {((maxPct - minPct) * 100).toFixed(1)} percentage points
          </h2>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginTop: 6, maxWidth: 520 }}>
            The honest answer is no one knows. Each major forecaster sees a different next year for {c.shortName}; we show the range, not an average.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
          {fcs.map(f => (
            <div key={f.source} style={{
              padding: "10px 14px", border: "1px solid var(--border-soft)", borderRadius: 12,
              minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{f.source}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em", marginTop: 2 }}>
                {window.fmtMoney(f.value, { compact: true })}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: window.dirColor(f.changePct), fontVariantNumeric: "tabular-nums" }}>
                {window.fmtPct(f.changePct, { signed: true })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 280, padding: "20px 16px 8px 8px" }}>
        <RC>
          <AC data={data} margin={{ top: 10, right: 24, bottom: 16, left: 8 }}>
            <defs>
              <linearGradient id="cone-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A4243B" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#A4243B" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <CG stroke="#F4EFE5" vertical={false} />
            <XA dataKey="date" tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                axisLine={{ stroke: "#C9C2B4" }} tickLine={false}
                tickFormatter={(d) => {
                  const dt = new Date(d);
                  return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                }}
                interval={5} />
            <YA tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                axisLine={false} tickLine={false} width={56}
                tickFormatter={(v) => window.fmtMoney(v, { compact: true })}
                domain={["dataMin - 20000", "dataMax + 20000"]} />
            <TT contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                formatter={(v, n) => [window.fmtMoney(v), n === "value" ? "ZHVI" : n === "lo" ? "Low forecast" : n === "hi" ? "High forecast" : "Mid"]}
                labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
            <RL x={zhviRecent[zhviRecent.length - 1].date} stroke="#9A9384" strokeDasharray="3 3" />
            <AA type="monotone" dataKey="hi" stroke="none" fill="url(#cone-grad)" />
            <AA type="monotone" dataKey="lo" stroke="none" fill="var(--bg-paper)" fillOpacity={1} />
            <LL type="monotone" dataKey="mid" stroke="#A4243B" strokeWidth={1} strokeDasharray="3 3" dot={false} />
            <LL type="monotone" dataKey="value" stroke="#2B201A" strokeWidth={2.5} dot={false} />
          </AC>
        </RC>
      </div>
      <div style={{ padding: "0 24px 20px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Source: Bright MLS, Zillow Research, NAR · 12-month forecast
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Shaded band = range across forecasters
        </span>
      </div>
    </div>
  );
}

// ============= Federal exposure =============
function FederalExposure({ c }) {
  const ranked = [...window.COUNTIES].sort((a, b) => b.fedExposure - a.fedExposure);
  const rank = ranked.findIndex(x => x.fips === c.fips) + 1;
  const series = c.federal.series;

  const peak = Math.max(...series.map(p => p.value));
  const latest = series[series.length - 1].value;
  const drop = (latest - peak) / peak;

  let interp;
  if (c.fedExposure > 0.25) interp = `Among the most federally exposed jurisdictions in the metro. A continued federal contraction would weigh meaningfully on local demand.`;
  else if (c.fedExposure > 0.18) interp = `Substantial federal employment ties. The high-income workforce here has historically been more resilient than exurban federal commuters.`;
  else if (c.fedExposure > 0.12) interp = `Moderate federal exposure. Sector mix (tech, health, defense contracting) cushions but does not fully insulate.`;
  else interp = `Limited direct federal exposure. Local demand drivers are largely non-federal.`;

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 20, border: "1px solid var(--border-soft)", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, marginBottom: 24 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Federal exposure · DMV-specific</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em" }}>
            {(c.fedExposure * 100).toFixed(0)}% of jobs are federally tied
          </h2>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginTop: 8, maxWidth: 620, lineHeight: 1.55 }}>
            {interp}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="eyebrow">Rank in metro</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>
            #{rank}<span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--fg-3)", fontWeight: 400 }}> / 21</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 32 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Federal employment, last 36 months</div>
          <div style={{ height: 200 }}>
            <RC>
              <AC data={series} margin={{ top: 4, right: 16, bottom: 16, left: 8 }}>
                <defs>
                  <linearGradient id="fed-cnty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CG stroke="#F4EFE5" vertical={false} />
                <XA dataKey="date" tick={{ fontSize: 10, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                    tickFormatter={(d) => new Date(d).getMonth() === 0 ? "'" + (new Date(d).getFullYear() % 100) : ""}
                    interval={0} axisLine={{ stroke: "#C9C2B4" }} tickLine={false} />
                <YA tick={{ fontSize: 10, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                    tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
                    axisLine={false} tickLine={false} width={42} />
                <TT contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                    formatter={(v) => [(v * 100).toFixed(2) + "%", "Federal share"]}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
                <AA type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} fill="url(#fed-cnty)" />
              </AC>
            </RC>
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
            Source: BLS QCEW · share of total private + government jobs
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Stat label="Federal share, current" value={(latest * 100).toFixed(1) + "%"} />
          <Stat label="Federal share, 3 yr ago" value={(peak * 100).toFixed(1) + "%"} />
          <Stat label="Change" value={window.fmtPct(drop, { signed: true })} valueColor={window.dirColor(drop)} />
          <div style={{ marginTop: 8, padding: "12px 14px", background: "var(--paper-100)", borderRadius: 10, fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--fg-1)" }}>Why this matters.</strong>{" "}
            The DMV ended 2025 down ~62K federal jobs — the largest absolute decline of any U.S. metro. Per Brookings, ~96% of metro job losses traced back to federal cuts.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 12, borderBottom: "1px solid var(--border-soft)" }}>
      <span style={{ fontSize: 13, color: "var(--fg-3)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: valueColor || "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

Object.assign(window, { CountyPage, Affordability, MarketHealthBreakdown, ForecastCone, FederalExposure });
