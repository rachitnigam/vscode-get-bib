import { describe, expect, it } from 'vitest';
import { arxivBibtex, arxivSearchUrl, parseArxiv } from '../src/providers/arxiv';
import { parseEntry } from '../src/bib/bibtex';

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
<entry>
  <id>http://arxiv.org/abs/1706.03762v7</id>
  <published>2017-06-12T17:57:34Z</published>
  <title>Attention Is All
  You Need</title>
  <author><name>Ashish Vaswani</name></author>
  <author><name>Noam Shazeer</name></author>
  <arxiv:primary_category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
</entry>
<entry>
  <id>http://arxiv.org/abs/hep-th/9901001v1</id>
  <published>1999-01-01T00:00:00Z</published>
  <title>Fish &amp; Chips</title>
  <author><name>A. Author</name></author>
  <arxiv:journal_ref>Phys. Rev. D 1 (1999)</arxiv:journal_ref>
</entry>
</feed>`;

describe('parseArxiv', () => {
  it('parses Atom entries', () => {
    expect(parseArxiv(atom)).toEqual([
      {
        id: '1706.03762',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer'],
        venue: 'arXiv:1706.03762 [cs.CL]',
        year: 2017,
        url: 'https://arxiv.org/abs/1706.03762',
        provider: 'arxiv',
      },
      {
        id: 'hep-th/9901001',
        title: 'Fish & Chips',
        authors: ['A. Author'],
        venue: 'Phys. Rev. D 1 (1999)',
        year: 1999,
        url: 'https://arxiv.org/abs/hep-th/9901001',
        provider: 'arxiv',
      },
    ]);
  });
  it('returns nothing for a feed without entries', () => {
    expect(parseArxiv('<feed></feed>')).toEqual([]);
  });
});

describe('arxivSearchUrl', () => {
  it('ANDs sanitized terms', () => {
    const u = new URL(arxivSearchUrl('Attention: is "all" you need?', 4));
    expect(u.searchParams.get('search_query')).toBe('all:Attention AND all:is AND all:all AND all:you AND all:need');
    expect(u.searchParams.get('max_results')).toBe('4');
  });
});

describe('arxivBibtex', () => {
  it('builds parseable BibTeX from a result', () => {
    const [r] = parseArxiv(atom);
    const bib = arxivBibtex(r!);
    const e = parseEntry(bib);
    expect(e.type).toBe('misc');
    expect(e.fields.get('eprint')).toBe('1706.03762');
    expect(e.fields.get('primaryclass')).toBe('cs.CL');
    expect(e.fields.get('author')).toBe('Ashish Vaswani and Noam Shazeer');
    expect(e.fields.get('year')).toBe('2017');
  });
});
