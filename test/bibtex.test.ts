import { describe, expect, it } from 'vitest';
import {
  countEntryStarts,
  formatEntry,
  normalizeTitle,
  parseEntry,
  scanBibFile,
  synthesizeEntry,
  withKey,
} from '../src/bib/bibtex';
import { appendSplice, prepareEntry } from '../src/bib/prepare';
import type { Result } from '../src/providers/types';

const SCHOLAR_BIB = `@article{vaswani2017attention,
  title={Attention is all you need},
  author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N and Kaiser, {\\L}ukasz and Polosukhin, Illia},
  journal={Advances in neural information processing systems},
  volume={30},
  year={2017}
}
`;

const DBLP_BIB = `@inproceedings{DBLP:conf/nips/VaswaniSPUJGKP17,
  author       = {Ashish Vaswani and
                  Noam Shazeer and
                  Illia Polosukhin},
  title        = {Attention is All you Need},
  booktitle    = {Advances in Neural Information Processing Systems 30: Annual Conference
                  on Neural Information Processing Systems 2017, December 4-9, 2017,
                  Long Beach, CA, {USA}},
  pages        = {5998--6008},
  year         = {2017},
  url          = {https://proceedings.neurips.cc/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html},
  timestamp    = {Thu, 21 Jan 2021 15:15:21 +0100},
  biburl       = {https://dblp.org/rec/conf/nips/VaswaniSPUJGKP17.bib},
  bibsource    = {dblp computer science bibliography, https://dblp.org}
}
`;

const scholarResult: Result = {
  id: '5Gohgn6QFikJ',
  title: 'Attention is all you need',
  authors: ['A Vaswani', 'N Shazeer'],
  venue: 'Advances in neural …',
  year: 2017,
  url: 'https://proceedings.neurips.cc/paper/7181-attention-is-all-you-need',
  provider: 'scholar',
};

describe('parseEntry', () => {
  it('parses Scholar BibTeX', () => {
    const e = parseEntry(SCHOLAR_BIB);
    expect(e.type).toBe('article');
    expect(e.key).toBe('vaswani2017attention');
    expect(e.fields.get('year')).toBe('2017');
    expect(e.fields.get('author')).toContain('Kaiser, {\\L}ukasz');
  });

  it('parses DBLP BibTeX with aligned fields and multi-line values', () => {
    const e = parseEntry(DBLP_BIB);
    expect(e.type).toBe('inproceedings');
    expect(e.key).toBe('DBLP:conf/nips/VaswaniSPUJGKP17');
    expect(e.fields.get('title')).toBe('Attention is All you Need');
    expect(e.fields.get('booktitle')).toContain('{USA}');
    expect(e.fields.get('pages')).toBe('5998--6008');
  });

  it('handles quoted values, bare numbers, concatenation and parentheses', () => {
    const e = parseEntry('@comment{skip me}\n@Book(knuth, title = "The {TeX}book", year = 1984, note = "a" # {b},)');
    expect(e).toEqual({
      type: 'book',
      key: 'knuth',
      fields: new Map([
        ['title', 'The {TeX}book'],
        ['year', '1984'],
        ['note', 'ab'],
      ]),
    });
  });

  it('rejects input without an entry', () => {
    expect(() => parseEntry('<html>blocked</html>')).toThrow(/No BibTeX entry/);
    expect(() => parseEntry('@article{k, title={unbalanced}')).toThrow();
  });
});

describe('formatEntry / withKey', () => {
  it('rewrites the key and round-trips', () => {
    const e = withKey(parseEntry(SCHOLAR_BIB), 'vaswani2017attentiona');
    const text = formatEntry(e);
    expect(text.startsWith('@article{vaswani2017attentiona,\n')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.indexOf('author')).toBeLessThan(text.indexOf('title'));
    const again = parseEntry(text);
    expect(again.key).toBe('vaswani2017attentiona');
    expect(again.fields).toEqual(e.fields);
  });
});

describe('scanBibFile', () => {
  it('lists keys and titles, skipping @string/@comment, tolerating broken entries', () => {
    const file = `@string{nips = "NeurIPS"}\n${SCHOLAR_BIB}\n@comment{x}\n@misc{broken, title = {oops\n\n${DBLP_BIB}`;
    expect(scanBibFile(file).map((e) => e.key)).toEqual(['vaswani2017attention', 'broken', 'DBLP:conf/nips/VaswaniSPUJGKP17']);
    expect(scanBibFile(SCHOLAR_BIB)[0]!.title).toBe('Attention is all you need');
  });
});

describe('normalizeTitle', () => {
  it('ignores case, braces, TeX and punctuation', () => {
    expect(normalizeTitle('Attention is {All} you Need.')).toBe(normalizeTitle('attention is all you need'));
    expect(normalizeTitle('{\\"U}ber Graphen')).toBe('uber graphen');
    expect(normalizeTitle('Über Graphen')).toBe('uber graphen');
  });
});

