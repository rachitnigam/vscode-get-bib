// @ts-check
(function () {
  // @ts-ignore acquireVsCodeApi is injected by VS Code.
  const vscode = acquireVsCodeApi();

  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const form = /** @type {HTMLFormElement} */ ($('search-form'));
  const query = /** @type {HTMLInputElement} */ ($('query'));
  const provider = /** @type {HTMLSelectElement} */ ($('provider'));
  const status = $('status');
  const list = $('results');
  const targetName = $('target-name');

  /** @type {Map<string, {add: HTMLButtonElement, copy: HTMLButtonElement}>} */
  const buttons = new Map();
  /** Re-enables only the button whose request just concluded. */
  function settle(/** @type {{id: string, op: 'add'|'copy'} | undefined} */ f) {
    const b = f && buttons.get(f.id);
    if (!b) return;
    const btn = f.op === 'add' ? b.add : b.copy;
    if (btn.dataset.state === 'pending') {
      btn.dataset.state = '';
      btn.disabled = false;
    }
  }
  const state = vscode.getState() || {};
  if (typeof state.query === 'string') query.value = state.query;
  if (typeof state.provider === 'string') provider.value = state.provider;

  function save() {
    vscode.setState({ query: query.value, provider: provider.value, explicitProvider: state.explicitProvider === true });
  }

  /**
   * @param {string} text
   * @param {'info'|'busy'|'warning'|'success'|'error'} kind
   * @param {string} [url]
   */
  function setStatus(text, kind, url) {
    status.replaceChildren();
    status.className = 'status ' + kind;
    if (kind === 'busy') {
      const s = document.createElement('span');
      s.className = 'spinner';
      s.setAttribute('aria-hidden', 'true');
      status.append(s);
    }
    const t = document.createElement('span');
    t.textContent = text;
    if (url) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'link-button';
      a.textContent = 'Open in browser';
      a.addEventListener('click', () => vscode.postMessage({ type: 'openExternal', url }));
      t.append(' ', a);
    }
    status.append(t);
  }

  /** @param {any} r */
  function renderResult(r) {
    const li = document.createElement('li');
    li.className = 'result';

    const title = document.createElement('div');
    title.className = 'result-title';
    if (r.url) {
      const a = document.createElement('a');
      a.href = r.url;
      a.textContent = r.title;
      a.title = r.url;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ type: 'openExternal', url: r.url });
      });
      title.append(a);
    } else {
      title.textContent = r.title;
    }

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = [r.authors.join(', '), r.venue, r.year].filter((x) => x !== undefined && x !== '').join(' · ');

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'Add';
    add.addEventListener('click', () => {
      add.disabled = true;
      add.dataset.state = 'pending';
      vscode.postMessage({ type: 'add', result: r });
    });
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary';
    copy.textContent = 'Copy BibTeX';
    copy.addEventListener('click', () => {
      copy.disabled = true;
      copy.dataset.state = 'pending';
      vscode.postMessage({ type: 'copy', result: r });
    });
    actions.append(add, copy);
    buttons.set(r.id, { add, copy });

    li.append(title, meta, actions);
    return li;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = query.value.trim();
    if (!q) return;
    save();
    vscode.postMessage({ type: 'search', provider: provider.value, query: q });
  });
  query.addEventListener('input', save);
  provider.addEventListener('change', () => {
    state.explicitProvider = true;
    save();
  });
  $('choose').addEventListener('click', () => vscode.postMessage({ type: 'chooseBib' }));

  window.addEventListener('message', (event) => {
    const m = event.data;
    switch (m.type) {
      case 'config':
        if (!state.explicitProvider) provider.value = m.provider;
        break;
      case 'prefill':
        if (m.query) {
          query.value = m.query;
          save();
        }
        query.focus();
        break;
      case 'results':
        buttons.clear();
        list.replaceChildren(...m.results.map(renderResult));
        break;
      case 'status':
        setStatus(m.text, m.kind);
        settle(m.for);
        break;
      case 'error':
        setStatus(m.text, 'error', m.url);
        settle(m.for);
        break;
      case 'target':
        targetName.textContent = m.fileName ?? 'No .bib file open';
        targetName.classList.toggle('missing', m.fileName === null);
        break;
      case 'added': {
        const b = buttons.get(m.id);
        if (b) {
          b.add.textContent = 'Added ✓';
          b.add.dataset.state = 'done';
          b.add.disabled = true;
        }
        break;
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
