import assert from 'node:assert/strict';

const KEY_RE = /^[a-z0-9]+$/;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'in', 'for', 'to', 'and', 'with', 'at', 'by', 'from', 'is', 'are', 'towards', 'toward',
]);

const SPECIAL_FOLDS: Record<string, string> = {
  ß: 'ss', æ: 'ae', Æ: 'ae', ø: 'o', Ø: 'o', œ: 'oe', Œ: 'oe', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ð: 'd', þ: 'th', ı: 'i',
};

const TEX_ACCENT = /\\(?:["'`^~=.]|[uvHckbdrt](?![A-Za-z]))\s*\{?\s*([A-Za-z]?)\s*\}?/g;

/** Folds to lowercase ASCII alphanumerics, handling both Unicode and TeX accents (e.g. {\"u}). */
export function asciiFold(s: string): string {
  return s
    .replace(/\\ss\b/g, 'ss')
    .replace(/\\(ae|oe|AE|OE)\b/g, (_, x: string) => x.toLowerCase())
    .replace(/\\([oOlLij])(?![A-Za-z])/g, '$1')
    .replace(TEX_ACCENT, '$1')
    .replace(/[ßæÆøØœŒłŁđĐðþı]/g, (c) => SPECIAL_FOLDS[c] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Handles "Last, First", "First Last", "F Last" (Scholar), and particles like "van der". */
export function lastName(author: string): string {
  const a = author.replace(/[{}]/g, '').trim();
  if (a.includes(',')) return a.split(',')[0]!.trim();
  const words = a.split(/\s+/).filter((w) => w.length > 0);
  // DBLP disambiguates homonyms with a numeric suffix: "Wei Wang 0001".
  while (words.length > 1 && /^\d+$/.test(words[words.length - 1]!)) words.pop();
  return words[words.length - 1] ?? '';
}

export function firstTitleWord(title: string): string {
  const words = title
    .replace(/[{}]/g, '')
    .split(/[\s\-:/]+/)
    .map(asciiFold)
    .filter((w) => w.length > 0);
  return words.find((w) => !STOPWORDS.has(w)) ?? words[0] ?? '';
}

export interface KeyInput {
  authors: string[];
  year?: number;
  title: string;
}

export function generateKey({ authors, year, title }: KeyInput): string {
  const last = asciiFold(lastName(authors[0] ?? '')) || 'anon';
  const key = `${last}${year ?? ''}${firstTitleWord(title)}`;
  assert.match(key, KEY_RE);
  return key;
}

/** Appends a, b, …, z, aa, … until the key is not in `taken` (compared case-insensitively, as BibTeX does). */
export function uniqueKey(base: string, takenKeys: ReadonlySet<string>): string {
  const taken = new Set([...takenKeys].map((k) => k.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 0; ; n++) {
    let suffix = '';
    let k = n;
    do {
      suffix = String.fromCharCode(97 + (k % 26)) + suffix;
      k = Math.floor(k / 26) - 1;
    } while (k >= 0);
    const candidate = base + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
