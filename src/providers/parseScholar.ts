import assert from 'node:assert/strict';
import { parse, HTMLElement } from 'node-html-parser';
import { assertValidResults, Result } from './types';

export const SCHOLAR_ORIGIN = 'https://scholar.google.com';

const ELLIPSIS = /(…|\.\.\.)\s*$/;

function clean(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export interface Byline {
  authors: string[];
  venue?: string;
  year?: number;
}

/**
 * Scholar bylines look like "A Author, B Author… - Venue, 2019 - publisher.com".
 * Any segment may be missing; the venue segment may be just a year.
 */
export function parseByline(raw: string): Byline {
  const parts = clean(raw).split(/\s+-\s+/);
  const authorPart = parts[0] ?? '';
  const authors = authorPart
    .split(',')
    .map((a) => clean(a.replace(ELLIPSIS, '')))
    .filter((a) => a.length > 0);

  const out: Byline = { authors };
  const middle = parts.length >= 3 ? parts[1] : parts.length === 2 && /\b\d{4}$/.test(parts[1] ?? '') ? parts[1] : undefined;
  if (middle === undefined) return out;

  const m = /(?:^|,\s*)((?:19|20)\d{2})$/.exec(middle);
  if (m) {
    out.year = Number(m[1]);
    const venue = clean(middle.slice(0, m.index));
    if (venue.length > 0) out.venue = venue;
  } else {
    out.venue = middle;
  }
  return out;
}

function absoluteUrl(href: string): string | undefined {
  try {
    return new URL(href, SCHOLAR_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

/** `undefined` when the result's link is unusable, so the caller drops it. */
function titleOf(h3: HTMLElement): { title: string; url?: string } | undefined {
  const link = h3.querySelector('a');
  if (link) {
    const href = link.getAttribute('href');
    if (!href) return { title: clean(link.text) };
    const url = absoluteUrl(href);
    return url === undefined ? undefined : { title: clean(link.text), url };
  }
  // [CITATION]/[BOOK] entries have no link; drop the type badge spans.
  const copy = parse(h3.toString());
  copy.querySelectorAll('.gs_ctc, .gs_ctu, .gs_ct1, .gs_ct2').forEach((e) => e.remove());
  return { title: clean(copy.text) };
}

export function parseScholar(html: string): Result[] {
  const root = parse(html);
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const div of root.querySelectorAll('div.gs_r.gs_or.gs_scl[data-cid]')) {
    const cid = div.getAttribute('data-cid') ?? '';
    const h3 = div.querySelector('h3.gs_rt');
    if (cid.length === 0 || !h3 || seen.has(cid)) continue;
    seen.add(cid);
    const t = titleOf(h3);
    if (t === undefined || t.title.length === 0) continue;
    const { title, url } = t;
    const byline = div.querySelector('div.gs_a');
    const { authors, venue, year } = byline ? parseByline(byline.text) : { authors: [] as string[], venue: undefined, year: undefined };
    const r: Result = { id: cid, title, authors, provider: 'scholar' };
    if (venue !== undefined) r.venue = venue;
    if (year !== undefined) r.year = year;
    if (url !== undefined) r.url = url;
    results.push(r);
  }
  return assertValidResults(results);
}

/** Finds the "BibTeX" export link on a Scholar `output=cite` page. */
export function findBibLink(citeHtml: string): string | undefined {
  const root = parse(citeHtml);
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (href && /scholar\.bib\?/.test(href)) {
      const abs = absoluteUrl(href);
      if (abs === undefined) continue;
      assert.ok(!abs.includes('&amp;'), 'href must be entity-decoded');
      return abs;
    }
  }
  return undefined;
}

export function isBlockedPage(url: string, status: number, body: string): boolean {
  // Scholar answers throttled or flagged clients with 429 or a bare 403.
  if (status === 429 || status === 403) return true;
  if (/\/sorry\//.test(url) || /[?&]continue=/.test(url) && /sorry/.test(url)) return true;
  // A BibTeX body may legitimately mention "reCAPTCHA" or "unusual traffic" in a title.
  if (body.trimStart().startsWith('@')) return false;
  return /gs_captcha|id="captcha|unusual traffic|recaptcha|\/sorry\/index/i.test(body);
}
