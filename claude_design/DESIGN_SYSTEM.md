# DMV Housing — Design System

A one-page reference for the three-page prototype. Forked from the Maryland Housing Hub system and tightened for a data-portal context (FRED + Tufte over Zillow).

All tokens live in `tokens.css`. Use the CSS variables directly in styles — never hard-code the hex.

---

## Color

### Palette

| Token | Hex | Use |
|---|---|---|
| `--primary` (Crab Red) | `#A4243B` | Primary CTAs, brand mark, "DC" badge, "ownership/legal" category accent |
| `--accent` (Old Bay Gold) | `#C9A227` | Spread callout chip, focus ring, brand dot |
| `--bg-paper` | `#FBF8F3` | Page background (warm, not pure white) |
| `--bg-soft` | `#F4EFE5` | Map base, table-bar troughs, hover fills |
| `--surface-1` | `#FFFFFF` | Cards, chart containers, sticky header behind blur |
| `--bg-deep` | `#2B201A` | Footer ground, inverse surfaces |
| `--fg-1` | `#1C1A14` | Primary text + numerals |
| `--fg-2` | `#4A4538` | Secondary text, axis labels |
| `--fg-3` | `#6B6557` | Captions, source lines, eyebrows |
| `--border-soft` | `#E7E2D8` | Default card and divider borders |
| `--border-strong` | `#C9C2B4` | Active form fields, dashed empty-state |

### Data + status

Color in this app encodes meaning, never decoration. Three uses only:

| Use | Color | Token |
|---|---|---|
| Positive YoY / "qualifies" | `#059669` (emerald-600) | inline only — `dirColor()` |
| Negative YoY / "ineligible" | `#dc2626` (red-600) | inline only — `dirColor()` |
| Caution / wide spread | `#FCF1DC` bg + `#EAD174` border + `#C9A227` chip | `--gold-50`, `--gold-200`, `--gold-400` |

### Jurisdiction colors (badges)

| Jur | Bg | Fg |
|---|---|---|
| DC | `#FBEEF0` | `#6E1424` |
| MD | `#FBF5E0` | `#5E4A0F` |
| VA | `#E4EEF7` | `#1B4067` |

### Diverging map ramp

11-stop ramp anchored at zero, used on the home-page hex map for `zhviYoY`:

- Negative: `#7F1D1D → #B91C1C → #DC2626 → #F87171 → #FECACA → #F4EFE5`
- Positive: `#F4EFE5 → #BBF7D0 → #4ADE80 → #16A34A → #15803D → #14532D`

Sequential ramps for non-signed metrics (DOM, supply, health) use a single-hue gradient from `--paper-200` to `--ink-900`.

---

## Typography

Three families. Loaded once via Google Fonts `<link>` in `tokens.css`.

| Family | Where | Notes |
|---|---|---|
| **Source Serif 4** | Display: `h1`, `h2`, hero numerals, large pull-quotes | Optical sizing 8–60. Weight 600 default; 500 for restraint. Tracking `-0.02em` at large sizes. |
| **Inter** | Body, `h3`/`h4`, UI controls, eyebrows | 400/500/600. `font-feature-settings: "tnum"` on tabular contexts. |
| **JetBrains Mono** | All numerics in tables, axis ticks, source/timestamp lines | 400/600. Always with `font-variant-numeric: tabular-nums`. |

### Scale (16px = 1rem)

| Token | Size | Line height | Use |
|---|---|---|---|
| `--fs-display-xl` | 72 | 1.2 | Reserved (deck-style hero) |
| `--fs-display-lg` | 56 | 1.2 | Home hero stat (`5.5%`) |
| `--fs-display-md` | 42 | 1.2 | County page H1 |
| `--fs-h1` | 32 | 1.15 | Page H1 (Compare, sections) |
| `--fs-h2` | 26 | 1.2 | Card headers |
| `--fs-h3` | 20 | 1.35 | Sub-section headers (Inter 600) |
| `--fs-h4` | 17 | 1.35 | Inline labels (Inter 600) |
| `--fs-body` | 16 | 1.55 | Paragraph copy |
| `--fs-small` | 14 | 1.55 | Card body, table cells |
| `--fs-xs` | 12 | 1.4 | Captions, source lines, eyebrows |

**Eyebrows** are 12px Inter 600, uppercase, `letter-spacing: 0.12em`, `--fg-2`. Used above every card heading.

**Numerals** in metric cards are display-serif 32–56px, weight 600, with `font-variant-numeric: tabular-nums` so columns of values align. The accompanying YoY lozenge uses mono 13px so the `+` / `−` sign sits in a fixed column.

---

## Spacing

4px base. Use tokens, never raw px:

```
--space-1: 4    --space-5: 20    --space-9: 48
--space-2: 8    --space-6: 24    --space-10: 64
--space-3: 12   --space-7: 32    --space-11: 80
--space-4: 16   --space-8: 40    --space-12: 96
```

**Rhythm**

- **Card padding:** 24px (`--space-6`) all sides; 20px on dense cards (metric strip).
- **Card gap inside grids:** 16px (`--space-4`).
- **Section vertical rhythm:** 64–96px (`--space-10`–`--space-12`) between major sections.
- **Page gutter:** 32px on desktop, 16px on mobile. `Container` is max 1280px.
- **Form/control gaps:** 8–12px between inline controls; 16px between vertical fields.

