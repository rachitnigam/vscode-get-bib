import { describe, expect, it } from 'vitest';
import { dblpBibUrl, dblpSearchUrl, isDblpBlocked, parseDblp } from '../src/providers/dblp';

const response = {
  result: {
    hits: {
      hit: [
        {
          info: {
            authors: { author: [{ '@pid': '1', text: 'Ashish Vaswani' }, { '@pid': '2', text: 'Wei Wang 0001' }] },
            title: 'Attention is All you Need.',
            venue: 'NIPS',
            year: '2017',
            type: 'Conference and Workshop Papers',
            key: 'conf/nips/VaswaniSPUJGKP17',
            ee: 'https://proceedings.neurips.cc/paper/2017/hash/x-Abstract.html',
            url: 'https://dblp.org/rec/conf/nips/VaswaniSPUJGKP17',
          },
        },
        { info: { authors: { author: { text: 'Solo Author' } }, title: 'Single.', venue: ['A', 'B'], year: '2020', key: 'journals/x/Solo20' } },
        { info: { title: 'No key' } },
        { info: { title: 'Dup.', key: 'journals/x/Solo20' } },
      ],
    },
  },
};

describe('parseDblp', () => {
  it('maps hits to results', () => {
    expect(parseDblp(response)).toEqual([
      {
        id: 'conf/nips/VaswaniSPUJGKP17',
        title: 'Attention is All you Need',
        authors: ['Ashish Vaswani', 'Wei Wang'],
        venue: 'NIPS',
        year: 2017,
        url: 'https://proceedings.neurips.cc/paper/2017/hash/x-Abstract.html',
        provider: 'dblp',
      },
      {
        id: 'journals/x/Solo20',
        title: 'Single',
        authors: ['Solo Author'],
        venue: 'A',
        year: 2020,
        url: undefined,
        provider: 'dblp',
      },
    ]);
  });
  it('tolerates empty responses', () => {
    expect(parseDblp({ result: { hits: {} } })).toEqual([]);
    expect(parseDblp(null)).toEqual([]);
  });
  it('builds URLs', () => {
    expect(dblpSearchUrl('attention is all you need', 5)).toBe('https://dblp.org/search/publ/api?q=attention+is+all+you+need&format=json&h=5');
    expect(dblpBibUrl('conf/nips/VaswaniSPUJGKP17')).toBe('https://dblp.org/rec/conf/nips/VaswaniSPUJGKP17.bib');
    expect(() => dblpBibUrl('../../etc')).toThrow();
    expect(() => dblpBibUrl('a b')).toThrow();
  });
});

describe('isDblpBlocked', () => {
  it('flags 429, the 202 Anubis challenge, and HTML where data was expected', () => {
    expect(isDblpBlocked(429, '')).toBe(true);
    expect(isDblpBlocked(202, '<!doctype html><title>Making sure you&#39;re not a bot!</title>')).toBe(true);
    expect(isDblpBlocked(200, '  <html><body>challenge</body></html>')).toBe(true);
  });
  it('passes real data and ordinary errors through', () => {
    expect(isDblpBlocked(200, '{"result":{}}')).toBe(false);
    expect(isDblpBlocked(200, '@inproceedings{x,}')).toBe(false);
    expect(isDblpBlocked(404, '<html>not found</html>')).toBe(false);
  });
});
