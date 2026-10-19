import { describe, expect, it } from 'vitest';
import { asciiFold, firstTitleWord, generateKey, lastName, uniqueKey } from '../src/bib/keygen';

describe('asciiFold', () => {
  it('folds Unicode diacritics and ligatures', () => {
    expect(asciiFold('Müller')).toBe('muller');
    expect(asciiFold('Gödel')).toBe('godel');
    expect(asciiFold('Straße')).toBe('strasse');
    expect(asciiFold('Søren Kierkegård')).toBe('sorenkierkegard');
    expect(asciiFold('Łukasiewicz')).toBe('lukasiewicz');
    expect(asciiFold('Erdős')).toBe('erdos');
  });
  it('folds TeX accents', () => {
    expect(asciiFold('M{\\"u}ller')).toBe('muller');
    expect(asciiFold('M\\"uller')).toBe('muller');
    expect(asciiFold("Erd{\\H{o}}s")).toBe('erdos');
    expect(asciiFold('{\\o}rsted')).toBe('orsted');
    expect(asciiFold('Stra{\\ss}e')).toBe('strasse');
    expect(asciiFold('{\\v{S}}koda')).toBe('skoda');
  });
  it('drops non-Latin scripts entirely', () => {
    expect(asciiFold('王伟')).toBe('');
  });
});

describe('lastName', () => {
  it('handles the common formats', () => {
    expect(lastName('Vaswani, Ashish')).toBe('Vaswani');
    expect(lastName('Ashish Vaswani')).toBe('Vaswani');
    expect(lastName('A Vaswani')).toBe('Vaswani');
    expect(lastName('Wei Wang 0001')).toBe('Wang');
    expect(lastName('{M\\"u}ller, J.')).toBe('M\\"uller');
  });
});

describe('firstTitleWord', () => {
  it('skips leading stopwords and TeX braces', () => {
    expect(firstTitleWord('Attention is all you need')).toBe('attention');
    expect(firstTitleWord('The {LLVM} Compiler Infrastructure')).toBe('llvm');
    expect(firstTitleWord('A Survey')).toBe('survey');
    expect(firstTitleWord('On the Self-Similar Nature')).toBe('self');
  });
});

describe('generateKey', () => {
  it('produces <lastname><year><firstTitleWord>', () => {
    expect(generateKey({ authors: ['Ashish Vaswani', 'Noam Shazeer'], year: 2017, title: 'Attention is All you Need' })).toBe(
      'vaswani2017attention',
    );
  });
  it('folds unicode author names', () => {
    expect(generateKey({ authors: ['Jürgen Müller'], year: 2021, title: 'Über Graphen' })).toBe('muller2021uber');
    expect(generateKey({ authors: ['M{\\"u}ller, J{\\"u}rgen'], year: 2021, title: 'X' })).toBe('muller2021x');
  });
  it('falls back to anon and omits a missing year', () => {
    expect(generateKey({ authors: [], title: 'Deep Learning' })).toBe('anondeep');
    expect(generateKey({ authors: ['王伟'], year: 2020, title: '深度学习' })).toBe('anon2020');
  });
  it('always matches /^[a-z0-9]+$/', () => {
    for (const title of ['', '!!!', 'C++: the — language', 'Ünïcödé']) {
      expect(generateKey({ authors: ['Ö'], year: 1999, title })).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('uniqueKey', () => {
  it('appends a, b, …, z, aa', () => {
    expect(uniqueKey('k', new Set())).toBe('k');
    expect(uniqueKey('k', new Set(['k']))).toBe('ka');
    expect(uniqueKey('k', new Set(['k', 'ka']))).toBe('kb');
    const taken = new Set(['k', ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => 'k' + c)]);
    expect(uniqueKey('k', taken)).toBe('kaa');
  });
});

describe('uniqueKey case-insensitivity', () => {
  it('treats keys differing only in case as clashing', () => {
    expect(uniqueKey('vaswani2017attention', new Set(['Vaswani2017Attention']))).toBe('vaswani2017attentiona');
    expect(uniqueKey('k', new Set(['K', 'KA']))).toBe('kb');
  });
});
