/* global React */
/* DMV stylized hex/grid map */

const { useState: useStateMap, useMemo: useMemoMap } = React;

// Hex-grid layout based on rough geography from 03-COUNTIES.md.
// Coordinates are (col, row); rows are offset by 0.5 every other row.
// Proper offset hex grid: every cell is on integer (col, row).
// Odd rows are visually shifted right by half a column-width.
// Adjacency is approximate — goal is readability, not cartographic accuracy.
//   col → 0 .. 6   (west → east)
//   row → 0 .. 6   (north → south, odd rows offset right)
const HEX_LAYOUT = [
  // Row 0 — northern MD
  { fips: "24021", col: 2, row: 0 }, // Frederick
  { fips: "24027", col: 4, row: 0 }, // Howard
  { fips: "24005", col: 5, row: 0 }, // Baltimore Co.
  { fips: "24510", col: 6, row: 0 }, // Baltimore City
  // Row 1 — Montgomery / Anne Arundel band
  { fips: "24031", col: 3, row: 1 }, // Montgomery
  { fips: "24003", col: 5, row: 1 }, // Anne Arundel
  // Row 2 — close-in core (DC, NoVA majors, PG)
  { fips: "51107", col: 0, row: 2 }, // Loudoun
  { fips: "51059", col: 2, row: 2 }, // Fairfax County
  { fips: "11001", col: 3, row: 2 }, // DC
  { fips: "24033", col: 4, row: 2 }, // Prince George's
  // Row 3 — independent cities + Calvert
  { fips: "51153", col: 1, row: 3 }, // Prince William
  { fips: "51600", col: 2, row: 3 }, // Fairfax City
  { fips: "51610", col: 3, row: 3 }, // Falls Church
  { fips: "51013", col: 4, row: 3 }, // Arlington
  { fips: "51510", col: 5, row: 3 }, // Alexandria
  { fips: "24009", col: 6, row: 3 }, // Calvert  (sits east of Charles for visual width)
  // Row 4 — Manassas pair + Charles
  { fips: "51683", col: 0, row: 4 }, // Manassas
  { fips: "51685", col: 1, row: 4 }, // Manassas Park
  { fips: "24017", col: 5, row: 4 }, // Charles
  // Row 5 — outer south VA
  { fips: "51179", col: 1, row: 5 }, // Stafford
  { fips: "51177", col: 2, row: 5 }, // Spotsylvania
];

const METRIC_OPTS = [
  { id: "yoy",    label: "1-yr price change", unit: "%", domain: [-0.05, 0.07], scale: "diverging" },
  { id: "zhvi",   label: "Typical home value", unit: "$", domain: [180000, 950000], scale: "sequential" },
  { id: "health", label: "Market health (0–100)", unit: "", domain: [0, 100], scale: "categorical-health" },
  { id: "dom",    label: "Days on market", unit: " days", domain: [20, 70], scale: "sequential-reverse" },
  { id: "supply", label: "Months of supply", unit: " mo", domain: [1, 6], scale: "sequential-reverse" },
];

function valueOf(c, metric) {
  switch (metric) {
    case "yoy":    return c.zhviYoY;
    case "zhvi":   return c.zhvi;
    case "health": return c.marketHealth;
    case "dom":    return c.daysOnMarket;
    case "supply": return c.monthsSupply;
    default: return null;
  }
}
function fmtMetricValue(v, metric) {
  if (v == null) return "—";
  switch (metric) {
    case "yoy":    return window.fmtPct(v, { signed: true });
    case "zhvi":   return window.fmtMoney(v, { compact: true });
    case "health": return Math.round(v) + " / 100";
    case "dom":    return Math.round(v) + " days";
    case "supply": return v.toFixed(1) + " mo";
    default: return v;
  }
}

// Color ramps
function colorFor(c, metric) {
  const v = valueOf(c, metric);
  if (v == null) return "#E7E2D8";
  switch (metric) {
    case "yoy": {
      // diverging red ↔ neutral ↔ green, anchored at 0
      if (v <= -0.04) return "#7f1d1d";
      if (v <= -0.02) return "#b91c1c";
      if (v <= -0.005) return "#ef4444";
      if (v < 0.005) return "#e5e7eb";
      if (v < 0.015) return "#a7d3b0";
      if (v < 0.03) return "#34a36b";
      if (v < 0.045) return "#1f8b54";
      return "#065f46";
    }
    case "zhvi": {
      // single-hue sequential (paper → ink) using crab-tinted neutrals
      const t = Math.min(1, Math.max(0, (v - 180000) / (950000 - 180000)));
      const stops = ["#FBF8F3","#F4D2D7","#E8A4AE","#BE4A5C","#8B1A2F","#4F0E1A"];
      const i = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)));
      return stops[i];
    }
    case "health": return window.healthColor(v);
    case "dom": {
      const t = Math.min(1, Math.max(0, (v - 20) / 50));
      const stops = ["#065f46","#1f8b54","#a7d3b0","#fde68a","#f59e0b","#b45309"];
      const i = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)));
      return stops[i];
    }
    case "supply": {
      const t = Math.min(1, Math.max(0, (v - 1) / 5));
      const stops = ["#065f46","#1f8b54","#a7d3b0","#fde68a","#f59e0b","#b45309"];
      const i = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)));
      return stops[i];
    }
  }
  return "#E7E2D8";
}

