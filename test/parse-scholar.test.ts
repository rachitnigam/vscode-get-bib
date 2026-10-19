import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBibLink, isBlockedPage, parseByline, parseScholar } from '../src/providers/parseScholar';
import { scholarCiteUrl, scholarSearchUrl } from '../src/providers/scholar';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseScholar', () => {
  const results = parseScholar(fixture('scholar-attention.html'));

  it('extracts one result per unique non-empty data-cid', () => {
    expect(results.map((r) => r.id)).toEqual(['5Gohgn6QFikJ', 'Ab-c_d9xYz0J', 'CiTaTiOn123J', 'BoOkNoYear0J']);
    expect(results.every((r) => r.provider === 'scholar')).toBe(true);
  });

  it('parses a linked result with truncated authors and venue', () => {
    expect(results[0]).toEqual({
      id: '5Gohgn6QFikJ',
      title: 'Attention is all you need',
      authors: ['A Vaswani', 'N Shazeer', 'N Parmar'],
      venue: 'Advances in neural …',
      year: 2017,
      url: 'https://proceedings.neurips.cc/paper/7181-attention-is-all-you-need',
      provider: 'scholar',
    });
  });

  it('decodes entities and ignores the [HTML] badge', () => {
    expect(results[1]!.title).toBe("Is attention all you need? A Müller & friends' study");
    expect(results[1]!.authors).toEqual(['J Müller', 'K Schmidt']);
    expect(results[1]!.venue).toBe('arXiv preprint arXiv:2104.00001');
    expect(results[1]!.year).toBe(2021);
  });

  it('handles [CITATION] entries without a link', () => {
    expect(results[2]).toEqual({ id: 'CiTaTiOn123J', title: 'Attention mechanisms: a survey', authors: ['R Smith'], year: 2019, provider: 'scholar' });
  });

  it('resolves relative links and tolerates missing years', () => {
    expect(results[3]!.url).toBe('https://scholar.google.com/books?id=xyz');
    expect(results[3]!.year).toBeUndefined();
    expect(results[3]!.venue).toBeUndefined();
    expect(results[3]!.authors).toEqual(['I Goodfellow', 'Y Bengio', 'A Courville']);
  });

  it('returns nothing for a block page', () => {
    expect(parseScholar(fixture('scholar-blocked.html'))).toEqual([]);
  });
});

describe('parseByline', () => {
  it('splits on spaced dashes, not hyphens inside names', () => {
    expect(parseByline('J-P Sartre, A Smith-Jones - Journal of X, 2020 - x.org')).toEqual({
      authors: ['J-P Sartre', 'A Smith-Jones'],
      venue: 'Journal of X',
      year: 2020,
    });
  });
  it('accepts a bare year as the middle segment', () => {
    expect(parseByline('A Author - 2018 - example.com')).toEqual({ authors: ['A Author'], year: 2018 });
  });
  it('drops a trailing ellipsis author marker', () => {
    expect(parseByline('A One, B Two… - Conf, 2019 - pub').authors).toEqual(['A One', 'B Two']);
  });
});

describe('block detection', () => {
  it('detects the CAPTCHA page by body', () => {
    expect(isBlockedPage('https://scholar.google.com/scholar?q=x', 200, fixture('scholar-blocked.html'))).toBe(true);
  });
  it('detects the /sorry/ redirect and 429', () => {
    expect(isBlockedPage('https://www.google.com/sorry/index?continue=https://scholar.google.com/', 200, '')).toBe(true);
    expect(isBlockedPage('https://scholar.google.com/scholar', 429, '')).toBe(true);
  });
  it('does not flag a normal result page', () => {
    expect(isBlockedPage('https://scholar.google.com/scholar?q=x', 200, fixture('scholar-attention.html'))).toBe(false);
  });
});

describe('cite page', () => {
  it('finds and entity-decodes the BibTeX link', () => {
    expect(findBibLink(fixture('scholar-cite.html'))).toBe(
      'https://scholar.googleusercontent.com/scholar.bib?q=info:5Gohgn6QFikJ:scholar.google.com/&output=citation&scisdr=ClEA&scisig=AFWwa&scisf=4&ct=citation&cd=-1&hl=en',
    );
  });
  it('returns undefined when absent', () => {
    expect(findBibLink('<div>nothing</div>')).toBeUndefined();
  });
  it('builds the expected URLs', () => {
    expect(scholarCiteUrl('5Gohgn6QFikJ')).toBe('https://scholar.google.com/scholar?q=info:5Gohgn6QFikJ:scholar.google.com/&output=cite&scirp=0&hl=en');
    expect(scholarSearchUrl('attention is all you need', 50)).toBe('https://scholar.google.com/scholar?hl=en&q=attention+is+all+you+need&num=20');
  });
});

describe('review fixes', () => {
  it('does not flag BibTeX whose title mentions reCAPTCHA or unusual traffic', () => {
    const bib = '@article{x,\n  title={Breaking reCAPTCHA: detecting unusual traffic},\n  year={2020}\n}\n';
    expect(isBlockedPage('https://scholar.googleusercontent.com/scholar.bib?q=x', 200, bib)).toBe(false);
    expect(isBlockedPage('https://scholar.googleusercontent.com/scholar.bib?q=x', 200, '  \n' + bib)).toBe(false);
  });
  it('drops only the result whose href is unparseable', () => {
    const html = `
      <div class="gs_r gs_or gs_scl" data-cid="bad"><h3 class="gs_rt"><a href="http://[::1">Bad</a></h3></div>
      <div class="gs_r gs_or gs_scl" data-cid="good"><h3 class="gs_rt"><a href="https://ok.example/">Good</a></h3></div>`;
    expect(parseScholar(html).map((r) => r.id)).toEqual(['good']);
    expect(findBibLink('<a href="http://[::1/scholar.bib?q=1">x</a><a href="/scholar.bib?q=2">y</a>')).toBe('https://scholar.google.com/scholar.bib?q=2');
  });
});
