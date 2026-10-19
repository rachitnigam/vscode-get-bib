import assert from 'node:assert/strict';
import type { Result } from '../providers/types';

export interface BibEntry {
  type: string;
  key: string;
  /** Field names are lowercased; values are raw (outer braces/quotes stripped). */
  fields: Map<string, string>;
}

const ENTRY_HEAD = /@\s*([A-Za-z]+)\s*([{(])/g;

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return i;
}

/** Returns the index just past the brace that closes the one at `open`. */
function matchBrace(s: string, open: number): number {
  assert.equal(s[open], '{');
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('Unbalanced braces in BibTeX');
}

function readValue(s: string, i: number, close: string): { value: string; end: number } {
  const parts: string[] = [];
  for (;;) {
    i = skipWs(s, i);
    const c = s[i];
    if (c === '{') {
      const end = matchBrace(s, i);
      parts.push(s.slice(i + 1, end - 1));
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      let depth = 0;
      while (j < s.length && !(s[j] === '"' && depth === 0)) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        else if (s[j] === '\\') j++;
        j++;
      }
      parts.push(s.slice(i + 1, j));
      i = j + 1;
    } else {
      const m = /^[^\s,#}\)]+/.exec(s.slice(i));
      if (!m) throw new Error(`Expected a BibTeX value at offset ${i}`);
      parts.push(m[0]);
      i += m[0].length;
    }
    i = skipWs(s, i);
    if (s[i] === '#') {
      i++;
      continue;
    }
    assert.ok(s[i] === ',' || s[i] === close, `Expected ',' or '${close}' after value at offset ${i}`);
    return { value: parts.join(''), end: i };
  }
}

function parseEntryAt(s: string, at: number): { entry: BibEntry; end: number } | undefined {
  ENTRY_HEAD.lastIndex = at;
  const head = ENTRY_HEAD.exec(s);
  if (!head || head.index !== at) return undefined;
  const type = head[1]!.toLowerCase();
  const close = head[2] === '{' ? '}' : ')';
  let i = ENTRY_HEAD.lastIndex;
  if (type === 'comment' || type === 'preamble' || type === 'string') return undefined;

  const keyMatch = /^\s*([^\s,{}()]+)\s*,/.exec(s.slice(i));
  if (!keyMatch) throw new Error('BibTeX entry has no key');
  const key = keyMatch[1]!;
  i += keyMatch[0].length;

  const fields = new Map<string, string>();
  for (;;) {
    i = skipWs(s, i);
    if (s[i] === close) return { entry: { type, key, fields }, end: i + 1 };
    if (s[i] === ',') {
      i++;
      continue;
    }
    const nameMatch = /^([A-Za-z][\w:.+-]*)\s*=/.exec(s.slice(i));
    if (!nameMatch) throw new Error(`Expected a field name at offset ${i}`);
    i += nameMatch[0].length;
    const { value, end } = readValue(s, i, close);
    fields.set(nameMatch[1]!.toLowerCase(), value.trim());
    i = end;
  }
}

/** Parses the first regular entry (not @comment/@string/@preamble) in `text`. */
export function parseEntry(text: string): BibEntry {
  for (const m of text.matchAll(/@\s*[A-Za-z]+\s*[{(]/g)) {
    const r = parseEntryAt(text, m.index);
    if (r) return r.entry;
  }
  throw new Error('No BibTeX entry found');
}

export interface ExistingEntry {
  key: string;
  title?: string;
}

/** Tolerant scan of a whole .bib file: entries that fail to parse still contribute their key. */
export function scanBibFile(text: string): ExistingEntry[] {
  const out: ExistingEntry[] = [];
  for (const m of text.matchAll(/^[ \t]*@\s*([A-Za-z]+)\s*[{(]\s*([^\s,{}()]+)\s*,/gm)) {
    const type = m[1]!.toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    const at = m.index + m[0].indexOf('@');
    let title: string | undefined;
    try {
      title = parseEntryAt(text, at)?.entry.fields.get('title');
    } catch {
      title = undefined;
    }
    out.push({ key: m[2]!, title });
  }
  return out;
}

export function countEntryStarts(text: string): number {
  return (text.match(/^[ \t]*@/gm) ?? []).length;
}

const FIELD_ORDER = ['author', 'title', 'booktitle', 'journal', 'volume', 'number', 'pages', 'howpublished', 'year', 'publisher', 'doi', 'url', 'note'];

export function formatEntry(e: BibEntry): string {
  assert.ok(/^[a-z]+$/.test(e.type), `entry type: ${e.type}`);
  assert.ok(e.key.length > 0 && !/[\s,{}]/.test(e.key), `entry key: ${e.key}`);
  const names = [...e.fields.keys()].sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a);
    const ib = FIELD_ORDER.indexOf(b);
    return (ia < 0 ? FIELD_ORDER.length : ia) - (ib < 0 ? FIELD_ORDER.length : ib) || a.localeCompare(b);
  });
  const width = Math.max(0, ...names.map((n) => n.length));
  // Collapsing newlines keeps a value line from starting with '@', which would read as a new entry.
  const lines = names.map((n) => `  ${n.padEnd(width)} = {${e.fields.get(n)!.replace(/\s*\n\s*/g, ' ')}}`);
  return `@${e.type}{${e.key},\n${lines.join(',\n')}\n}\n`;
}

export function withKey(e: BibEntry, key: string): BibEntry {
  return { ...e, key };
}

/** Lowercase, strip TeX braces/commands and punctuation, collapse whitespace. */
export function normalizeTitle(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\\[a-zA-Z]+\s*/g, '')
    .replace(/[{}\\]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BIB_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '^': '\\^{}',
  '~': '\\~{}',
};

export function escapeBibValue(s: string): string {
  return s.replace(/[{}]/g, '').replace(/[\\&%$#_^~]/g, (c) => BIB_ESCAPES[c] ?? `\\${c}`);
}

/** Builds an entry from search metadata when the provider's BibTeX export is unavailable. */
export function synthesizeEntry(r: Result, key: string): BibEntry {
  const fields = new Map<string, string>();
  const authors = r.authors.filter((a) => a.length > 0);
  if (authors.length > 0) fields.set('author', authors.map(escapeBibValue).join(' and '));
  fields.set('title', escapeBibValue(r.title));
  if (r.venue) fields.set('howpublished', escapeBibValue(r.venue));
  if (r.year !== undefined) fields.set('year', String(r.year));
  if (r.url) fields.set('url', r.url.replace(/[{}]/g, ''));
  fields.set('note', 'synthesized');
  return { type: 'misc', key, fields };
}

/** Splits a BibTeX author field into individual names. */
export function splitAuthors(field: string): string[] {
  return field
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}
