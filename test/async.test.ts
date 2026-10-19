import { describe, expect, it } from 'vitest';
import { KeyedQueue } from '../src/bib/queue';
import { TimeoutError, withTimeout } from '../src/providers/http';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('KeyedQueue', () => {
  it('runs tasks for one key strictly in order, even when one fails', async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const task = (name: string, fail = false) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
      if (fail) throw new Error(name);
      return name;
    };
    const a = q.run('f', task('a'));
    const b = q.run('f', task('b', true));
    const c = q.run('f', task('c'));
    await expect(a).resolves.toBe('a');
    await expect(b).rejects.toThrow('b');
    await expect(c).resolves.toBe('c');
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('runs different keys concurrently', async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const t = (n: string) => async () => {
      log.push(`start ${n}`);
      await tick();
      log.push(`end ${n}`);
    };
    await Promise.all([q.run('x', t('x')), q.run('y', t('y'))]);
    expect(log.slice(0, 2).sort()).toEqual(['start x', 'start y']);
  });
});

const abortable = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));

describe('withTimeout', () => {
  it('turns its own abort into a TimeoutError', async () => {
    await expect(withTimeout('Search', 10, undefined, abortable)).rejects.toBeInstanceOf(TimeoutError);
  });
  it('passes an external abort through as AbortError', async () => {
    const c = new AbortController();
    const p = withTimeout('Search', 1000, c, abortable);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('returns the value when fast enough', async () => {
    await expect(withTimeout('x', 1000, undefined, async () => 42)).resolves.toBe(42);
  });
});
