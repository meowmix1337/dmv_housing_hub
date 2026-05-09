import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { join } from 'node:path';
import type { Observation } from '@dmv/shared';
import { log } from '../lib/log.js';
import { writeJsonAtomic } from '../lib/storage.js';
import { CACHE_DIR } from '../lib/paths.js';
import { IngestError } from '../lib/errors.js';
import type { DataSource, IngestResult } from './DataSource.js';
import { FredSource } from './fred.js';
import { CensusSource } from './census.js';
import { BlsSource } from './bls.js';
import { ZillowSource } from './zillow.js';
import { RedfinSource } from './redfin.js';
import { QcewSource } from './qcew.js';

const REGISTRY: Record<string, () => DataSource> = {
  fred: () => new FredSource(),
  census: () => new CensusSource(),
  bls: () => new BlsSource(),
  zillow: () => new ZillowSource(),
  redfin: () => new RedfinSource(),
  qcew: () => new QcewSource(),
};

interface CliArgs {
  source?: string;
  all: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { all: false };
  for (const arg of argv) {
    if (arg === '--all') {
      args.all = true;
    } else if (arg.startsWith('--source=')) {
      args.source = arg.slice('--source='.length);
    }
  }
  return args;
}

async function runOne(name: string): Promise<IngestResult> {
  const factory = REGISTRY[name];
  if (!factory) {
    throw new IngestError(`unknown source: ${name}`, { source: name });
  }
  const source = factory();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  log.info({ source: source.name, cadence: source.cadence }, 'ingest:start');
  let observations: Observation[];
  try {
    observations = await source.fetch();
  } catch (err) {
    log.error({ source: source.name, err: errMessage(err) }, 'ingest:failed');
    throw err;
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;

  const cachePath = join(CACHE_DIR, `${source.name}.json`);
  await writeJsonAtomic(cachePath, {
    source: source.name,
    startedAt,
    finishedAt,
    durationMs,
    count: observations.length,
    observations,
  });

  log.info(
    { source: source.name, count: observations.length, durationMs, cachePath },
    'ingest:done',
  );

  return {
    source: source.name,
    observations,
    startedAt,
    finishedAt,
    durationMs,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let sources: string[];
  if (args.all) {
    sources = Object.keys(REGISTRY);
  } else if (args.source) {
    sources = [args.source];
  } else {
    process.stderr.write(
      `usage: tsx ingest/run.ts (--source=<name> | --all)\n` +
        `available sources: ${Object.keys(REGISTRY).join(', ')}\n`,
    );
    process.exit(2);
  }

  const failures: string[] = [];
  for (const name of sources) {
    try {
      await runOne(name);
    } catch (err) {
      failures.push(name);
      log.error({ source: name, err: errMessage(err) }, 'source failed');
    }
  }

  if (failures.length > 0) {
    log.error({ failures }, 'one or more sources failed');
    process.exit(1);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

main().catch((err) => {
  log.fatal({ err: errMessage(err) }, 'unhandled error in run.ts');
  process.exit(1);
});
