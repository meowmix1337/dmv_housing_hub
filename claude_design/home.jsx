/* global React, Recharts */
const { useState: useStateHome, useMemo: useMemoHome } = React;
const {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} = Recharts;

function HomePage({ onPickCounty }) {
  return (
    <main style={{ background: "var(--bg-paper)", minHeight: "100vh" }}>
      <Hero />
      <MetricStrip />

      <window.Container style={{ marginTop: 56 }}>
        <window.DMVMap onPick={onPickCounty} />
      </window.Container>

      <window.Container style={{ marginTop: 80 }}>
        <BiggestMovers onPickCounty={onPickCounty} />
      </window.Container>

      <window.Container style={{ marginTop: 80 }}>
        <WhatsDriving />
      </window.Container>
    </main>
  );
}

// ============== Hero ==============
function Hero() {
  return (
    <div style={{ borderBottom: "1px solid var(--border-soft)", background: "var(--bg-paper)" }}>
      <window.Container style={{ paddingTop: 64, paddingBottom: 48 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 56, alignItems: "end" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--fg-3)" }}>
              The DMV housing market · {window.METRO.lastUpdated}
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: 56, fontWeight: 600,
              letterSpacing: "-0.025em", lineHeight: 1.05, marginTop: 12,
              color: "var(--fg-1)", maxWidth: 720,
            }}>
              One metro, twenty-one markets, and the data to tell them apart.
            </h1>
            <p style={{
              marginTop: 20, fontSize: 17, lineHeight: 1.55, color: "var(--fg-2)",
              maxWidth: 560, textWrap: "pretty",
            }}>
              The DMV ended 2025 down roughly 14% in federal jobs while Loudoun became
              the highest-income county in the United States. National averages hide that.
              This dashboard doesn&rsquo;t.
            </p>
          </div>
          <div style={{
            background: "var(--surface-1)", border: "1px solid var(--border-soft)",
            borderRadius: 16, padding: "20px 24px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div className="eyebrow">What you&rsquo;ll find here</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Current prices and 1-year change for all 21 jurisdictions",
                "Long-run trends back to 1975 (FHFA) and 1996 (Zillow)",
                "Affordability calculator with local property-tax rates",
                "Federal-employment exposure, county by county",
                "2026 forecasts shown as ranges, not single numbers",
              ].map((t, i) => (
                <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--fg-2)", lineHeight: 1.45 }}>
                  <span style={{ color: "var(--gold-400)", fontWeight: 700, marginTop: 1 }}>—</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </window.Container>
    </div>
  );
}

// ============== Metric Strip ==============
function MetricStrip() {
  const m = window.METRO;
  return (
    <window.Container style={{ marginTop: 32 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16,
      }}>
        <window.MetricCard
          label="Metro median sale price"
          value={window.fmtMoney(m.medianSalePrice)}
          change={m.medianSalePriceYoY}
          source="Bright MLS · Apr 2026"
        />
        <window.MetricCard
          label="30-yr fixed mortgage rate"
          value={(m.mortgageRate * 100).toFixed(2) + "%"}
          change={m.mortgageRateYoY}
          changeLabel="vs. 1 yr ago"
          source="Freddie Mac PMMS"
        />
        <window.MetricCard
          label="Active listings"
          value={"~" + (m.activeListings / 1000).toFixed(1) + "K"}
          change={m.activeListingsYoY}
          source="Redfin · Apr 2026"
        />
        <window.MetricCard
          label="Median days on market"
          value={m.daysOnMarket + " days"}
          sub="Metro median, all home types"
          source="Redfin · Apr 2026"
        />
        <HealthCard score={m.marketHealth} />
      </div>
    </window.Container>
  );
}

function HealthCard({ score }) {
  const color = window.healthColor(score);
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 6, minHeight: 130,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500, color: "var(--fg-3)",
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>Metro market health</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600,
          color: "var(--fg-1)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}>{score}</span>
        <span style={{ fontSize: 14, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>/ 100</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
        <span style={{ fontSize: 13, color: "var(--fg-2)", fontWeight: 500 }}>
          Neutral · normalizing
        </span>
      </div>
      {/* segmented bar */}
      <div style={{ marginTop: 6, display: "flex", gap: 2, height: 6, borderRadius: 3, overflow: "hidden" }}>
        {[0,1,2,3].map(i => {
          const ranges = [
            { color: "#dc2626" }, { color: "#d97706" }, { color: "#1d4ed8" }, { color: "#059669" }
          ];
          const segActive = (score < 36 && i === 0) || (score >= 36 && score < 56 && i === 1) || (score >= 56 && score < 76 && i === 2) || (score >= 76 && i === 3);
          return <div key={i} style={{ flex: 1, background: segActive ? ranges[i].color : "var(--paper-200)" }} />;
        })}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 12, fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
        Composite · supply, sale-to-list, inventory
      </div>
    </div>
  );
}

// ============== Biggest Movers ==============
function BiggestMovers({ onPickCounty }) {
  const sorted = [...window.COUNTIES].sort((a, b) => b.zhviYoY - a.zhviYoY);
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();
  return (
    <div>
      <window.SectionHeader
        eyebrow="Year-over-year movers"
        title="Where home values rose and fell the most"
        lede="The metro is splitting. Baltimore City and Falls Church are leading the gainers; Spotsylvania, DC, and Calvert are leading the declines. The federal-commuter exurbs and the District tell one story; tight supply elsewhere tells another."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <MoversCard title="Largest gains" subtitle="Top 5 by ZHVI 1-year change" items={gainers} side="up" onPick={onPickCounty} />
        <MoversCard title="Largest declines" subtitle="Bottom 5 by ZHVI 1-year change" items={losers} side="down" onPick={onPickCounty} />
      </div>
      <window.Source>Source: Zillow Research, ZHVI (All Homes, Smoothed). 1-year change as of April 2026.</window.Source>
    </div>
  );
}

function MoversCard({ title, subtitle, items, side, onPick }) {
  const maxAbs = Math.max(...items.map(c => Math.abs(c.zhviYoY)));
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: 24,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {title}
        </h3>
        <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{subtitle}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((c, i) => {
          const pct = c.zhviYoY * 100;
          const w = (Math.abs(c.zhviYoY) / maxAbs) * 100;
          const color = window.dirColor(c.zhviYoY);
          return (
            <div key={c.fips} onClick={() => onPick && onPick(c.fips)}
                 style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "16px 1fr 80px 90px", alignItems: "center", gap: 12, padding: "8px 4px", borderRadius: 6 }}
                 onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-soft)"}
                 onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", textAlign: "right" }}>{i + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <window.JurisdictionBadge j={c.jurisdiction} />
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.shortName}</span>
              </div>
              <div style={{ position: "relative", height: 14, background: "var(--paper-100)", borderRadius: 3 }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: side === "up" ? 0 : "auto", right: side === "down" ? 0 : "auto",
                  width: w + "%", background: color, borderRadius: 3,
                }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {(pct >= 0 ? "+" : "") + pct.toFixed(1) + "%"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== What's Driving the Market ==============
function WhatsDriving() {
  return (
    <div>
      <window.SectionHeader
        eyebrow="What's driving the market"
        title="Three forces, pulling in different directions"
        lede="The DMV's housing trajectory in 2026 is shaped by federal-employment shifts, the data center boom in Northern Virginia, and an unusually wide affordability split between tight and softening submarkets."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <FederalCard />
        <MortgageCard />
        <InventoryCard />
        <CountySplitCard />
      </div>
    </div>
  );
}

function DriverCard({ kicker, title, callout, calloutColor = "var(--fg-1)", chart, source, link }) {
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: 24,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div className="eyebrow" style={{ color: "var(--fg-3)" }}>{kicker}</div>
      <h3 style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.25,
      }}>{title}</h3>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600,
        letterSpacing: "-0.015em", color: calloutColor, lineHeight: 1.15,
      }}>{callout}</div>
      <div style={{ height: 140, marginTop: 4 }}>{chart}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{source}</span>
        {link && <a href="#" style={{ fontSize: 13, fontWeight: 500 }}>{link} →</a>}
      </div>
    </div>
  );
}

