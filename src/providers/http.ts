import { HttpError } from './types';

export interface FetchedText {
  url: string;
  status: number;
  body: string;
}

export async function fetchText(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<FetchedText> {
  const res = await fetch(url, { headers, signal, redirect: 'follow' });
  const body = await res.text();
  return { url: res.url || url, status: res.status, body };
}

export function ensureOk(r: FetchedText): FetchedText {
  if (r.status < 200 || r.status >= 300) {
    throw new HttpError(r.url, r.status);
  }
  return r;
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms / 1000}s`);
    this.name = 'TimeoutError';
  }
}

/** Runs `fn` with a signal that aborts after `ms`; an abort caused by the timer surfaces as TimeoutError. */
export async function withTimeout<T>(what: string, ms: number, outer: AbortController | undefined, fn: (s: AbortSignal) => Promise<T>): Promise<T> {
  const abort = outer ?? new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, ms);
  try {
    return await fn(abort.signal);
  } catch (e) {
    if (timedOut) throw new TimeoutError(what, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
