import { describe, expect, it } from 'vitest';
import { doiBibtexUrl, unescapeHtml } from '../src/providers/doi';

describe('unescapeHtml', () => {
  it('decodes named and numeric entities', () => {
    expect(unescapeHtml('A &amp; B &lt;i&gt; &quot;q&quot; &#39;s&#39; &#x27; &#8217;')).toBe('A & B <i> "q" \'s\' \' ’');
  });
  it('does not double-decode', () => {
    expect(unescapeHtml('&amp;amp;')).toBe('&amp;');
  });
});

describe('doiBibtexUrl', () => {
  it('builds a doi.org URL', () => {
    expect(doiBibtexUrl('10.1145/3292500.3330701')).toBe('https://doi.org/10.1145/3292500.3330701');
  });
  it('rejects non-DOIs', () => {
    expect(() => doiBibtexUrl('https://openalex.org/W1')).toThrow();
    expect(() => doiBibtexUrl('10.1/a b')).toThrow();
  });
});
