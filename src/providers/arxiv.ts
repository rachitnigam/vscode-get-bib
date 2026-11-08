import assert from 'node:assert/strict';
import { BibEntry, escapeBibValue, formatEntry } from '../bib/bibtex';
import { unescapeHtml } from './doi';
import { ensureOk, fetchText } from './http';
import { assertValidResults, Provider, RateLimitedError, Result } from './types';

export const ARXIV_ORIGIN = 'https://export.arxiv.org';

export function arxivSearchUrl(query: string, n: number): string {
  const terms = query.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
  assert.ok(terms.length > 0, 'query must contain a searchable term');
  const u = new URL('/api/query', ARXIV_ORIGIN);
  u.searchParams.set('search_query', terms.map((t) => `all:${t}`).join(' AND '));
  u.searchParams.set('max_results', String(n));
  return u.toString();
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unescapeHtml(m[1]!).replace(/\s+/g, ' ').trim() : undefined;
}

/** Parses an arXiv Atom feed. Uses regexes because the feed's shape is fixed and small. */
export function parseArxiv(xml: string): Result[] {
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]!;
    const absId = tag(e, 'id');
    const title = tag(e, 'title');
    const id = absId?.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const authors = [...e.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((a) =>
      unescapeHtml(a[1]!).replace(/\s+/g, ' ').trim(),
    );
    const cls = /<arxiv:primary_category[^>]*\bterm="([^"]+)"/.exec(e)?.[1];
    const r: Result = {
      id,
      title,
      authors,
      venue: tag(e, 'arxiv:journal_ref') ?? `arXiv:${id}${cls ? ` [${cls}]` : ''}`,
      provider: 'arxiv',
      url: `https://arxiv.org/abs/${id}`,
    };
    const year = Number(/^(\d{4})-/.exec(tag(e, 'published') ?? '')?.[1]);
    if (Number.isInteger(year)) r.year = year;
    results.push(r);
  }
  return assertValidResults(results);
}

/** arXiv has no BibTeX export, so build the conventional `@misc` entry from metadata. */
export function arxivBibtex(r: Result): string {
  const fields = new Map<string, string>();
  if (r.authors.length > 0) fields.set('author', r.authors.map(escapeBibValue).join(' and '));
  fields.set('title', escapeBibValue(r.title));
  if (r.year !== undefined) fields.set('year', String(r.year));
  fields.set('eprint', r.id);
  fields.set('archiveprefix', 'arXiv');
  const cls = /\[([^\]]+)\]$/.exec(r.venue ?? '')?.[1];
  if (cls) fields.set('primaryclass', cls);
  fields.set('url', `https://arxiv.org/abs/${r.id}`);
  const entry: BibEntry = { type: 'misc', key: `arxiv${r.id.replace(/[^A-Za-z0-9]/g, '')}`, fields };
  return formatEntry(entry);
}

export class ArxivProvider implements Provider {
  readonly id = 'arxiv' as const;

  constructor(private readonly opts: () => { maxResults: number }) {}

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    assert.ok(query.trim().length > 0, 'query must be non-empty');
    const url = arxivSearchUrl(query, this.opts().maxResults);
    const res = await fetchText(url, { Accept: 'application/atom+xml' }, signal);
    if (res.status === 429) throw new RateLimitedError('arxiv', url);
    return parseArxiv(ensureOk(res).body);
  }

  async bibtex(result: Result): Promise<string> {
    assert.equal(result.provider, 'arxiv');
    return arxivBibtex(result);
  }
}
