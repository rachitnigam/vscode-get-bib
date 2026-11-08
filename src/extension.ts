import * as vscode from 'vscode';
import { BibTarget } from './bib/bibfile';
import { readConfig } from './config';
import { SearchViewProvider, VIEW_ID } from './panel/searchView';
import { ArxivProvider } from './providers/arxiv';
import { ChainProvider } from './providers/chain';
import { CrossrefProvider } from './providers/crossref';
import { DblpProvider } from './providers/dblp';
import { OpenAlexProvider } from './providers/openalex';
import { ScholarProvider } from './providers/scholar';
import { Provider, ProviderId } from './providers/types';

export function activate(context: vscode.ExtensionContext): void {
  const crossref = new CrossrefProvider(() => readConfig());
  const openalex = new OpenAlexProvider(() => readConfig());
  const arxiv = new ArxivProvider(() => readConfig());
  const providers = new Map<ProviderId, Provider>([
    ['auto', new ChainProvider([crossref, openalex, arxiv])],
    ['crossref', crossref],
    ['openalex', openalex],
    ['arxiv', arxiv],
    ['scholar', new ScholarProvider(() => readConfig())],
    ['dblp', new DblpProvider(() => readConfig())],
  ]);
  const target = new BibTarget();
  const view = new SearchViewProvider(context.extensionUri, providers, target);

  context.subscriptions.push(
    target,
    view,
    vscode.window.registerWebviewViewProvider(VIEW_ID, view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('scholarBib.search', async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection).replace(/\s+/g, ' ').trim() : '';
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      view.prefill(selection);
    }),
  );
}

export function deactivate(): void {}
