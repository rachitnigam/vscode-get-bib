import { describe, expect, it } from 'vitest';
import { crossrefSearchUrl, parseCrossref } from '../src/providers/crossref';

const response = {
  message: {
    items: [
      {
        DOI: '10.1145/3292500.3330701',
        title: ['Optuna: A Next-generation Hyperparameter Optimization Framework'],
        author: [{ given: 'Takuya', family: 'Akiba' }, { name: 'Some Consortium' }],
        'container-title': ['Proceedings of KDD'],
        issued: { 'date-parts': [[2019, 7]] },
        URL: 'https://doi.org/10.1145/3292500.3330701',
      },
      { DOI: '10.1/Solo', title: ['No year'], author: [{ family: 'Solo' }] },
      { DOI: '10.1/notitle' },
      { DOI: '10.1/nolist', title: [] },
      { DOI: '10.1/noyear', title: ['Dup case'] },
      { DOI: '10.1/NOYEAR', title: ['Dup case again'] },
    ],
  },
};

describe('parseCrossref', () => {
  it('maps items to results and drops untitled or duplicate ones', () => {
    expect(parseCrossref(response)).toEqual([
      {
        id: '10.1145/3292500.3330701',
        title: 'Optuna: A Next-generation Hyperparameter Optimization Framework',
        authors: ['Takuya Akiba', 'Some Consortium'],
        venue: 'Proceedings of KDD',
        year: 2019,
        url: 'https://doi.org/10.1145/3292500.3330701',
        provider: 'crossref',
      },
      { id: '10.1/Solo', title: 'No year', authors: ['Solo'], provider: 'crossref', url: 'https://doi.org/10.1/Solo' },
      { id: '10.1/noyear', title: 'Dup case', authors: [], provider: 'crossref', url: 'https://doi.org/10.1/noyear' },
    ]);
  });
  it('tolerates empty responses', () => {
    expect(parseCrossref({})).toEqual([]);
    expect(parseCrossref(null)).toEqual([]);
  });
});

describe('crossrefSearchUrl', () => {
  it('builds the query', () => {
    const u = new URL(crossrefSearchUrl('attention is all you need', 7));
    expect(u.origin + u.pathname).toBe('https://api.crossref.org/works');
    expect(u.searchParams.get('query.bibliographic')).toBe('attention is all you need');
    expect(u.searchParams.get('rows')).toBe('7');
  });
});
