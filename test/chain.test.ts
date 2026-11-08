import { describe, expect, it } from 'vitest';
import { ChainProvider } from '../src/providers/chain';
import { Provider, ProviderId, Result } from '../src/providers/types';

function r(provider: ProviderId, id: string): Result {
  return { id, title: id, authors: [], provider };
}
function stub(id: ProviderId, search: () => Promise<Result[]>): Provider {
  return { id, search, bibtex: async () => `@misc{${id},}` };
}
const sig = new AbortController().signal;

describe('ChainProvider', () => {
  it('returns the first non-empty result set', async () => {
    const calls: string[] = [];
    const c = new ChainProvider([
      stub('crossref', async () => (calls.push('crossref'), [])),
      stub('openalex', async () => (calls.push('openalex'), [r('openalex', 'a')])),
      stub('arxiv', async () => (calls.push('arxiv'), [r('arxiv', 'b')])),
    ]);
    expect(await c.search('q', sig)).toEqual([r('openalex', 'a')]);
    expect(calls).toEqual(['crossref', 'openalex']);
  });
  it('skips failing providers', async () => {
    const c = new ChainProvider([
      stub('crossref', async () => { throw new Error('boom'); }),
      stub('arxiv', async () => [r('arxiv', 'b')]),
    ]);
    expect(await c.search('q', sig)).toEqual([r('arxiv', 'b')]);
  });
  it('returns [] when some provider answered empty and the rest failed', async () => {
    const c = new ChainProvider([
      stub('crossref', async () => []),
      stub('arxiv', async () => { throw new Error('boom'); }),
    ]);
    expect(await c.search('q', sig)).toEqual([]);
  });
  it('throws the first error when every provider failed', async () => {
    const c = new ChainProvider([
      stub('crossref', async () => { throw new Error('first'); }),
      stub('arxiv', async () => { throw new Error('second'); }),
    ]);
    await expect(c.search('q', sig)).rejects.toThrow('first');
  });
  it('does not swallow aborts', async () => {
    const ac = new AbortController();
    ac.abort();
    const c = new ChainProvider([stub('crossref', async () => { throw new Error('x'); }), stub('arxiv', async () => [r('arxiv', 'b')])]);
    await expect(c.search('q', ac.signal)).rejects.toThrow();
  });
  it('delegates bibtex by result provider', async () => {
    const c = new ChainProvider([stub('crossref', async () => []), stub('arxiv', async () => [])]);
    expect(await c.bibtex(r('arxiv', 'b'), sig)).toBe('@misc{arxiv,}');
  });
});