**Radii**

- Buttons: 12 (`--radius-md`) — slightly less than the system default to read as utility, not marketing.
- Cards: 16 (`--radius-lg`).
- Pill controls (metric switcher, jurisdiction badges, focus chips): 999.
- Hero corners and modal: 24.

**Shadows** — three steps only:

- `--shadow-1`: resting cards
- `--shadow-2`: hover, popovers, the floating tooltip on the hex map
- `--shadow-3`: modals (none used in current pages)

We did **not** use card shadows on the chart containers; a `1px` border in `--border-soft` is enough and keeps print-friendly.

---

## Component patterns

### Container
```jsx
<Container>{/* max 1280, 32px gutter */}</Container>
```
Every full-width section wraps in `Container`. Hero and footer have their own coloured strip outside the container.

### MetricCard
The most-reused atom. Always:
- Eyebrow (12px uppercase) — what the metric is
- Display value (28–56px Source Serif, tabular)
- Sub-line: `<MonoSpan>YoY%</MonoSpan> <Caption>since last year</Caption>`
- Source line at the bottom in mono 11px, `--fg-3`

Used on Home (5-up), County (6-up), and indirectly in the spread callout.

### Card / SectionCard
- White surface, 16px radius, 24px padding, `1px solid --border-soft`, no shadow.
- Header pattern: eyebrow → H2 → optional sub-paragraph. 20px padding-top, then chart starts at 8px from header.
- Optional left-edge 4px stripe in a category color (used on the "what's driving the market" cards).

### Chart container
- Same as Card.
- Recharts: `CartesianGrid` horizontal-only `#F4EFE5`. Axis text 11px mono, `#6B6557`. No tick lines on Y; Y axis line removed entirely.
- Tooltip: 12px mono, 8px radius, 1px `--border-soft`.
- Every chart has a mono `Source: …` line at the bottom of the card, 11px, `--fg-3`.

### Button
- Primary: `--fg-1` (deep ink) bg, white fg, 12px radius, 6×16 padding, Inter 500/13px. Hover darkens 6%, press 12%.
- Secondary: white bg, 1px `--border-strong`, `--fg-1` text.
- Pill (in metric switcher): 999 radius, active = filled `--fg-1`, inactive = `--surface-1` with 1px `--border-soft` and `--fg-2` text. No icon.

### Badge — JurisdictionBadge
- 999 radius, 2×8 padding, 11px Inter 600, uppercase.
- Background and foreground from the jurisdiction map above.

### Picker (Compare page)
- Sticky left rail, 320px wide, 16px radius card.
- Group header: jurisdiction badge + small uppercase label.
- Row: 16×16 square checkbox (1.5px border, fills `--fg-1` when on with white ✓), then county name. 6×10 row padding. Hover = `--bg-soft`. Capped rows show as 0.4 opacity, `cursor: not-allowed`.

### Diverging bar (biggest movers, ranked table)
- Horizontal bar, 8px tall, sits on a 1px `--border-soft` baseline at zero (when diverging).
- Positive bars in `#059669`, negative in `#dc2626`; sequential bars use the row's series color from the chart legend.

### Spread callout
- Default neutral: white bg, 1px `--border-soft`, 1.0 elevation, an `!` chip in `--paper-200`.
- "Wide" treatment: `#FCF1DC` bg, 1px `#EAD174` border, gold `!` chip. Auto-triggered when spread exceeds metric-specific thresholds (`>50%` rel for value metrics, `>3 mo` supply, `>30 days` DOM).

### Source line
The single most repeated atomic element. Use everywhere a number, chart, or claim appears:

```jsx
<div className="caption" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
  Source: Zillow Research, ZHVI All Homes (Smoothed) · monthly · Updated May 7, 2026
</div>
```

---

## What we deliberately did **not** include

- **No gradients** anywhere except photo scrims (and there are no photos).
- **No drop shadows on charts.** A border is enough; shadows make data feel decorative.
- **No emoji, no illustrations, no stock photography.** A single brand mark (square + dot) is the only graphic.
- **No "Find your dream home" hero CTA.** The hero is text and a metric.
- **No scale or translateY on hover.** Hover changes color/border only — civic info shouldn't bounce.
- **No third-party UI framework.** Tailwind utilities for layout, hand-written tokens for everything else.

---

## Files

```
tokens.css        — all CSS variables + global element styles (the source of truth)
components.jsx    — Container, SiteHeader, SiteFooter, MetricCard, Card, JurisdictionBadge, Source
data.js           — COUNTIES[], METRO, fmtMoney, fmtPct, dirColor, juriBgFg
county-data.js    — COUNTY_DETAIL[fips]: time series + summary
home.jsx          — Home page composition
county.jsx        — County detail composition
compare.jsx       — Compare page composition
```

To drop these designs into the real codebase: copy `tokens.css` to a Tailwind theme extension (or as-is into the global stylesheet), and reuse `MetricCard`, `JurisdictionBadge`, and the chart container pattern verbatim. Field names in `data.js` mirror the canonical `CountySummary` shape from `02-DATA_MODEL.md`, so the prototype data should be drop-in compatible with real loaders.
