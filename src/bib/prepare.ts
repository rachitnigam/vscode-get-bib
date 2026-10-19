import assert from 'node:assert/strict';
import type { Result } from '../providers/types';
import {
  BibEntry,
  countEntryStarts,
  formatEntry,
  normalizeTitle,
  parseEntry,
  scanBibFile,
  splitAuthors,
  synthesizeEntry,
  withKey,
} from './bibtex';
import { generateKey, uniqueKey } from './keygen';

export interface PrepareOptions {
  keepProviderKeys: boolean;
}

export interface Prepared {
  entry: BibEntry;
  text: string;
  /** Key of an existing entry with a normalized-equal title, if any. */
  duplicateOf?: string;
  /** Set when provider BibTeX was present but unparseable, so the entry was synthesized. */
  parseError?: string;
}

function parseYear(s: string | undefined): number | undefined {
  const t = s?.trim() ?? '';
  return /^\d{4}$/.test(t) ? Number(t) : undefined;
}

function keyFor(entry: BibEntry, result: Result): string {
  const author = entry.fields.get('author');
  return generateKey({
    authors: author ? splitAuthors(author) : result.authors,
    year: parseYear(entry.fields.get('year')) ?? result.year,
    title: entry.fields.get('title') ?? result.title,
  });
}

/**
 * Turns provider BibTeX (or `undefined`, meaning synthesize from metadata) into the
 * entry text to append to `existing`.
 */
export function prepareEntry(raw: string | undefined, result: Result, existing: string, opts: PrepareOptions): Prepared {
  let entry: BibEntry | undefined;
  let parseError: string | undefined;
  if (raw !== undefined) {
    try {
      entry = parseEntry(raw);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }
  const fromProvider = entry !== undefined;
  entry ??= synthesizeEntry(result, 'tmp');

  const base = fromProvider && opts.keepProviderKeys ? entry.key : keyFor(entry, result);
  const current = scanBibFile(existing);
  entry = withKey(entry, uniqueKey(base, new Set(current.map((e) => e.key))));

  const title = normalizeTitle(entry.fields.get('title') ?? result.title);
  const dup = title.length > 0 ? current.find((e) => e.title !== undefined && normalizeTitle(e.title) === title) : undefined;

  const text = formatEntry(entry);
  assert.ok(text.startsWith('@'));
  const out: Prepared = { entry, text, duplicateOf: dup?.key };
  if (parseError !== undefined) out.parseError = parseError;
  return out;
}

export interface Splice {
  /** Replace `existing.slice(offset)` (trailing whitespace) with `text`. */
  offset: number;
  text: string;
}

/** Ensures exactly one blank line precedes the entry and the file ends with a single newline. */
export function appendSplice(existing: string, entryText: string): Splice {
  assert.ok(entryText.startsWith('@'));
  assert.ok(entryText.endsWith('\n'));
  const offset = existing.replace(/\s+$/, '').length;
  const text = (offset === 0 ? '' : '\n\n') + entryText;
  assert.ok(/^\s*$/.test(existing.slice(offset)));
  const after = existing.slice(0, offset) + text;
  assert.equal(countEntryStarts(after), countEntryStarts(existing) + 1, 'exactly one new entry must be appended');
  return { offset, text };
}
