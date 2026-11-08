# Scholar Bib

Search for a paper from a VS Code side pane and append its BibTeX entry to your `.bib` file.

## Installation

Build and install a local `.vsix`:

```sh
npm install
npm run build
npm run package   # produces scholar-bib-<version>.vsix
code --install-extension scholar-bib-*.vsix
```

Then run **Developer: Reload Window**. Alternatively, in the Extensions view choose `…` →
**Install from VSIX…** and select the file.

## Usage

1. Open the **Scholar** view in the activity bar, or run **Scholar Bib: Search Paper** from the
   command palette (the current selection is used as the query).
2. Pick a provider (Auto, Crossref, OpenAlex, arXiv, Google Scholar or DBLP), type a title, press Enter.
3. Click **Add** to append the entry to the target `.bib` file, or **Copy BibTeX** to copy it.

The target file is the active `.bib` editor, else the last `.bib` editor you used, else you are
asked to pick one from the workspace (or create one). The header of the pane shows the current
target; **Choose…** changes it.

Added entries get a key of the form `<lastname><year><firstTitleWord>` (e.g.
`vaswani2017attention`); clashing keys get `a`, `b`, … appended. If an entry with the same title
already exists you are asked before adding. Edits go through the normal undo stack and the file is
not saved automatically.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `scholarBib.defaultProvider` | `auto` | `auto` (Crossref → OpenAlex → arXiv), `crossref`, `openalex`, `arxiv`, `scholar` or `dblp` |
| `scholarBib.keyScheme` | `authorYearTitle` | `provider` keeps the provider's key |
| `scholarBib.keepProviderKeys` | `false` | Same as `keyScheme = provider` |
| `scholarBib.maxResults` | `10` | Scholar returns at most 20 |
| `scholarBib.userAgent` | desktop Chrome | Sent to Google Scholar |

## Providers

The default, **Auto**, tries Crossref, then OpenAlex, then arXiv, and uses the first that finds
results. Crossref and OpenAlex BibTeX comes from doi.org (OpenAlex works without a DOI get a
synthesized entry); arXiv BibTeX is built from the metadata. These are official APIs with no
bot checks. They miss theses and reports without a DOI or arXiv ID, for which Scholar is the
better source.

## Google Scholar caveat

Google Scholar has no API. This extension scrapes its HTML, and Scholar rate-limits and serves
CAPTCHAs to clients it thinks are bots. When that happens the pane shows an error with an
**Open in browser** link; solving the CAPTCHA in a browser does not unblock the extension (it has
its own cookies) and may not help, so wait a while or switch to **Crossref**, which has a proper API. DBLP currently serves a bot check to non-browser clients, so it often fails too.

If a search works but Scholar refuses the BibTeX export, the extension inserts an entry built from
the search result instead, marked with `note = {synthesized}`. Scholar truncates author lists and
venue names, so check these entries.

## Development

```sh
npm install
npm run build     # type-check + esbuild bundle to dist/extension.js
npm test          # vitest
npm run package   # .vsix
```

Press F5 in VS Code to launch an Extension Development Host.