describe('synthesizeEntry', () => {
  it('builds a marked @misc from result metadata', () => {
    const e = synthesizeEntry({ ...scholarResult, title: 'R&D at 100%' }, 'k');
    expect(e.type).toBe('misc');
    expect(e.fields.get('note')).toBe('synthesized');
    expect(e.fields.get('author')).toBe('A Vaswani and N Shazeer');
    expect(e.fields.get('title')).toBe('R\\&D at 100\\%');
    expect(e.fields.get('year')).toBe('2017');
    expect(parseEntry(formatEntry(e)).fields).toEqual(e.fields);
  });
});

describe('prepareEntry', () => {
  it('regenerates the key from BibTeX author/year/title', () => {
    const p = prepareEntry(DBLP_BIB, { ...scholarResult, provider: 'dblp' }, '', { keepProviderKeys: false });
    expect(p.entry.key).toBe('vaswani2017attention');
    expect(p.duplicateOf).toBeUndefined();
  });

  it('keeps provider keys when asked', () => {
    const p = prepareEntry(DBLP_BIB, { ...scholarResult, provider: 'dblp' }, '', { keepProviderKeys: true });
    expect(p.entry.key).toBe('DBLP:conf/nips/VaswaniSPUJGKP17');
  });

  it('suffixes clashing keys and reports title duplicates', () => {
    const p = prepareEntry(DBLP_BIB, scholarResult, SCHOLAR_BIB, { keepProviderKeys: false });
    expect(p.entry.key).toBe('vaswani2017attentiona');
    expect(p.duplicateOf).toBe('vaswani2017attention');
  });

  it('synthesizes when raw BibTeX is unavailable', () => {
    const p = prepareEntry(undefined, scholarResult, '', { keepProviderKeys: true });
    expect(p.entry.key).toBe('vaswani2017attention');
    expect(p.text).toMatch(/note\s*= {synthesized}/);
  });
});

describe('appendSplice', () => {
  const entry = '@misc{k,\n  title = {T}\n}\n';
  const apply = (existing: string) => {
    const { offset, text } = appendSplice(existing, entry);
    return existing.slice(0, offset) + text;
  };
  it('leaves exactly one blank line before the entry', () => {
    expect(apply('')).toBe(entry);
    expect(apply('@misc{a,}')).toBe(`@misc{a,}\n\n${entry}`);
    expect(apply('@misc{a,}\n')).toBe(`@misc{a,}\n\n${entry}`);
    expect(apply('@misc{a,}\n\n\n  \n')).toBe(`@misc{a,}\n\n${entry}`);
  });
  it('adds exactly one entry start', () => {
    const before = SCHOLAR_BIB + DBLP_BIB;
    expect(countEntryStarts(apply(before))).toBe(countEntryStarts(before) + 1);
  });
});

describe('review fixes', () => {
  it('formatEntry collapses newlines so no value line starts with @', () => {
    const e = { type: 'misc', key: 'k', fields: new Map([['title', 'Line one\n@inproceedings{evil,\n  x']]) };
    const text = formatEntry(e);
    expect(countEntryStarts(text)).toBe(1);
    expect(text).toContain('title = {Line one @inproceedings{evil, x}');
  });

  it('appendSplice rejects text that would add more than one entry start', () => {
    expect(() => appendSplice('', '@misc{a,}\n@misc{b,}\n')).toThrow(/exactly one new entry/);
  });

  it('escapes backslash, ^ and ~ in synthesized entries', () => {
    const e = synthesizeEntry({ ...scholarResult, title: 'a\\b ^c ~d' }, 'k');
    expect(e.fields.get('title')).toBe('a\\textbackslash{}b \\^{}c \\~{}d');
    expect(parseEntry(formatEntry(e)).fields.get('title')).toBe(e.fields.get('title'));
  });

  it('treats an empty year as missing', () => {
    const p = prepareEntry('@article{x, author={Doe, Jane}, title={Thing}, year={}}', scholarResult, '', { keepProviderKeys: false });
    expect(p.entry.key).toBe('doe2017thing');
    const q = prepareEntry('@article{x, author={Doe, Jane}, title={Thing}, year={}}', { ...scholarResult, year: undefined }, '', {
      keepProviderKeys: false,
    });
    expect(q.entry.key).toBe('doething');
  });

  it('synthesizes when provider BibTeX does not parse', () => {
    const p = prepareEntry('@article{x, title={unbalanced', scholarResult, '', { keepProviderKeys: true });
    expect(p.parseError).toMatch(/Unbalanced/);
    expect(p.entry.type).toBe('misc');
    expect(p.entry.key).toBe('vaswani2017attention');
    expect(p.text).toMatch(/note\s*= {synthesized}/);
  });

  it('dedupes keys case-insensitively against the file', () => {
    const p = prepareEntry(SCHOLAR_BIB, scholarResult, '@misc{Vaswani2017Attention,\n  title = {Other}\n}\n', { keepProviderKeys: false });
    expect(p.entry.key).toBe('vaswani2017attentiona');
  });
});
