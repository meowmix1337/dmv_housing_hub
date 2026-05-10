import { readFile } from 'node:fs/promises';
import { log } from './log.js';

export interface VerificationRecord {
  source: string;
  lastVerified: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the `## Verification` section of DATA_SOURCES.md and extract the
 * `Last verified: YYYY-MM-DD` line for each `### <source>` subsection.
 * Sources whose subsection is missing or whose date is malformed are
 * logged at warn level and omitted from the result.
 */
export function parseVerificationMarkdown(markdown: string): VerificationRecord[] {
  const start = markdown.indexOf('\n## Verification');
  if (start === -1) {
    log.warn('verification: no "## Verification" section found in markdown');
    return [];
  }

  const tail = markdown.slice(start + 1);
  const nextTopLevel = tail.search(/\n## (?!#)/);
  const section = nextTopLevel === -1 ? tail : tail.slice(0, nextTopLevel);

  const records: VerificationRecord[] = [];
  const subsectionRe = /\n### (\S+)\n([\s\S]*?)(?=\n### |\n## |$)/g;
  let match: RegExpExecArray | null;
  while ((match = subsectionRe.exec(section)) !== null) {
    const source = (match[1] ?? '').trim();
    const body = match[2] ?? '';
    if (!source) continue;
    const dateMatch = body.match(/Last verified:\s*(\S+)/i);
    if (!dateMatch || !dateMatch[1]) {
      log.warn({ source }, 'verification: subsection has no "Last verified" line');
      continue;
    }
    const date = dateMatch[1].trim();
    if (!ISO_DATE_RE.test(date)) {
      log.warn({ source, date }, 'verification: malformed date; expected YYYY-MM-DD');
      continue;
    }
    records.push({ source, lastVerified: date });
  }
  return records;
}

export async function readVerificationFromMarkdown(path: string): Promise<VerificationRecord[]> {
  try {
    const text = await readFile(path, 'utf8');
    return parseVerificationMarkdown(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ path, err: msg }, 'verification: could not read markdown file');
    return [];
  }
}
