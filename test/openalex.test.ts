import { describe, expect, it } from 'vitest';
import { openalexSearchUrl, parseOpenAlex } from '../src/providers/openalex';

const response = {
  results: [
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.48550/arxiv.1706.03762',
      title: 'Attention is All you Need',
      publication_year: 2017,
      authorships: [{ author: { display_name: 'Ashish Vaswani' } }, { author: { display_name: 'Noam Shazeer' } }],
      primary_location: { source: { display_name: 'NeurIPS' }, landing_page_url: 'https://arxiv.org/abs/1706.03762' },
    },
    { id: 'https://openalex.org/W2', doi: null, title: null, display_name: 'Display only', authorships: [] },
    { id: 'https://openalex.org/W3', title: null },
    { id: 'https://openalex.org/W2', title: 'dup' },
  ],
};

describe('parseOpenAlex', () => {
  it('uses the DOI as id when present, else the OpenAlex id', () => {
    expect(parseOpenAlex(response)).toEqual([
      {
        id: '10.48550/arxiv.1706.03762',
        title: 'Attention is All you Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer'],
        venue: 'NeurIPS',
        year: 2017,
        url: 'https://arxiv.org/abs/1706.03762',
        provider: 'openalex',
      },
      { id: 'https://openalex.org/W2', title: 'Display only', authors: [], provider: 'openalex' },
    ]);
  });
  it('tolerates empty responses', () => {
    expect(parseOpenAlex({})).toEqual([]);
    expect(parseOpenAlex(undefined)).toEqual([]);
  });
});

describe('openalexSearchUrl', () => {
  it('builds the query', () => {
    const u = new URL(openalexSearchUrl('a b', 3));
    expect(u.searchParams.get('search')).toBe('a b');
    expect(u.searchParams.get('per-page')).toBe('3');
  });
});
