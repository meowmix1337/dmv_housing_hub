/**
 * Typed errors for ingestion. Always throw these from ingest/parse paths
 * so the runner can render a useful summary on failure.
 */

export interface IngestErrorContext {
  source: string;
  series?: string;
  fips?: string;
  url?: string;
  status?: number;
}

export class IngestError extends Error {
  readonly context: IngestErrorContext;
  override readonly cause?: unknown;

  constructor(message: string, context: IngestErrorContext, cause?: unknown) {
    super(message);
    this.name = 'IngestError';
    this.context = context;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodyExcerpt: string;

  constructor(status: number, url: string, bodyExcerpt: string) {
    super(`HTTP ${status} from ${url}: ${bodyExcerpt.slice(0, 200)}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.bodyExcerpt = bodyExcerpt;
  }
}

export class ParseError extends Error {
  readonly source: string;
  readonly detail: string;

  constructor(source: string, detail: string) {
    super(`Parse error in ${source}: ${detail}`);
    this.name = 'ParseError';
    this.source = source;
    this.detail = detail;
  }
}
