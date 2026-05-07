/* global React */
/* DMV Housing — shared UI primitives */

const { useState, useEffect, useRef } = React;

// ----- Brand mark -----
function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#2B201A" />
      {/* three vertical bars: DC / MD / VA */}
      <rect x="7" y="9" width="4" height="14" rx="1" fill="#dc2626" />
      <rect x="14" y="13" width="4" height="10" rx="1" fill="#ca8a04" />
      <rect x="21" y="11" width="4" height="12" rx="1" fill="#1d4ed8" />
    </svg>
  );
}

// ----- Top header -----
function SiteHeader({ current, onNav }) {
  const links = [
    { id: "home", label: "Overview" },
    { id: "counties", label: "Counties" },
    { id: "compare", label: "Compare" },
    { id: "data", label: "Data & methods" },
  ];
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "rgba(251, 248, 243, 0.88)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border-soft)",
      height: 64,
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 32px",
        height: "100%", display: "flex", alignItems: "center", gap: 32,
      }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onNav && onNav("home"); }}
           style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <BrandMark />
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600,
            color: "var(--fg-1)", letterSpacing: "-0.01em",
          }}>DMV Housing</span>
        </a>
        <nav style={{ display: "flex", gap: 2, marginLeft: 16 }}>
          {links.map(l => (
            <a key={l.id} href="#" onClick={(e) => { e.preventDefault(); onNav && onNav(l.id); }}
               style={{
                 padding: "8px 14px", fontSize: 14, fontWeight: 500,
                 color: current === l.id ? "var(--fg-1)" : "var(--fg-2)",
                 textDecoration: "none", borderRadius: 8,
                 background: current === l.id ? "var(--bg-soft)" : "transparent",
               }}>{l.label}</a>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            Updated {window.METRO.lastUpdated}
          </span>
          <a href="#" style={{
            fontSize: 13, fontWeight: 500, color: "var(--fg-2)",
            padding: "6px 12px", border: "1px solid var(--border-soft)",
            borderRadius: 8, textDecoration: "none", background: "var(--surface-1)",
          }}>GitHub</a>
        </div>
      </div>
    </header>
  );
}

// ----- Footer -----
function SiteFooter() {
  const sources = [
    { name: "U.S. Federal Housing Finance Agency", series: "FHFA HPI, via FRED" },
    { name: "Zillow Research", series: "ZHVI All Homes" },
    { name: "Redfin Data Center", series: "Median sale price, DOM" },
    { name: "U.S. Census Bureau", series: "ACS 5-year 2023" },
    { name: "Bureau of Labor Statistics", series: "CES, QCEW" },
    { name: "Freddie Mac PMMS", series: "30-year fixed rate" },
    { name: "Bright MLS, NAR", series: "Forecasts" },
  ];
  return (
    <footer style={{ background: "var(--bg-deep)", color: "var(--fg-on-deep)", marginTop: 96 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "64px 32px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 48 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <BrandMark size={32} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>DMV Housing</span>
            </div>
            <p style={{ marginTop: 16, fontSize: 14, color: "var(--fg-on-deep-2)", lineHeight: 1.55, maxWidth: 320 }}>
              A free, public dashboard for the Washington, D.C., Maryland, and Virginia housing market.
              Data is read-only and sourced from federal agencies and major industry feeds.
            </p>
          </div>
          <div>
            <div className="eyebrow" style={{ color: "var(--paper-400)", marginBottom: 12 }}>Pages</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><a href="#" style={{ color: "var(--fg-on-deep)", fontSize: 14, textDecoration: "none" }}>Overview</a></li>
              <li><a href="#" style={{ color: "var(--fg-on-deep)", fontSize: 14, textDecoration: "none" }}>All counties</a></li>
              <li><a href="#" style={{ color: "var(--fg-on-deep)", fontSize: 14, textDecoration: "none" }}>Compare counties</a></li>
              <li><a href="#" style={{ color: "var(--fg-on-deep)", fontSize: 14, textDecoration: "none" }}>Methodology</a></li>
            </ul>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div className="eyebrow" style={{ color: "var(--paper-400)", marginBottom: 12 }}>Data sources</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, columns: 2, columnGap: 32 }}>
              {sources.map(s => (
                <li key={s.name} style={{ fontSize: 13, color: "var(--fg-on-deep-2)", marginBottom: 8, breakInside: "avoid" }}>
                  <span style={{ color: "var(--fg-on-deep)" }}>{s.name}</span>{" — "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.series}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{
          marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--paper-400)",
          fontFamily: "var(--font-mono)",
        }}>
          <span>Last refreshed {window.METRO.lastUpdated} · Open source on GitHub</span>
          <span>Not investment advice. Not affiliated with any government agency.</span>
        </div>
      </div>
    </footer>
  );
}

// ----- Jurisdiction badge -----
function JurisdictionBadge({ j }) {
  const c = window.juriBgFg(j);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em",
      fontFamily: "var(--font-mono)", minWidth: 28,
    }}>{j}</span>
  );
}

// ----- Card primitives -----
function Card({ children, padding = 24, style }) {
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16, padding,
      border: "1px solid var(--border-soft)", ...style,
    }}>{children}</div>
  );
}

function MetricCard({ label, value, sub, source, change, changeLabel = "YoY" }) {
  const dir = change != null ? window.dirColor(change) : null;
  return (
    <div style={{
      background: "var(--surface-1)", borderRadius: 16,
      border: "1px solid var(--border-soft)", padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 6, minHeight: 130,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500, color: "var(--fg-3)",
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600,
        color: "var(--fg-1)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em", marginTop: 2,
      }}>{value}</div>
      {change != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{
            color: dir, fontWeight: 600, fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-mono)",
          }}>{window.fmtPct(change, { signed: true })}</span>
          <span style={{ color: "var(--fg-3)" }}>{changeLabel}</span>
        </div>
      )}
      {sub && !change && (
        <div style={{ fontSize: 13, color: "var(--fg-3)" }}>{sub}</div>
      )}
      {source && (
        <div style={{ marginTop: "auto", paddingTop: 12, fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          {source}
        </div>
      )}
    </div>
  );
}

// ----- Section header -----
function SectionHeader({ eyebrow, title, lede, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, marginBottom: 24 }}>
      <div style={{ maxWidth: 720 }}>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h2 style={{
          fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600,
          letterSpacing: "-0.015em", lineHeight: 1.2, color: "var(--fg-1)",
        }}>{title}</h2>
        {lede && <p style={{
          marginTop: 8, fontSize: 15, color: "var(--fg-2)", lineHeight: 1.55, maxWidth: 640,
        }}>{lede}</p>}
      </div>
      {actions}
    </div>
  );
}

// ----- Container -----
function Container({ children, style }) {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px", ...style }}>
      {children}
    </div>
  );
}

// ----- Source line -----
function Source({ children }) {
  return (
    <div style={{
      fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)",
      marginTop: 12,
    }}>{children}</div>
  );
}

Object.assign(window, {
  BrandMark, SiteHeader, SiteFooter, JurisdictionBadge,
  Card, MetricCard, SectionHeader, Container, Source,
});
