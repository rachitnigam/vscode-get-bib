import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { appendEntry, BibTarget, readBib, withBibLock } from '../bib/bibfile';
import { Prepared, prepareEntry } from '../bib/prepare';
import { readConfig } from '../config';
import { assertValidResults, BlockedError, Provider, ProviderId, Result, toResult } from '../providers/types';
import { withTimeout } from '../providers/http';
import { ForOp, FromWebview, parseFromWebview, StatusKind, ToWebview } from './messages';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  auto: 'Crossref, OpenAlex and arXiv',
  crossref: 'Crossref',
  openalex: 'OpenAlex',
  arxiv: 'arXiv',
  scholar: 'Google Scholar',
  dblp: 'DBLP',
};

export const VIEW_ID = 'scholarBib.searchView';

const SEARCH_TIMEOUT_MS = 30_000;
const BIBTEX_TIMEOUT_MS = 20_000;

interface Fetched {
  raw: string | undefined;
  warning?: string;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class SearchViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private ready = false;
  private searchAbort: AbortController | undefined;
  private pendingPrefill: string | undefined;
  private readonly subs: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providers: ReadonlyMap<ProviderId, Provider>,
    private readonly target: BibTarget,
  ) {
    this.subs.push(target.onDidChange((uri) => this.postTarget(uri)));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    this.subs.push(
      view.webview.onDidReceiveMessage((m: unknown) => this.onMessage(m)),
      view.onDidDispose(() => {
        this.view = undefined;
        this.ready = false;
      }),
    );
  }

  prefill(query: string): void {
    if (this.ready) this.post({ type: 'prefill', query });
    else this.pendingPrefill = query;
  }

  private post(msg: ToWebview): void {
    if (msg.type === 'results') assertValidResults(msg.results.map(toResult));
    void this.view?.webview.postMessage(msg);
  }

  private status(text: string, kind: StatusKind = 'info', forOp?: ForOp): void {
    this.post(forOp ? { type: 'status', text, kind, for: forOp } : { type: 'status', text, kind });
  }

  private postTarget(uri: vscode.Uri | undefined): void {
    this.post({ type: 'target', fileName: uri ? path.basename(uri.fsPath) : null });
  }

  private postError(e: unknown, forOp?: ForOp): void {
    const url = e instanceof BlockedError ? e.url : undefined;
    this.post({ type: 'error', text: describe(e), ...(url ? { url } : {}), ...(forOp ? { for: forOp } : {}) });
  }

  private async onMessage(raw: unknown): Promise<void> {
    let msg: FromWebview;
    try {
      msg = parseFromWebview(raw);
    } catch (e) {
      this.postError(e);
      return;
    }
    const forOp: ForOp | undefined = msg.type === 'add' || msg.type === 'copy' ? { id: msg.result.id, op: msg.type } : undefined;
    try {
      switch (msg.type) {
        case 'ready':
          this.ready = true;
          this.post({ type: 'config', provider: readConfig().defaultProvider });
          this.postTarget(this.target.current());
          if (this.pendingPrefill !== undefined) {
            this.post({ type: 'prefill', query: this.pendingPrefill });
            this.pendingPrefill = undefined;
          }
          return;
        case 'search':
          return await this.search(msg.provider, msg.query);
        case 'add':
          return await this.add(msg.result, forOp!);
        case 'copy':
          return await this.copy(msg.result, forOp!);
        case 'chooseBib':
          await this.target.pick(false);
          return;
        case 'openExternal':
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
          return;
      }
    } catch (e) {
      this.postError(e, forOp);
    }
  }

  private provider(id: ProviderId): Provider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Unknown provider ${id}`);
    return p;
  }

  private async search(providerId: ProviderId, query: string): Promise<void> {
    const q = query.trim();
    if (q.length === 0) return;
    this.searchAbort?.abort();
    const abort = new AbortController();
    this.searchAbort = abort;
    this.status(`Searching ${PROVIDER_LABELS[providerId]}…`, 'busy');
    try {
      const results = await withTimeout('Search', SEARCH_TIMEOUT_MS, abort, (signal) => this.provider(providerId).search(q, signal));
      if (this.searchAbort !== abort) return;
      this.post({ type: 'results', results });
      this.status(results.length === 0 ? 'No results.' : `${results.length} result${results.length === 1 ? '' : 's'}.`);
    } catch (e) {
      if (this.searchAbort !== abort) return;
      throw e;
    } finally {
      if (this.searchAbort === abort) this.searchAbort = undefined;
    }
  }

  /** Provider BibTeX, or `raw: undefined` (synthesize) when the provider's export fails (except DBLP). */
  private async fetchBibtex(result: Result): Promise<Fetched> {
    try {
      const raw = await withTimeout('BibTeX request', BIBTEX_TIMEOUT_MS, undefined, (signal) =>
        this.provider(result.provider).bibtex(result, signal),
      );
      return { raw };
    } catch (e) {
      if (result.provider === 'dblp') throw e;
      return {
        raw: undefined,
        warning: `${PROVIDER_LABELS[result.provider]} BibTeX export failed (${describe(e)}). Inserted a synthesized entry; please check it.`,
      };
    }
  }

  private warningFor(fetched: Fetched, prepared: Prepared): string | undefined {
    if (fetched.warning) return fetched.warning;
    if (prepared.parseError) return `Provider BibTeX could not be parsed (${prepared.parseError}). Inserted a synthesized entry; please check it.`;
    return undefined;
  }

  private async add(result: Result, forOp: ForOp): Promise<void> {
    const uri = await this.target.resolveForAdd();
    if (!uri) {
      this.status('No .bib file selected.', 'warning', forOp);
      return;
    }
    this.status('Fetching BibTeX…', 'busy');
    const fetched = await this.fetchBibtex(result);
    const opts = { keepProviderKeys: readConfig().keepProviderKeys };
    const prepared = await withBibLock(uri, async () => {
      const doc = await readBib(uri);
      let version = doc.version;
      let p = prepareEntry(fetched.raw, result, doc.getText(), opts);
      if (p.duplicateOf !== undefined) {
        const choice = await vscode.window.showWarningMessage(
          `Already in bib as \`${p.duplicateOf}\`. Add anyway?`,
          { modal: true },
          'Add anyway',
        );
        if (choice !== 'Add anyway') return undefined;
        // The user may have edited the buffer while the modal was open.
        if (doc.version !== version) {
          version = doc.version;
          p = prepareEntry(fetched.raw, result, doc.getText(), opts);
        }
      }
      await appendEntry(doc, p.text, version);
      return p;
    });
    if (!prepared) {
      this.status('Not added.', 'info', forOp);
      return;
    }
    this.post({ type: 'added', id: result.id });
    const warning = this.warningFor(fetched, prepared);
    if (warning) this.status(warning, 'warning', forOp);
    else this.status(`Added ${prepared.entry.key} to ${path.basename(uri.fsPath)}.`, 'success', forOp);
  }

  private async copy(result: Result, forOp: ForOp): Promise<void> {
    this.status('Fetching BibTeX…', 'busy');
    const fetched = await this.fetchBibtex(result);
    const uri = this.target.current();
    const existing = uri ? (await readBib(uri)).getText() : '';
    const prepared = prepareEntry(fetched.raw, result, existing, { keepProviderKeys: readConfig().keepProviderKeys });
    await vscode.env.clipboard.writeText(prepared.text);
    const warning = this.warningFor(fetched, prepared);
    if (warning) this.status(`Copied. ${warning}`, 'warning', forOp);
    else this.status(`Copied ${prepared.entry.key} to clipboard.`, 'success', forOp);
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'style.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet">
<title>Scholar Bib</title>
</head>
<body>
<header class="target">
  <span id="target-name" class="target-name">No .bib file open</span>
  <button id="choose" class="link-button" type="button">Choose…</button>
</header>
<form id="search-form" class="search">
  <select id="provider" aria-label="Provider">
    <option value="auto">Auto (Crossref → OpenAlex → arXiv)</option>
    <option value="crossref">Crossref</option>
    <option value="openalex">OpenAlex</option>
    <option value="arxiv">arXiv</option>
    <option value="scholar">Google Scholar (may be blocked)</option>
    <option value="dblp">DBLP (may be blocked)</option>
  </select>
  <div class="search-row">
    <input id="query" type="search" placeholder="Paper title…" aria-label="Search query" autocomplete="off">
    <button id="go" type="submit">Search</button>
  </div>
</form>
<div id="status" class="status" role="status" aria-live="polite"></div>
<ol id="results" class="results"></ol>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.searchAbort?.abort();
    this.subs.forEach((s) => s.dispose());
  }
}
