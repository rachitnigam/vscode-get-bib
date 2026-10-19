# Scholar Bib: VS Code extension design

Search a paper by name from a VS Code side pane, see results, click **Add** to append a
BibTeX entry to the open `.bib` file.

## Up-front cost: Google Scholar has no API

Scholar is scraped HTML. It rate-limits and serves CAPTCHAs to non-browser clients, and its
BibTeX export (`scholar.bib?...`) only works with a session cookie. This is the single biggest
risk in the project. Mitigations, in order:

1. Send a realistic browser `User-Agent` and the cookie `GSP=CF=4` (the setting that makes
   Scholar emit "Import into BibTeX" links). This is what `scholarly` does and works most of
   the time at low volume.
2. Detect the block page (response URL or body contains `sorry`/`gs_captcha`/`unusual traffic`)
   and show a clear error in the pane with an **Open in browser** link. Do not retry in a loop.
3. If the search page works but BibTeX fetch fails, **synthesize** a BibTeX entry from the parsed
   result metadata (title, authors, year, venue, URL). Mark it with a `note = {synthesized}` field so
   the user knows to check it.
4. Provide **DBLP** as a second provider (clean JSON API, reliable BibTeX export) selectable from a
   dropdown in the pane. Default is Google Scholar because that is what was asked for.

## Architecture

```
src/
  extension.ts          activate: register view provider + commands
  panel/
    searchView.ts       WebviewViewProvider; message bus between webview and host
    webview/            main.js + style.css shipped as static assets (no framework)
  providers/
    types.ts            Provider interface: search(q) -> Result[]; bibtex(r) -> string
    scholar.ts          Google Scholar HTML scraping + bibtex fetch + block detection
    dblp.ts             DBLP JSON API + bibtex export
    parseScholar.ts     pure function: html -> Result[]  (unit tested against fixtures)
  bib/
    bibfile.ts          locate target .bib, read existing keys/titles, append via WorkspaceEdit
    bibtex.ts           parse key/fields out of a bibtex string; rewrite key; synthesize entry
    keygen.ts           key scheme: <lastname><year><firstTitleWord>, lowercase ascii
test/
  fixtures/scholar-*.html
  *.test.ts             vitest
```

### Provider interface

```ts
interface Result {
  id: string;          // provider-specific (Scholar data-cid, DBLP key)
  title: string;
  authors: string[];   // may be truncated; Scholar truncates with "…"
  venue?: string;
  year?: number;
  url?: string;
  provider: 'scholar' | 'dblp';
}
interface Provider {
  readonly id: 'scholar' | 'dblp';
  search(query: string, signal: AbortSignal): Promise<Result[]>;
  bibtex(result: Result, signal: AbortSignal): Promise<string>;  // throws on failure
}
```

### Webview pane

- Activity bar container **Scholar** with a single `WebviewView` (`scholarBib.searchView`).
- Contents: provider dropdown, search box (Enter or button), status line, result list.
  Each result: title (link opens `url`), authors · venue · year, buttons **Add** and **Copy BibTeX**.
- Header shows the current target bib file name, or "No .bib file open" with a **Choose…** button.
- Strict CSP with a nonce; `localResourceRoots` limited to `media/`; `retainContextWhenHidden: true`.
- Messages host←webview: `search {provider, query}`, `add {result}`, `copy {result}`, `chooseBib`,
  `openExternal {url}`.
  Messages webview←host: `results {results}`, `status {text, kind}`, `target {fileName|null}`,
  `added {id}`, `error {text, url?}`.
- Also a command palette command `Scholar Bib: Search Paper` which focuses the view and
  prefills the query from the current selection.

### Target `.bib` resolution (`bib/bibfile.ts`)

1. Active editor whose document language is `bibtex` or file ends in `.bib`.
2. Else the most recently active `.bib` editor seen in this session (track via
   `onDidChangeActiveTextEditor`).
3. Else, on **Add**: `workspace.findFiles('**/*.bib')`; if exactly one, use it; if several, quick pick;
   if none, ask to create one via save dialog.
Target changes are pushed to the webview so the header stays accurate.

### Add flow

1. Fetch BibTeX from provider (fall back to synthesis for Scholar, see above).
2. Parse entry type, key, fields. Regenerate the key with the configured scheme unless
   `scholarBib.keepProviderKeys` is true.
3. Dedupe: read the target file; if an entry with the same key exists, append `a`, `b`, …
   If an entry with a normalized-equal title exists, show a modal warning
   ("Already in bib as `<key>`. Add anyway?").
4. Append with a `WorkspaceEdit` at end of file, ensuring exactly one blank line before the entry.
   This keeps the change in the undo stack and works on unsaved buffers. Do not auto-save.
5. Reveal the new entry in the editor and post `added` to the webview so the button reads **Added ✓**.

### Settings (`contributes.configuration`)

- `scholarBib.defaultProvider`: `scholar` | `dblp` (default `scholar`)
- `scholarBib.keyScheme`: `authorYearTitle` | `provider` (default `authorYearTitle`)
- `scholarBib.maxResults`: number (default 10)
- `scholarBib.userAgent`: string (default a current desktop Chrome UA)

### Invariants (enforce with asserts, not comments)

- A `Result.id` is non-empty and unique within one search response.
- Generated keys match `/^[a-z0-9]+$/` after ascii-folding.
- The appended text begins with `@` and the file after append has exactly one more `@` at
  line start than before.
- The webview never receives raw HTML from the network; only structured `Result` objects.

## Tooling

- TypeScript, `esbuild` bundle to `dist/extension.js`, target node 20 / `vscode` engine `^1.90`.
- Tests: `vitest` for pure modules (`parseScholar`, `bibtex`, `keygen`). No VS Code integration
  tests in v1; the `vscode` module boundary is kept thin in `bibfile.ts` and `searchView.ts`.
- HTML parsing: `node-html-parser` (small, no jsdom).
- `npm run build`, `npm test`, `npm run package` (`@vscode/vsce`).

## Out of scope for v1 (tracked, not done)

- Citation counts and "cited by" navigation.
- Editing the entry before insertion.
- Proxy / institutional login for Scholar.
- Sorting into an alphabetical position within the bib file.
