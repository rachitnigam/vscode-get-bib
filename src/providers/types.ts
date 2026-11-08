import assert from 'node:assert/strict';

/** Selectable providers. `auto` is a fallback chain; a Result's provider is never `auto`. */
export type ProviderId = 'auto' | 'crossref' | 'openalex' | 'arxiv' | 'scholar' | 'dblp';

export const PROVIDER_IDS: readonly ProviderId[] = ['auto', 'crossref', 'openalex', 'arxiv', 'scholar', 'dblp'];

export interface Result {
  id: string;
  title: string;
  /** May be truncated; Scholar truncates with "…". */
  authors: string[];
  venue?: string;
  year?: number;
  url?: string;
  provider: ProviderId;
}

export interface Provider {
  readonly id: ProviderId;
  search(query: string, signal: AbortSignal): Promise<Result[]>;
  /** Throws on failure. */
  bibtex(result: Result, signal: AbortSignal): Promise<string>;
}

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === 'string' && (PROVIDER_IDS as readonly string[]).includes(x);
}

/** The provider served a CAPTCHA / bot check / rate limit instead of data. */
export class BlockedError extends Error {
  constructor(readonly provider: ProviderId, readonly url: string, message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

export class ScholarBlockedError extends BlockedError {
  constructor(url: string) {
    super('scholar', url, 'Google Scholar blocked the request (CAPTCHA / unusual traffic). Try again later, or switch to Crossref.');
    this.name = 'ScholarBlockedError';
  }
}

export class DblpBlockedError extends BlockedError {
  constructor(url: string, status: number) {
    super('dblp', url, `DBLP is rate-limiting or showing a bot check (HTTP ${status}). Try again later.`);
    this.name = 'DblpBlockedError';
  }
}

/** An API answered 429 (rate limit). */
export class RateLimitedError extends BlockedError {
  constructor(provider: ProviderId, url: string) {
    super(provider, url, `${provider} is rate-limiting requests (HTTP 429). Try again later.`);
    this.name = 'RateLimitedError';
  }
}

export class HttpError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`HTTP ${status} fetching ${url}`);
    this.name = 'HttpError';
  }
}

export function assertValidResults(results: Result[]): Result[] {
  const seen = new Set<string>();
  for (const r of results) {
    assert.ok(r.id.length > 0, 'Result.id must be non-empty');
    assert.ok(!seen.has(r.id), `Result.id must be unique within a response: ${r.id}`);
    seen.add(r.id);
    assert.ok(isProviderId(r.provider));
    assert.ok(r.year === undefined || Number.isInteger(r.year));
  }
  return results;
}

/** Validates an untrusted object (e.g. from the webview) as a Result. */
export function toResult(x: unknown): Result {
  assert.ok(typeof x === 'object' && x !== null, 'result must be an object');
  const o = x as Record<string, unknown>;
  assert.ok(typeof o.id === 'string' && o.id.length > 0, 'result.id');
  assert.ok(typeof o.title === 'string', 'result.title');
  assert.ok(Array.isArray(o.authors) && o.authors.every((a) => typeof a === 'string'), 'result.authors');
  assert.ok(isProviderId(o.provider), 'result.provider');
  assert.ok(o.venue === undefined || typeof o.venue === 'string', 'result.venue');
  assert.ok(o.year === undefined || (typeof o.year === 'number' && Number.isInteger(o.year)), 'result.year');
  assert.ok(o.url === undefined || typeof o.url === 'string', 'result.url');
  return {
    id: o.id,
    title: o.title,
    authors: o.authors as string[],
    venue: o.venue as string | undefined,
    year: o.year as number | undefined,
    url: o.url as string | undefined,
    provider: o.provider,
  };
}
