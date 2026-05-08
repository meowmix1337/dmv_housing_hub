import { createGzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const BUDGET_BYTES = 500 * 1024;
const DIST_DIR = join(import.meta.dirname, '..', 'web', 'dist', 'assets');

async function gzipSize(filePath: string): Promise<number> {
  let size = 0;
  const counter = new Writable({
    write(chunk, _enc, cb) {
      size += (chunk as Buffer).length;
      cb();
    },
  });
  await pipeline(createReadStream(filePath), createGzip(), counter);
  return size;
}

const files = (await readdir(DIST_DIR)).filter((f) => f.endsWith('.js'));
const results: Array<{ name: string; gz: number }> = [];

for (const file of files) {
  const gz = await gzipSize(join(DIST_DIR, file));
  results.push({ name: file, gz });
}

results.sort((a, b) => b.gz - a.gz);

let failed = false;
for (const { name, gz } of results) {
  const kb = (gz / 1024).toFixed(1);
  const headroom = ((BUDGET_BYTES - gz) / 1024).toFixed(1);
  const status = gz > BUDGET_BYTES ? '✗ OVER BUDGET' : `headroom: ${headroom} kB`;
  console.log(`${kb.padStart(7)} kB gz  ${status.padEnd(20)}  ${name}`);
  if (gz > BUDGET_BYTES) failed = true;
}

const largest = results[0];
if (largest) {
  console.log(`\nlargest: ${(largest.gz / 1024).toFixed(1)} kB / budget 500 kB`);
}

if (failed) {
  console.error('\nBundle size check FAILED: one or more chunks exceed 500 kB gz');
  process.exit(1);
}
