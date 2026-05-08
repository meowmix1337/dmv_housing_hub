import { describe, expect, it } from 'vitest';
import { buildFipsIndex } from './zillow.js';

describe('buildFipsIndex', () => {
  it('maps "montgomery county" to 24031', () => {
    const idx = buildFipsIndex();
    expect(idx.get('montgomery county')).toBe('24031');
  });

  it('maps "district of columbia" to 11001', () => {
    const idx = buildFipsIndex();
    expect(idx.get('district of columbia')).toBe('11001');
  });

  it('maps "prince george\'s county" to 24033', () => {
    const idx = buildFipsIndex();
    expect(idx.get("prince george's county")).toBe('24033');
  });

  it('maps "alexandria city" to 51510 (full lowercase name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria city')).toBe('51510');
  });

  it('maps "alexandria" to 51510 (stripped city suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria')).toBe('51510');
  });

  it('maps "falls church city" to 51610 (full name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church city')).toBe('51610');
  });

  it('maps "falls church" to 51610 (stripped suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church')).toBe('51610');
  });
});
