import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CountySummary } from '@dmv/shared';
import type { ChoroplethMetric } from '../lib/color-scales.js';
import { buildFillColors } from '../lib/map-style.js';
import { JurisdictionBadge } from './JurisdictionBadge.js';
import { formatCurrency } from '../lib/format.js';

const METRICS: Array<{ id: ChoroplethMetric; label: string }> = [
  { id: 'zhviYoY', label: 'Price change (YoY)' },
  { id: 'zhvi', label: 'Home value' },
  { id: 'daysOnMarket', label: 'Days on market' },
  { id: 'monthsSupply', label: 'Months supply' },
  { id: 'marketHealthScore', label: 'Market health' },
];

const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';
const GEO_URL = '/data/geo/dmv-counties.geojson';
const SOURCE_ID = 'dmv-counties';
const FILL_LAYER = 'dmv-fill';
const OUTLINE_LAYER = 'dmv-outline';

function buildMatchExpression(colors: Record<string, string>): maplibregl.ExpressionSpecification {
  const pairs = Object.entries(colors).flatMap(([fips, color]) => [fips, color]);
  return ['match', ['get', 'fips'], ...pairs, '#E7E2D8'] as unknown as maplibregl.ExpressionSpecification;
}

interface HoverInfo {
  county: CountySummary;
}

interface ChoroplethMapProps {
  counties?: CountySummary[];
}

export function ChoroplethMap({ counties = [] }: ChoroplethMapProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [metric, setMetric] = useState<ChoroplethMetric>('zhviYoY');
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const hoveredFipsRef = useRef<string | null>(null);
  const countiesRef = useRef<CountySummary[]>(counties);
  useEffect(() => { countiesRef.current = counties; }, [counties]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-77.4, 38.9],
      zoom: 7.5,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: GEO_URL,
        promoteId: 'fips',
      });

      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#E7E2D8',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.9,
            0.75,
          ],
        },
      });

      map.addLayer({
        id: OUTLINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            '#2B201A',
            '#C9C2B4',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2,
            0.75,
          ],
        },
      });
    });

    map.on('mousemove', FILL_LAYER, (e) => {
      if (!e.features?.length) return;
      const fips = String(e.features[0]?.properties?.fips ?? '');
      if (!fips) return;
      if (hoveredFipsRef.current && hoveredFipsRef.current !== fips) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredFipsRef.current }, { hover: false });
      }
      map.setFeatureState({ source: SOURCE_ID, id: fips }, { hover: true });
      hoveredFipsRef.current = fips;
      const county = countiesRef.current.find((c) => c.fips === fips);
      if (county) setHovered({ county });
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', FILL_LAYER, () => {
      if (hoveredFipsRef.current) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredFipsRef.current }, { hover: false });
        hoveredFipsRef.current = null;
      }
      setHovered(null);
      map.getCanvas().style.cursor = '';
    });

    map.on('click', FILL_LAYER, (e) => {
      const fips = String(e.features?.[0]?.properties?.fips ?? '');
      if (fips) navigate(`/county/${fips}`);
    });

    return () => map.remove();
  }, [navigate]);

  // Update fill colors when counties or metric changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !counties.length) return;
    const ready = () => {
      const colors = buildFillColors(metric, counties);
      map.setPaintProperty(FILL_LAYER, 'fill-color', buildMatchExpression(colors));
    };
    if (map.isStyleLoaded()) {
      ready();
    } else {
      map.once('idle', ready);
    }
  }, [counties, metric]);

  return (
    <div className="rounded-lg border border-border-soft overflow-hidden relative" style={{ height: 480 }}>
      {/* Metric switcher */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 flex-wrap">
        {METRICS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium shadow-1 transition-colors ${
              metric === m.id
                ? 'bg-ink-900 text-paper-100'
                : 'bg-surface-1 text-fg-2 hover:text-fg-1 border border-border-soft'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Map container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Hover side rail */}
      {hovered && (
        <div className="absolute top-3 right-3 z-10 bg-surface-1 border border-border-soft rounded-lg p-4 shadow-2 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <JurisdictionBadge jurisdiction={hovered.county.jurisdiction} />
            <span className="text-sm font-semibold text-fg-1">{hovered.county.name}</span>
          </div>
          {hovered.county.current.zhvi !== undefined && (
            <div className="text-xs text-fg-3 font-mono">
              ZHVI: {formatCurrency(hovered.county.current.zhvi)}
            </div>
          )}
          {hovered.county.current.zhviYoY !== undefined && (
            <div className="text-xs font-mono" style={{
              color: hovered.county.current.zhviYoY >= 0 ? '#059669' : '#dc2626',
            }}>
              YoY: {hovered.county.current.zhviYoY >= 0 ? '+' : ''}
              {(hovered.county.current.zhviYoY * 100).toFixed(1)}%
            </div>
          )}
          <div className="mt-2 text-xs text-fg-3">Click to view details →</div>
        </div>
      )}

      {/* Empty state when no county data */}
      {counties.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-paper/50 pointer-events-none">
          <span className="text-sm text-fg-3">Loading county data…</span>
        </div>
      )}
    </div>
  );
}

// Named export for direct use; default export for lazy loading
export default ChoroplethMap;