function FederalCard() {
  const data = window.FED_EMPLOYMENT.map(d => ({ ...d, value: d.value / 1000 }));
  return (
    <DriverCard
      kicker="Federal employment"
      title="The DMV lost ~62,000 federal jobs in 2025"
      callout="-14% YoY"
      calloutColor="#dc2626"
      chart={
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="fed-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(d) => new Date(d).getFullYear() === 2026 ? "'26" : new Date(d).getFullYear() === 2025 ? "'25" : new Date(d).getFullYear() === 2024 ? "'24" : "'23"}
                   interval={11} axisLine={{ stroke: "#E7E2D8" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(v) => v + "K"}
                   domain={[280, 400]} axisLine={false} tickLine={false} width={36} />
            <CartesianGrid stroke="#F4EFE5" vertical={false} />
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                     formatter={(v) => [Math.round(v) + "K jobs", "Federal employment"]}
                     labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
            <Area type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} fill="url(#fed-grad)" />
          </AreaChart>
        </ResponsiveContainer>
      }
      source="BLS CES · Apr 2026"
      link="See per-county exposure"
    />
  );
}

function MortgageCard() {
  const data = window.MORTGAGE_RATES;
  return (
    <DriverCard
      kicker="Mortgage rates"
      title="Lowest in three spring seasons"
      callout="6.23%"
      calloutColor="#059669"
      chart={
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(d) => {
                     const dt = new Date(d);
                     return (dt.getMonth() === 0) ? "'" + (dt.getFullYear() % 100) : "";
                   }}
                   interval={0} axisLine={{ stroke: "#E7E2D8" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(v) => v.toFixed(1) + "%"}
                   domain={[6.0, 7.4]} axisLine={false} tickLine={false} width={40} />
            <CartesianGrid stroke="#F4EFE5" vertical={false} />
            <ReferenceLine y={6.81} stroke="#9A9384" strokeDasharray="3 3" />
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                     formatter={(v) => [v.toFixed(2) + "%", "30-yr rate"]}
                     labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
            <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      }
      source="Freddie Mac PMMS · weekly"
    />
  );
}

