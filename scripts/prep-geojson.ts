/**
 * One-time prep: download the U.S. county GeoJSON and filter to DMV jurisdictions.
 * Output: web/public/data/geo/dmv-counties.geojson
 *
 * Run: npm run prep-geojson
 */

import 'dotenv/config';
import { join } from 'node:path';
import { fetchJson } from './lib/http.js';
import { writeJsonAtomic } from './lib/storage.js';
import { GEO_DIR } from './lib/paths.js';
import { DMV_COUNTIES } from './lib/counties.js';
import { log } from './lib/log.js';

const SOURCE_URL =
  'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

interface Feature {
  type: 'Feature';
  id?: string;
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface DmvFeature {
  type: 'Feature';
  id: string;
  properties: { fips: string; name: string; jurisdiction: string };
  geometry: unknown;
}

async function main(): Promise<void> {
  log.info({ url: SOURCE_URL }, 'fetching national county GeoJSON');
  const data = await fetchJson<FeatureCollection>(SOURCE_URL, { label: 'plotly-counties-geojson' });

  const countyByFips = new Map(DMV_COUNTIES.map((c) => [c.fips, c]));
  const filtered: { type: 'FeatureCollection'; features: DmvFeature[] } = {
    type: 'FeatureCollection',
    features: data.features
      .filter((f): f is Feature & { id: string } =>
        typeof f.id === 'string' && countyByFips.has(f.id),
      )
      .map((f) => {
        const county = countyByFips.get(f.id)!;
        return {
          type: 'Feature',
          id: f.id,
          properties: {
            fips: county.fips,
            name: county.name,
            jurisdiction: county.jurisdiction,
          },
          geometry: f.geometry,
        };
      }),
  };

  const outPath = join(GEO_DIR, 'dmv-counties.geojson');
  await writeJsonAtomic(outPath, filtered);
  log.info(
    { features: filtered.features.length, expected: countyByFips.size, outPath },
    'wrote DMV GeoJSON',
  );

  if (filtered.features.length !== countyByFips.size) {
    const got = new Set(filtered.features.map((f) => f.id));
    const missing = [...countyByFips.keys()].filter((f) => !got.has(f));
    log.warn({ missing }, 'some DMV FIPS were not found in the source GeoJSON');
  }
}

main().catch((err) => {
  log.fatal({ err: err instanceof Error ? err.message : String(err) }, 'prep-geojson failed');
  process.exit(1);
});
