import assert from 'node:assert/strict';
import { fetchDoiBibtex } from './doi';
import { ensureOk, fetchText } from './http';
import { assertValidResults, Provider, RateLimitedError, Result } from './types';

export const CROSSREF_ORIGIN = 'https://api.crossref.org';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  'container-title'?: string[];
  issued?: { 'date-parts'?: (number | null)[][] };
  URL?: string;
}

export function crossrefSearchUrl(query: string, rows: number): string {
  const u = new URL('/works', CROSSREF_ORIGIN);
  u.searchParams.set('query.bibliographic', query);
  u.searchParams.set('rows', String(rows));
  u.searchParams.set('select', 'DOI,title,author,container-title,issued,URL');
  return u.toString();
}

function authorName(a: CrossrefAuthor): string {
  return a.name ?? [a.given, a.family].filter((x) => x).join(' ');
}

/** Maps a Crossref `/works` response to results; items without a title are dropped. */
export function parseCrossref(json: unknown): Result[] {
  const items = (json as { message?: { items?: CrossrefItem[] } } | null)?.message?.items ?? [];
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const title = it.title?.[0]?.replace(/\s+/g, ' ').trim();
    if (!it.DOI || !title || seen.has(it.DOI.toLowerCase())) continue;
    seen.add(it.DOI.toLowerCase());
    const r: Result = {
      id: it.DOI,
      title,
      authors: (it.author ?? []).map(authorName).filter((a) => a.length > 0),
      provider: 'crossref',
      url: it.URL ?? `https://doi.org/${it.DOI}`,
    };
    const venue = it['container-title']?.[0];
    if (venue) r.venue = venue;
    const year = it.issued?.['date-parts']?.[0]?.[0];
    if (typeof year === 'number' && Number.isInteger(year)) r.year = year;
    results.push(r);
  }
  return assertValidResults(results);
}

export class CrossrefProvider implements Provider {
  readonly id = 'crossref' as const;

  constructor(private readonly opts: () => { maxResults: number }) {}

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    assert.ok(query.trim().length > 0, 'query must be non-empty');
    const url = crossrefSearchUrl(query, this.opts().maxResults);
    const res = await fetchText(url, { Accept: 'application/json' }, signal);
    if (res.status === 429) throw new RateLimitedError('crossref', url);
    return parseCrossref(JSON.parse(ensureOk(res).body));
  }

  async bibtex(result: Result, signal: AbortSignal): Promise<string> {
    assert.equal(result.provider, 'crossref');
    return fetchDoiBibtex('crossref', result.id, signal);
  }
}
