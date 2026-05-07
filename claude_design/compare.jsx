/* global React, Recharts */
const { useState: useStateCmp, useMemo: useMemoCmp } = React;
const {
  LineChart: LCx, Line: LLx, XAxis: XAx, YAxis: YAx, Tooltip: TTx,
  ResponsiveContainer: RCx, ReferenceLine: RLx, CartesianGrid: CGx,
} = Recharts;

const COMPARE_METRICS = [
  { id: "zhvi",   label: "Typical home value",     unit: "$", fmt: (v) => window.fmtMoney(v, { compact: true }), get: (c) => c.zhvi },
  { id: "sale",   label: "Median sale price",      unit: "$", fmt: (v) => window.fmtMoney(v, { compact: true }), get: (c) => c.medianSalePrice },
  { id: "dom",    label: "Days on market",         unit: " days", fmt: (v) => Math.round(v) + " days", get: (c) => c.daysOnMarket },
  { id: "supply", label: "Months of supply",       unit: " mo", fmt: (v) => v.toFixed(1) + " mo", get: (c) => c.monthsSupply },
  { id: "health", label: "Market health (0–100)",  unit: "",  fmt: (v) => Math.round(v) + " / 100", get: (c) => c.marketHealth },
  { id: "afford", label: "Affordability (% of inc.)", unit: "%", fmt: (v) => (v * 100).toFixed(0) + "%", get: (c) => c.affordability },
];

const SERIES_COLORS = ["#2B201A", "#A4243B", "#1d4ed8", "#059669", "#d97706"];

function ComparePage() {
  const [selected, setSelected] = useStateCmp(["24031", "24027", "11001", "51107"]);
  const [metric, setMetric] = useStateCmp("zhvi");

  const counties = selected.map(f => window.COUNTIES.find(c => c.fips === f)).filter(Boolean);
  const m = COMPARE_METRICS.find(x => x.id === metric);

  // Build chart data: ZHVI monthly, last 60 months for selected counties
  const chartData = useMemoCmp(() => {
    if (selected.length === 0) return [];
    const baseSeries = window.COUNTY_DETAIL[selected[0]]?.series.zhvi.slice(-60) || [];
    return baseSeries.map((p, i) => {
      const row = { date: p.date };
      selected.forEach(f => {
        const s = window.COUNTY_DETAIL[f]?.series.zhvi.slice(-60);
        if (s && s[i]) row[f] = s[i].value;
      });
      return row;
    });
  }, [selected]);

  // Build ranked rows
  const ranked = [...counties].sort((a, b) => m.get(b) - m.get(a));
  const values = counties.map(c => m.get(c));
  const spread = values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0;
  const spreadPct = values.length >= 2 ? spread / Math.min(...values) : 0;

  const toggle = (fips) => {
    setSelected(s => {
      if (s.includes(fips)) return s.filter(x => x !== fips);
      if (s.length >= 5) return s; // cap at 5
      return [...s, fips];
    });
  };

  return (
    <main style={{ background: "var(--bg-paper)", minHeight: "100vh" }}>
      <div style={{ borderBottom: "1px solid var(--border-soft)" }}>
        <window.Container style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div className="eyebrow" style={{ color: "var(--fg-3)" }}>Compare counties</div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 600,
            letterSpacing: "-0.022em", lineHeight: 1.05, marginTop: 10,
          }}>
            How does your county stack up against its neighbors?
          </h1>
          <p style={{ marginTop: 14, fontSize: 16, color: "var(--fg-2)", lineHeight: 1.55, maxWidth: 640 }}>
            Pick 2 to 5 jurisdictions and a metric. The DMV&rsquo;s internal divergence
            is the story national averages can&rsquo;t tell.
          </p>
        </window.Container>
      </div>

      <window.Container style={{ marginTop: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
          <CountyPicker selected={selected} onToggle={toggle} />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <MetricPicker metric={metric} setMetric={setMetric} />
            {counties.length < 2 ? (
              <EmptyState />
            ) : (
              <>
                <CompareChart data={chartData} counties={counties} />
                <RankedTable counties={ranked} metric={m} colorByFips={Object.fromEntries(counties.map((c, i) => [c.fips, SERIES_COLORS[i]]))} />
                <DifferenceCallout counties={counties} metric={m} spread={spread} spreadPct={spreadPct} />
              </>
            )}
          </div>
        </div>
      </window.Container>
    </main>
  );
}

