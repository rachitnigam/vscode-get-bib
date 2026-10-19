import assert from 'node:assert/strict';
import { fetchText, ensureOk } from './http';
import { findBibLink, isBlockedPage, parseScholar, SCHOLAR_ORIGIN } from './parseScholar';
import { Provider, Result, ScholarBlockedError } from './types';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface ScholarOptions {
  userAgent: string;
  maxResults: number;
}

export function scholarSearchUrl(query: string, maxResults: number): string {
  const u = new URL('/scholar', SCHOLAR_ORIGIN);
  u.searchParams.set('hl', 'en');
  u.searchParams.set('q', query);
  // Scholar caps a page at 20 results.
  u.searchParams.set('num', String(Math.min(Math.max(1, maxResults), 20)));
  return u.toString();
}

export function scholarCiteUrl(cid: string): string {
  return `${SCHOLAR_ORIGIN}/scholar?q=info:${encodeURIComponent(cid)}:scholar.google.com/&output=cite&scirp=0&hl=en`;
}

export class ScholarProvider implements Provider {
  readonly id = 'scholar' as const;

  constructor(private readonly opts: () => ScholarOptions) {}

  private headers(): Record<string, string> {
    return {
      'User-Agent': this.opts().userAgent || DEFAULT_USER_AGENT,
      Cookie: 'GSP=CF=4',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    assert.ok(query.trim().length > 0, 'query must be non-empty');
    const { maxResults } = this.opts();
    const url = scholarSearchUrl(query, maxResults);
    const res = await fetchText(url, this.headers(), signal);
    const results = res.status === 200 ? parseScholar(res.body) : [];
    if (results.length === 0 && isBlockedPage(res.url, res.status, res.body)) {
      throw new ScholarBlockedError(url);
    }
    ensureOk(res);
    return results.slice(0, maxResults);
  }

  async bibtex(result: Result, signal: AbortSignal): Promise<string> {
    assert.equal(result.provider, 'scholar');
    const citeUrl = scholarCiteUrl(result.id);
    const cite = await fetchText(citeUrl, this.headers(), signal);
    if (isBlockedPage(cite.url, cite.status, cite.body)) throw new ScholarBlockedError(citeUrl);
    ensureOk(cite);
    const bibUrl = findBibLink(cite.body);
    if (!bibUrl) throw new Error('Scholar cite page has no BibTeX link');
    const bib = await fetchText(bibUrl, this.headers(), signal);
    if (isBlockedPage(bib.url, bib.status, bib.body)) throw new ScholarBlockedError(bibUrl);
    ensureOk(bib);
    if (!bib.body.trimStart().startsWith('@')) throw new Error('Scholar returned something other than BibTeX');
    return bib.body;
  }
}