function InventoryCard() {
  const data = window.LISTINGS;
  return (
    <DriverCard
      kicker="Inventory"
      title="Listings have nearly doubled in a year"
      callout="~13,500 active"
      chart={
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="inv-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A4243B" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#A4243B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(d) => {
                     const dt = new Date(d);
                     return dt.getMonth() === 0 ? "'" + (dt.getFullYear() % 100) : "";
                   }}
                   interval={0} axisLine={{ stroke: "#E7E2D8" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9A9384", fontFamily: "var(--font-mono)" }}
                   tickFormatter={(v) => (v / 1000).toFixed(0) + "K"}
                   axisLine={false} tickLine={false} width={36} />
            <CartesianGrid stroke="#F4EFE5" vertical={false} />
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", borderRadius: 8, border: "1px solid #E7E2D8" }}
                     formatter={(v) => [v.toLocaleString(), "Active listings"]}
                     labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" })} />
            <Area type="monotone" dataKey="value" stroke="#A4243B" strokeWidth={2} fill="url(#inv-grad)" />
          </AreaChart>
        </ResponsiveContainer>
      }
      source="Redfin Data Center"
    />
  );
}

function CountySplitCard() {
  // Top 3 tightest by months supply, bottom 3 softest
  const sorted = [...window.COUNTIES].sort((a, b) => a.monthsSupply - b.monthsSupply);
  const tight = sorted.slice(0, 3);
  const soft = sorted.slice(-3).reverse();
  const all = [...tight.map(c => ({ ...c, group: "tight" })), ...soft.map(c => ({ ...c, group: "soft" }))];
  const max = Math.max(...all.map(c => c.monthsSupply));

  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: 24,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div className="eyebrow" style={{ color: "var(--fg-3)" }}>The county split</div>
      <h3 style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.25,
      }}>Tight close-in, soft on the edges</h3>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", color: "var(--fg-1)", lineHeight: 1.2,
      }}>
        Howard <span style={{ fontFamily: "var(--font-mono)", color: "#059669" }}>1.1 mo</span>
        <span style={{ color: "var(--fg-3)", margin: "0 8px", fontWeight: 400 }}>vs</span>
        DC <span style={{ fontFamily: "var(--font-mono)", color: "#dc2626" }}>6.0 mo</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {all.map((c, i) => {
          const isLast = i === tight.length - 1;
          const w = (c.monthsSupply / max) * 100;
          const color = c.group === "tight" ? "#059669" : "#dc2626";
          return (
            <div key={c.fips}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 50px", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ display: "flex", gap: 6, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <window.JurisdictionBadge j={c.jurisdiction} />
                  <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{c.shortName}</span>
                </span>
                <div style={{ height: 12, background: "var(--paper-100)", borderRadius: 2 }}>
                  <div style={{ width: w + "%", height: "100%", background: color, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {c.monthsSupply.toFixed(1)} mo
                </span>
              </div>
              {isLast && <div style={{ height: 1, background: "var(--border-soft)", margin: "8px 0" }} />}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          Bright MLS · months of supply, Apr 2026
        </span>
        <a href="#" style={{ fontSize: 13, fontWeight: 500 }}>Compare counties →</a>
      </div>
    </div>
  );
}

window.HomePage = HomePage;