// SVG hexagon path centered at (cx, cy) with radius r (pointy-top)
function hexPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return "M" + pts.map(p => p.map(n => n.toFixed(1)).join(",")).join("L") + "Z";
}

function DMVMap({ onPick }) {
  const [metric, setMetric] = useStateMap("yoy");
  const [hoverFips, setHoverFips] = useStateMap(null);

  const counties = window.COUNTIES;
  const byFips = useMemoMap(() => Object.fromEntries(counties.map(c => [c.fips, c])), [counties]);

  // Map hex to absolute coords (pointy-top hex, odd rows offset right)
  const HEX_R = 46;
  const COL_W = HEX_R * Math.sqrt(3);     // horizontal spacing (≈ 1.732 * R)
  const ROW_H = HEX_R * 1.5;              // vertical spacing (3/2 * R)
  const PAD = 56;
  const cells = HEX_LAYOUT.map(h => {
    const c = byFips[h.fips];
    if (!c) return null;
    const offset = (h.row % 2 === 1) ? COL_W / 2 : 0;
    const cx = PAD + h.col * COL_W + offset;
    const cy = PAD + h.row * ROW_H;
    return { ...h, c, cx, cy };
  }).filter(Boolean);

  const hovered = hoverFips ? byFips[hoverFips] : null;

  // Grid bounds
  const maxX = Math.max(...cells.map(c => c.cx)) + HEX_R + 40;
  const maxY = Math.max(...cells.map(c => c.cy)) + HEX_R + 40;

  // Legend stops
  const legendStops = (() => {
    const m = METRIC_OPTS.find(o => o.id === metric);
    if (metric === "yoy") return ["-4%","-2%","0","+2%","+4%","+6%"];
    if (metric === "zhvi") return ["$180K","$350K","$500K","$650K","$800K","$950K"];
    if (metric === "health") return ["0","20","40","60","80","100"];
    if (metric === "dom") return ["20","30","40","50","60","70"];
    if (metric === "supply") return ["1","2","3","4","5","6"];
    return [];
  })();
  const legendColors = (() => {
    if (metric === "yoy") return ["#b91c1c","#ef4444","#e5e7eb","#34a36b","#1f8b54","#065f46"];
    if (metric === "zhvi") return ["#FBF8F3","#F4D2D7","#E8A4AE","#BE4A5C","#8B1A2F","#4F0E1A"];
    if (metric === "health") return ["#dc2626","#dc2626","#d97706","#1d4ed8","#059669","#059669"];
    if (metric === "dom") return ["#065f46","#1f8b54","#a7d3b0","#fde68a","#f59e0b","#b45309"];
    if (metric === "supply") return ["#065f46","#1f8b54","#a7d3b0","#fde68a","#f59e0b","#b45309"];
    return [];
  })();

  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 20,
      border: "1px solid var(--border-soft)", overflow: "hidden",
    }}>
      {/* Toolbar */}
      <div style={{
        padding: "20px 24px 16px", borderBottom: "1px solid var(--border-soft)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap",
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>The metro at a glance</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em" }}>
            21 counties, one map
          </h2>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginTop: 4, maxWidth: 560 }}>
            Each hex is one jurisdiction, arranged by rough adjacency. Click any to dive in.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>Color encodes</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {METRIC_OPTS.map(o => (
              <button key={o.id} onClick={() => setMetric(o.id)} style={{
                padding: "6px 12px", fontSize: 13, fontWeight: 500,
                borderRadius: 8, border: "1px solid",
                borderColor: metric === o.id ? "var(--fg-1)" : "var(--border-soft)",
                background: metric === o.id ? "var(--fg-1)" : "var(--surface-1)",
                color: metric === o.id ? "#fff" : "var(--fg-2)",
                cursor: "pointer", fontFamily: "var(--font-body)",
              }}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: 520 }}>
        <div style={{ position: "relative", padding: 24, background: "var(--paper-50)" }}>
          <svg viewBox={`0 0 ${maxX} ${maxY}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {/* Subtle jurisdiction grouping rings */}
            <g opacity="0.04">
              <rect x="0" y="0" width={maxX} height={maxY} fill="#1d4ed8" />
            </g>
            {cells.map(({ c, cx, cy }) => {
              const fill = colorFor(c, metric);
              const isHover = hoverFips === c.fips;
              return (
                <g key={c.fips}
                   onMouseEnter={() => setHoverFips(c.fips)}
                   onMouseLeave={() => setHoverFips(null)}
                   onClick={() => onPick && onPick(c.fips)}
                   style={{ cursor: "pointer" }}>
                  <path d={hexPath(cx, cy, HEX_R)}
                        fill={fill}
                        stroke={isHover ? "#2B201A" : "rgba(43,32,26,0.18)"}
                        strokeWidth={isHover ? 2.5 : 1}
                        style={{ transition: "stroke-width 150ms" }} />
                  {/* jurisdiction tick at top-left of hex */}
                  <circle cx={cx - HEX_R * 0.55} cy={cy - HEX_R * 0.55} r="3.5"
                          fill={window.juriColor(c.jurisdiction)} opacity="0.85" />
                  <text x={cx} y={cy - 4} textAnchor="middle"
                        fontFamily="var(--font-body)" fontSize="10" fontWeight="600"
                        fill={luminance(fill) > 0.55 ? "#2B201A" : "#fff"}>
                    {c.shortName.length > 12 ? c.shortName.slice(0, 11) + "…" : c.shortName}
                  </text>
                  <text x={cx} y={cy + 11} textAnchor="middle"
                        fontFamily="var(--font-mono)" fontSize="11" fontWeight="600"
                        fill={luminance(fill) > 0.55 ? "#2B201A" : "#fff"}
                        style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMetricValue(valueOf(c, metric), metric)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{
            position: "absolute", bottom: 24, left: 24, right: 24,
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,0.92)", borderRadius: 8, padding: "10px 14px",
            border: "1px solid var(--border-soft)", maxWidth: 480,
          }}>
            <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
              {METRIC_OPTS.find(o => o.id === metric).label}
            </div>
            <div style={{ display: "flex", flex: 1, gap: 0 }}>
              {legendColors.map((c, i) => (
                <div key={i} style={{ flex: 1, height: 10, background: c }} />
              ))}
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", flex: 1,
              fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)",
              position: "absolute", left: 138, right: 14, bottom: 0, padding: "0 0 2px",
            }}>
              {legendStops.map((s, i) => i % 1 === 0 && (
                <span key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : i === legendStops.length - 1 ? "right" : "center" }}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Side panel: hover detail or summary */}
        <div style={{ borderLeft: "1px solid var(--border-soft)", padding: 24, background: "var(--surface-1)" }}>
          {hovered ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <window.JurisdictionBadge j={hovered.jurisdiction} />
                <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
                  FIPS {hovered.fips}
                </span>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {hovered.name}
              </h3>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <Row k="Typical home value" v={window.fmtMoney(hovered.zhvi)} sub={window.fmtPct(hovered.zhviYoY, { signed: true }) + " YoY"} subColor={window.dirColor(hovered.zhviYoY)} />
                <Row k="Median sale price" v={window.fmtMoney(hovered.medianSalePrice)} />
                <Row k="Days on market" v={hovered.daysOnMarket + " days"} />
                <Row k="Months of supply" v={hovered.monthsSupply.toFixed(1) + " mo"} />
                <Row k="Market health" v={Math.round(hovered.marketHealth) + " / 100"} subColor={window.healthColor(hovered.marketHealth)} sub="●" />
              </div>
              <button onClick={() => onPick && onPick(hovered.fips)} style={{
                marginTop: 24, width: "100%", padding: "10px 14px",
                background: "var(--fg-1)", color: "#fff", border: "none",
                borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}>
                Open county detail →
              </button>
            </div>
          ) : (
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Hover or click a hex</div>
              <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 24 }}>
                Hover any jurisdiction to see its current snapshot. Click to open the county detail page.
              </p>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Jurisdictions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <LegRow color="#dc2626" label="District of Columbia" n="1" />
                <LegRow color="#ca8a04" label="Maryland" n="9" />
                <LegRow color="#1d4ed8" label="Virginia" n="11" />
              </div>
              <div style={{
                marginTop: 24, padding: "14px 16px", background: "var(--bg-soft)",
                borderRadius: 10, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.55,
              }}>
                <strong style={{ color: "var(--fg-1)" }}>Reading the map.</strong>{" "}
                Adjacency is approximate; the goal is to make jurisdictional contrast legible,
                not to be a true cartographic projection.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, sub, subColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-soft)" }}>
      <span style={{ fontSize: 13, color: "var(--fg-3)" }}>{k}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>{v}</span>
        {sub && <span style={{ marginLeft: 6, fontSize: 12, color: subColor || "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{sub}</span>}
      </span>
    </div>
  );
}
function LegRow({ color, label, n }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      <span style={{ color: "var(--fg-2)" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)" }}>{n}</span>
    </div>
  );
}

// Approximate luminance for choosing text color
function luminance(hex) {
  if (!hex || hex[0] !== "#") return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

window.DMVMap = DMVMap;
