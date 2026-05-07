import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Write a file atomically: write to a sibling temp file, then rename.
 * Prevents readers from observing half-written content.
 */
export async function writeAtomic(path: string, data: string | Buffer): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${randomUUID()}.tmp`);
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export async function writeJsonAtomic(path: string, data: unknown, pretty = true): Promise<void> {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeAtomic(path, json + '\n');
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  const text = await readFile(path, 'utf-8');
  return JSON.parse(text) as T;
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