// ============= County picker =============
function CountyPicker({ selected, onToggle }) {
  const [q, setQ] = useStateCmp("");
  const groups = [
    { jur: "DC", title: "District of Columbia" },
    { jur: "MD", title: "Maryland" },
    { jur: "VA", title: "Virginia" },
  ];
  const filtered = window.COUNTIES.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.shortName.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: 20,
      position: "sticky", top: 80, alignSelf: "start", maxHeight: "calc(100vh - 100px)", overflow: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div className="eyebrow">Counties</div>
        <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          {selected.length} / 5
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 12 }}>Pick 2 to 5 to compare.</div>
      <input
        type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", fontSize: 13,
          border: "1px solid var(--border-soft)", borderRadius: 8,
          background: "var(--paper-50)", marginBottom: 16, fontFamily: "var(--font-body)",
          boxSizing: "border-box", color: "var(--fg-1)",
        }}
      />
      {groups.map(g => {
        const items = filtered.filter(c => c.jurisdiction === g.jur);
        if (items.length === 0) return null;
        return (
          <div key={g.jur} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <window.JurisdictionBadge j={g.jur} />
              <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.title}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {items.map(c => {
                const on = selected.includes(c.fips);
                const atCap = !on && selected.length >= 5;
                return (
                  <button key={c.fips} onClick={() => onToggle(c.fips)} disabled={atCap}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                      background: on ? "var(--bg-soft)" : "transparent",
                      border: "none", borderRadius: 6, cursor: atCap ? "not-allowed" : "pointer",
                      textAlign: "left", fontFamily: "var(--font-body)",
                      opacity: atCap ? 0.4 : 1,
                    }}>
                    <span style={{
                      width: 16, height: 16, border: "1.5px solid",
                      borderColor: on ? "var(--fg-1)" : "var(--border-strong)",
                      borderRadius: 4, background: on ? "var(--fg-1)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {on && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--fg-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============= Metric picker =============
function MetricPicker({ metric, setMetric }) {
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: "16px 20px",
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <div className="eyebrow" style={{ flexShrink: 0 }}>Comparing</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {COMPARE_METRICS.map(m => (
          <button key={m.id} onClick={() => setMetric(m.id)} style={{
            padding: "6px 12px", fontSize: 13, fontWeight: 500,
            border: "1px solid",
            borderColor: metric === m.id ? "var(--fg-1)" : "var(--border-soft)",
            background: metric === m.id ? "var(--fg-1)" : "var(--surface-1)",
            color: metric === m.id ? "#fff" : "var(--fg-2)",
            cursor: "pointer", borderRadius: 999, fontFamily: "var(--font-body)",
          }}>{m.label}</button>
        ))}
      </div>
    </div>
  );
}

// ============= Empty state =============
function EmptyState() {
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px dashed var(--border-strong)", padding: "60px 32px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--fg-2)" }}>
        Pick at least 2 counties to compare
      </div>
      <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 8 }}>
        Use the panel on the left to add up to 5 jurisdictions.
      </div>
    </div>
  );
}

// ============= Chart =============
function CompareChart({ data, counties }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 16, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 8px" }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Trend · ZHVI, last 5 years</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Typical home value, monthly
        </h2>
      </div>
      <div style={{ padding: "0 24px 8px", display: "flex", flexWrap: "wrap", gap: 16 }}>
        {counties.map((c, i) => (
          <div key={c.fips} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 14, height: 3, background: SERIES_COLORS[i] }} />
            <window.JurisdictionBadge j={c.jurisdiction} />
            <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{c.shortName}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 380, padding: "8px 16px 8px 8px" }}>
        <RCx>
          <LCx data={data} margin={{ top: 10, right: 24, bottom: 16, left: 8 }}>
            <CGx stroke="#F4EFE5" vertical={false} />
            <XAx dataKey="date" tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                 axisLine={{ stroke: "#C9C2B4" }} tickLine={false}
                 tickFormatter={(d) => {
                   const dt = new Date(d);
                   return dt.getMonth() === 0 ? "'" + (dt.getFullYear() % 100) : "";
                 }} interval={0} />
            <YAx tick={{ fontSize: 11, fill: "#6B6557", fontFamily: "var(--font-mono)" }}
                 axisLine={false} tickLine={false} width={64}
                 tickFormatter={(v) => window.fmtMoney(v, { compact: true })} />
            <TTx contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                 formatter={(v, n) => [window.fmtMoney(v), counties.find(c => c.fips === n)?.shortName || n]}
                 labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
            {counties.map((c, i) => (
              <LLx key={c.fips} type="monotone" dataKey={c.fips} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} />
            ))}
          </LCx>
        </RCx>
      </div>
      <div style={{ padding: "0 24px 16px", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
        Source: Zillow Research, ZHVI All Homes (Smoothed) · monthly
      </div>
    </div>
  );
}

// ============= Ranked table =============
function RankedTable({ counties, metric, colorByFips }) {
  const max = Math.max(...counties.map(c => metric.get(c)));
  const min = Math.min(...counties.map(c => metric.get(c)));
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 16, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 12px" }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Ranked</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          {metric.label}
        </h2>
      </div>
      <div style={{ padding: "0 8px 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
              <th style={thStyle}>Rank</th>
              <th style={{ ...thStyle, textAlign: "left" }}>County</th>
              <th style={thStyle}>Value</th>
              <th style={{ ...thStyle, width: "30%" }}></th>
              <th style={thStyle}>YoY</th>
            </tr>
          </thead>
          <tbody>
            {counties.map((c, i) => {
              const v = metric.get(c);
              const w = max === min ? 100 : ((v - min) / (max - min)) * 100;
              return (
                <tr key={c.fips} style={{ borderBottom: i === counties.length - 1 ? "none" : "1px solid var(--border-soft)" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", color: "var(--fg-3)", fontSize: 13 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: colorByFips[c.fips] }} />
                      <window.JurisdictionBadge j={c.jurisdiction} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>{c.shortName}</span>
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>
                    {metric.fmt(v)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ height: 8, background: "var(--paper-100)", borderRadius: 2 }}>
                      <div style={{ width: Math.max(2, w) + "%", height: "100%", background: colorByFips[c.fips], borderRadius: 2 }} />
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: window.dirColor(c.zhviYoY) }}>
                    {window.fmtPct(c.zhviYoY, { signed: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const thStyle = { padding: "8px 16px", fontSize: 11, fontWeight: 500, color: "var(--fg-3)", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.06em" };
const tdStyle = { padding: "12px 16px", textAlign: "right", verticalAlign: "middle" };

// ============= Difference callout =============
function DifferenceCallout({ counties, metric, spread, spreadPct }) {
  const sorted = [...counties].sort((a, b) => metric.get(b) - metric.get(a));
  const top = sorted[0], bottom = sorted[sorted.length - 1];
  const wide = spreadPct > 0.5 || (metric.id === "zhvi" && spread > 300000) || (metric.id === "supply" && spread > 3) || (metric.id === "dom" && spread > 30);

  return (
    <div style={{
      background: wide ? "#FCF1DC" : "var(--surface-1)",
      borderRadius: 16,
      border: `1px solid ${wide ? "#EAD174" : "var(--border-soft)"}`,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 36, height: 36, flexShrink: 0,
          background: wide ? "#C9A227" : "var(--paper-200)",
          color: wide ? "#fff" : "var(--fg-2)",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700,
        }}>!</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>
            {wide ? "Unusually wide spread" : "Modest spread"}
          </div>
          <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginTop: 6 }}>
            On <strong>{metric.label.toLowerCase()}</strong>,{" "}
            <strong>{top.shortName}</strong> ({metric.fmt(metric.get(top))}) sits{" "}
            <strong>{metric.id === "zhvi" || metric.id === "sale" ? window.fmtMoney(spread, { compact: true }) : metric.fmt(spread)}</strong>{" "}
            {(metric.id === "afford" || metric.id === "health") ? "points " : ""}above{" "}
            <strong>{bottom.shortName}</strong> ({metric.fmt(metric.get(bottom))})
            {wide ? ` — that's a ${(spreadPct * 100).toFixed(0)}% gap, the kind of internal divergence the DMV is known for.` : "."}
          </p>
        </div>
      </div>
    </div>
  );
}

window.ComparePage = ComparePage;
