import { ensureOk, fetchText } from './http';
import { ProviderId, RateLimitedError } from './types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes HTML/XML entities in a single pass (so `&amp;amp;` becomes `&amp;`). */
export function unescapeHtml(s: string): string {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex?: string, dec?: string, name?: string) => {
    if (hex ?? dec) {
      const cp = hex ? parseInt(hex, 16) : Number(dec);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[name!.toLowerCase()] ?? m;
  });
}

/** URL that serves BibTeX for `doi` via content negotiation. */
export function doiBibtexUrl(doi: string): string {
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) throw new Error(`Not a DOI: ${doi}`);
  return `https://doi.org/${encodeURI(doi)}`;
}

export function isDoi(s: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(s);
}

/** Fetches BibTeX for a DOI from doi.org (works for Crossref, DataCite, ...). */
export async function fetchDoiBibtex(provider: ProviderId, doi: string, signal: AbortSignal): Promise<string> {
  const url = doiBibtexUrl(doi);
  const res = await fetchText(url, { Accept: 'application/x-bibtex; charset=utf-8' }, signal);
  if (res.status === 429) throw new RateLimitedError(provider, url);
  ensureOk(res);
  const body = unescapeHtml(res.body).trim();
  if (!body.startsWith('@')) throw new Error('doi.org returned something other than BibTeX');
  return body + '\n';
}
