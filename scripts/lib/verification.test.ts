import { describe, it, expect } from 'vitest';
import { parseVerificationMarkdown } from './verification.js';

describe('parseVerificationMarkdown', () => {
  it('extracts source + lastVerified per subsection', () => {
    const md = `
# Title

## Verification

Some preamble.

### fred
- Spot-check URL: https://example.com
- Last verified: 2026-05-10

### census
- Spot-check URL: https://census.example
- Last verified: 2026-04-15
`;
    const records = parseVerificationMarkdown(md);
    expect(records).toEqual([
      { source: 'fred', lastVerified: '2026-05-10' },
      { source: 'census', lastVerified: '2026-04-15' },
    ]);
  });

  it('skips subsections with missing or malformed dates', () => {
    const md = `
## Verification

### fred
- Spot-check URL: https://example.com
- Last verified: 2026-05-10

### bls
- Spot-check URL: https://bls.example
(no Last verified line)

### qcew
- Last verified: not-a-date
`;
    const records = parseVerificationMarkdown(md);
    expect(records).toEqual([{ source: 'fred', lastVerified: '2026-05-10' }]);
  });

  it('returns empty when section is absent', () => {
    expect(parseVerificationMarkdown('# nothing here')).toEqual([]);
  });

  it('stops at the next top-level heading', () => {
    const md = `
## Verification

### fred
- Last verified: 2026-05-10

## Other section

### unrelated
- Last verified: 2026-01-01
`;
    const records = parseVerificationMarkdown(md);
    expect(records).toEqual([{ source: 'fred', lastVerified: '2026-05-10' }]);
  });
});
