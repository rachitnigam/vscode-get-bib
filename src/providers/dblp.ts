import assert from 'node:assert/strict';
import { ensureOk, fetchText } from './http';
import { assertValidResults, DblpBlockedError, Provider, Result } from './types';

export const DBLP_ORIGIN = 'https://dblp.org';

interface DblpAuthor {
  text?: string;
}

interface DblpInfo {
  key?: string;
  title?: string;
  venue?: string | string[];
  year?: string;
  ee?: string | string[];
  url?: string;
  authors?: { author?: DblpAuthor | DblpAuthor[] };
}

interface DblpResponse {
  result?: { hits?: { hit?: { info?: DblpInfo }[] } };
}

function first(x: string | string[] | undefined): string | undefined {
  return Array.isArray(x) ? x[0] : x;
}

/** DBLP disambiguates homonyms with a numeric suffix ("Wei Wang 0001"); drop it for display. */
function cleanAuthor(a: string): string {
  return a.replace(/\s+\d{4}$/, '').trim();
}

export function parseDblp(json: unknown): Result[] {
  const hits = (json as DblpResponse)?.result?.hits?.hit ?? [];
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const { info } of hits) {
    if (!info?.key || !info.title || seen.has(info.key)) continue;
    seen.add(info.key);
    const rawAuthors = info.authors?.author;
    const authors = (Array.isArray(rawAuthors) ? rawAuthors : rawAuthors ? [rawAuthors] : [])
      .map((a) => cleanAuthor(a.text ?? ''))
      .filter((a) => a.length > 0);
    const r: Result = {
      id: info.key,
      title: info.title.replace(/\.$/, ''),
      authors,
      provider: 'dblp',
    };
    const venue = first(info.venue);
    if (venue) r.venue = venue;
    const year = info.year ? Number(info.year) : NaN;
    if (Number.isInteger(year)) r.year = year;
    const url = first(info.ee) ?? info.url;
    if (url) r.url = url;
    results.push(r);
  }
  return assertValidResults(results);
}

/** DBLP answers bots with 429, or with a 202 HTML proof-of-work page (Anubis). */
export function isDblpBlocked(status: number, body: string): boolean {
  if (status === 429 || status === 202) return true;
  return status >= 200 && status < 300 && /^<(!doctype|html)/i.test(body.trimStart());
}

export function dblpSearchUrl(query: string, n: number): string {
  const u = new URL('/search/publ/api', DBLP_ORIGIN);
  u.searchParams.set('q', query);
  u.searchParams.set('format', 'json');
  u.searchParams.set('h', String(n));
  return u.toString();
}

export function dblpBibUrl(key: string): string {
  assert.ok(/^[\w\-/.]+$/.test(key) && !key.includes('..'), `unexpected DBLP key: ${key}`);
  return `${DBLP_ORIGIN}/rec/${key}.bib`;
}

export class DblpProvider implements Provider {
  readonly id = 'dblp' as const;

  constructor(private readonly opts: () => { maxResults: number }) {}

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    assert.ok(query.trim().length > 0, 'query must be non-empty');
    const url = dblpSearchUrl(query, this.opts().maxResults);
    const res = await fetchText(url, { Accept: 'application/json' }, signal);
    if (isDblpBlocked(res.status, res.body)) throw new DblpBlockedError(url, res.status);
    return parseDblp(JSON.parse(ensureOk(res).body));
  }

  async bibtex(result: Result, signal: AbortSignal): Promise<string> {
    assert.equal(result.provider, 'dblp');
    const url = dblpBibUrl(result.id);
    const res = await fetchText(url, { Accept: 'text/plain' }, signal);
    if (isDblpBlocked(res.status, res.body)) throw new DblpBlockedError(url, res.status);
    ensureOk(res);
    if (!res.body.trimStart().startsWith('@')) throw new Error('DBLP returned something other than BibTeX');
    return res.body;
  }
}
