import { Provider, Result } from './types';

/** Tries providers in order and returns the first non-empty result set; BibTeX goes to the result's own provider. */
export class ChainProvider implements Provider {
  readonly id = 'auto' as const;

  constructor(private readonly chain: readonly Provider[]) {}

  async search(query: string, signal: AbortSignal): Promise<Result[]> {
    let firstError: unknown;
    let answeredEmpty = false;
    for (const p of this.chain) {
      signal.throwIfAborted();
      try {
        const results = await p.search(query, signal);
        if (results.length > 0) return results;
        answeredEmpty = true;
      } catch (e) {
        if (signal.aborted) throw e;
        firstError ??= e;
      }
    }
    if (!answeredEmpty && firstError !== undefined) throw firstError;
    return [];
  }

  async bibtex(result: Result, signal: AbortSignal): Promise<string> {
    const p = this.chain.find((c) => c.id === result.provider);
    if (!p) throw new Error(`No provider ${result.provider} in chain`);
    return p.bibtex(result, signal);
  }
}
