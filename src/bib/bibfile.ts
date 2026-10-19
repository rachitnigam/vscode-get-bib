import * as path from 'node:path';
import * as vscode from 'vscode';
import { appendSplice } from './prepare';
import { KeyedQueue } from './queue';


export function isBibDocument(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'bibtex' || doc.uri.path.toLowerCase().endsWith('.bib');
}

/** Tracks which .bib file Add should write to; see DESIGN.md "Target .bib resolution". */
export class BibTarget implements vscode.Disposable {
  private lastSeen: vscode.Uri | undefined;
  private chosen: vscode.Uri | undefined;
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onDidChange = this.emitter.event;
  private readonly subs: vscode.Disposable[] = [];

  constructor() {
    this.observe(vscode.window.activeTextEditor);
    this.subs.push(
      vscode.window.onDidChangeActiveTextEditor((e) => this.observe(e)),
      vscode.workspace.onDidCloseTextDocument(() => this.emitter.fire(this.current())),
      this.emitter,
    );
  }

  private observe(editor: vscode.TextEditor | undefined): void {
    if (editor && isBibDocument(editor.document)) {
      this.lastSeen = editor.document.uri;
      if (this.chosen && this.chosen.toString() !== editor.document.uri.toString()) this.chosen = undefined;
    }
    this.emitter.fire(this.current());
  }

  /** An explicit choice wins until a different .bib editor is activated. */
  current(): vscode.Uri | undefined {
    if (this.chosen) return this.chosen;
    const active = vscode.window.activeTextEditor;
    if (active && isBibDocument(active.document)) return active.document.uri;
    return this.lastSeen;
  }

  private set(uri: vscode.Uri): vscode.Uri {
    this.chosen = uri;
    this.emitter.fire(this.current());
    return uri;
  }

  /** Current target, or ask the user (single workspace .bib, quick pick, or create). */
  async resolveForAdd(): Promise<vscode.Uri | undefined> {
    return this.current() ?? this.pick(true);
  }

  async pick(autoSingle: boolean): Promise<vscode.Uri | undefined> {
    const files = await vscode.workspace.findFiles('**/*.bib', '**/node_modules/**', 200);
    if (autoSingle && files.length === 1) return this.set(files[0]!);
    if (files.length === 0) return this.create();
    const createItem = { label: '$(new-file) Create new .bib file…', uri: undefined as vscode.Uri | undefined };
    const items = [
      ...files.map((uri) => ({ label: path.basename(uri.fsPath), description: vscode.workspace.asRelativePath(uri), uri })),
      createItem,
    ];
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select the .bib file to add entries to' });
    if (!picked) return undefined;
    return picked.uri ? this.set(picked.uri) : this.create();
  }

  private async create(): Promise<vscode.Uri | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: folder ? vscode.Uri.joinPath(folder, 'references.bib') : undefined,
      filters: { BibTeX: ['bib'] },
      saveLabel: 'Create',
    });
    if (!uri) return undefined;
    if (!(await exists(uri))) await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    return this.set(uri);
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (e) {
    if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') return false;
    throw e;
  }
}

const bibQueue = new KeyedQueue();

/** Runs `fn` after every earlier `withBibLock` call for the same file has settled. */
export function withBibLock<T>(uri: vscode.Uri, fn: () => Promise<T>): Promise<T> {
  return bibQueue.run(uri.toString(), fn);
}

export async function readBib(uri: vscode.Uri): Promise<vscode.TextDocument> {
  return vscode.workspace.openTextDocument(uri);
}

/**
 * Appends via WorkspaceEdit (undoable, works on unsaved buffers, never saves) and reveals the entry.
 * Callers serialize through `withBibLock`; `expectedVersion` catches edits made since `entryText` was computed.
 */
export async function appendEntry(doc: vscode.TextDocument, entryText: string, expectedVersion: number): Promise<void> {
  if (doc.version !== expectedVersion) throw new StaleDocumentError(doc.uri);
  const before = doc.getText();
  const { offset, text } = appendSplice(before, entryText);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(offset), doc.positionAt(before.length)), text);
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error(`Could not edit ${doc.uri.fsPath}`);

  const after = doc.getText();
  const start = doc.positionAt(after.lastIndexOf(entryText));
  const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  editor.selection = new vscode.Selection(start, start);
  editor.revealRange(new vscode.Range(start, start), vscode.TextEditorRevealType.InCenter);
}

export class StaleDocumentError extends Error {
  constructor(readonly uri: vscode.Uri) {
    super(`${path.basename(uri.fsPath)} changed while the entry was being prepared`);
    this.name = 'StaleDocumentError';
  }
}
