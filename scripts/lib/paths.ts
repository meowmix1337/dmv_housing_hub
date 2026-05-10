import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location (`scripts/lib/paths.ts`) */
export const REPO_ROOT = resolve(here, '../..');

export const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');
export const CACHE_DIR = resolve(SCRIPTS_DIR, '.cache');
export const WEB_DATA_DIR = resolve(REPO_ROOT, 'web/public/data');
export const COUNTIES_DIR = resolve(WEB_DATA_DIR, 'counties');
export const METRICS_DIR = resolve(WEB_DATA_DIR, 'metrics');
export const GEO_DIR = resolve(WEB_DATA_DIR, 'geo');
export const MANIFEST_PATH = resolve(WEB_DATA_DIR, 'manifest.json');
export const DATA_SOURCES_MD_PATH = resolve(REPO_ROOT, 'DATA_SOURCES.md');
