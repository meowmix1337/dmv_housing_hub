import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeAtomic, writeJsonAtomic, readJson } from './storage.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dmv-storage-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('writes string content to the target path', async () => {
    const path = join(dir, 'out.txt');
    await writeAtomic(path, 'hello world');
    const content = await readFile(path, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('leaves no temp files after a successful write', async () => {
    const path = join(dir, 'out.txt');
    await writeAtomic(path, 'data');
    const files = await readdir(dir);
    expect(files).toEqual(['out.txt']);
  });

  it('creates parent directories if they do not exist', async () => {
    const path = join(dir, 'nested', 'deep', 'out.txt');
    await writeAtomic(path, 'nested');
    const content = await readFile(path, 'utf-8');
    expect(content).toBe('nested');
  });
});

describe('writeJsonAtomic', () => {
  it('writes valid, pretty-printed JSON with a trailing newline', async () => {
    const path = join(dir, 'data.json');
    await writeJsonAtomic(path, { foo: 1, bar: [2, 3] });
    const raw = await readFile(path, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n'); // pretty-printed
  });

  it('round-trips complex objects correctly', async () => {
    const path = join(dir, 'obj.json');
    const obj = { name: 'Montgomery', fips: '24031', value: 3.14, nested: { a: true } };
    await writeJsonAtomic(path, obj);
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    expect(parsed).toEqual(obj);
  });
});

describe('readJson', () => {
  it('reads back what writeJsonAtomic wrote', async () => {
    const path = join(dir, 'roundtrip.json');
    const original = { source: 'fred', count: 42, observations: [] };
    await writeJsonAtomic(path, original);
    const result = await readJson<typeof original>(path);
    expect(result).toEqual(original);
  });

  it('throws on a missing file', async () => {
    await expect(readJson(join(dir, 'nonexistent.json'))).rejects.toThrow();
  });

  it('throws on malformed JSON', async () => {
    const path = join(dir, 'bad.json');
    await writeAtomic(path, '{not valid json}');
    await expect(readJson(path)).rejects.toThrow(SyntaxError);
  });
});
