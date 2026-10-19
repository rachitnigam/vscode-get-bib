import assert from 'node:assert/strict';
import { isProviderId, ProviderId, Result, toResult } from '../providers/types';

export type StatusKind = 'info' | 'busy' | 'warning' | 'success';

/** Identifies the add/copy request a status or error concludes, so the webview re-enables only that button. */
export interface ForOp {
  id: string;
  op: 'add' | 'copy';
}

export type ToWebview =
  | { type: 'config'; provider: ProviderId }
  | { type: 'prefill'; query: string }
  | { type: 'results'; results: Result[] }
  | { type: 'status'; text: string; kind: StatusKind; for?: ForOp }
  | { type: 'target'; fileName: string | null }
  | { type: 'added'; id: string }
  | { type: 'error'; text: string; url?: string; for?: ForOp };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'search'; provider: ProviderId; query: string }
  | { type: 'add'; result: Result }
  | { type: 'copy'; result: Result }
  | { type: 'chooseBib' }
  | { type: 'openExternal'; url: string };

export function parseFromWebview(x: unknown): FromWebview {
  assert.ok(typeof x === 'object' && x !== null, 'message must be an object');
  const m = x as Record<string, unknown>;
  switch (m.type) {
    case 'ready':
    case 'chooseBib':
      return { type: m.type };
    case 'search':
      assert.ok(isProviderId(m.provider), 'search.provider');
      assert.ok(typeof m.query === 'string', 'search.query');
      return { type: 'search', provider: m.provider, query: m.query };
    case 'add':
    case 'copy':
      return { type: m.type, result: toResult(m.result) };
    case 'openExternal':
      assert.ok(typeof m.url === 'string' && /^https?:\/\//.test(m.url), 'openExternal.url must be http(s)');
      return { type: 'openExternal', url: m.url };
    default:
      throw new Error(`Unknown webview message: ${String(m.type)}`);
  }
}
