import assert from 'node:assert/strict';
import { fetchDoiBibtex, isDoi } from './doi';
import { ensureOk, fetchText } from './http';
import { assertValidResults, Provider, RateLimitedError, Result } from './types';

export const OPENALEX_ORIGIN = 'https://api.openalex.org';

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null; landing_page_url?: string | null } | null;
}

export function openalexSearchUrl(query: string, n: number): string {
  const u = new URL('/works', OPENALEX_ORIGIN);
  u.searchParams.set('search', query);
  u.searchParams.set('per-page', String(n));
  u.searchParams.set('select', 'id,doi,title,display_name,publication_year,authorships,primary_location');
  return u.toString();
}

/** Maps an OpenAlex `/works` response to results. The id is the DOI when there is one, so BibTeX can be fetched. */
export function parseOpenAlex(json: unknown): Result[] {
  const works = (json as { results?: OpenAlexWork[] } | null)?.results ?? [];
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const w of works) {
    const title = (w.title ?? w.display_name)?.replace(/\s+/g, ' ').trim();
    const doi = w.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    const id = doi || w.id;
    if (!id || !title || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const r: Result = {
      id,
      title,
      authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter((a) => a.length > 0),
      provider: 'openalex',
    };
    const venue = w.primary_location?.source?.display_name;
    if (venue) r.venue = venue;
    if (typeof w.publication_year === 'number' && Number.isInteger(w.publication_year)) r.year = w.publication_year;
    const url = w.primary_location?.landing_page_url;
    if (url) r.url = url;
    results.push(r);
  }
  return assertValidResults(results);
}

export class OpenAlexProvider implements Provider {
  readonly id = 'openalex' as const;

  constructor(private readonly opts: () => { maxResults: number }) {}

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    assert.ok(query.trim().length > 0, 'query must be non-empty');
    const url = openalexSearchUrl(query, this.opts().maxResults);
    const res = await fetchText(url, { Accept: 'application/json' }, signal);
    if (res.status === 429) throw new RateLimitedError('openalex', url);
    return parseOpenAlex(JSON.parse(ensureOk(res).body));
  }

  /** Works without a DOI throw; the caller falls back to a synthesized entry. */
  async bibtex(result: Result, signal: AbortSignal): Promise<string> {
    assert.equal(result.provider, 'openalex');
    if (!isDoi(result.id)) throw new Error('This OpenAlex work has no DOI, so no BibTeX is available');
    return fetchDoiBibtex('openalex', result.id, signal);
  }
}
