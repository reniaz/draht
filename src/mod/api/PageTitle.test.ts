import { describe, expect, it } from 'vitest';

import { withAppTitle } from './PageTitle';

/**
 * `PAGE_TITLE` comes from `import.meta.env.TG_APP_TITLE`, stubbed to 'Draht' in
 * vitest.mod.config.ts.
 */
describe('withAppTitle', () => {
  it('prefixes a chat name', () => {
    expect(withAppTitle('Alice')).toBe('Draht | Alice');
  });

  it('prefixes forum topics', () => {
    expect(withAppTitle('Some Channel › General')).toBe('Draht | Some Channel › General');
  });

  it('leaves the idle title alone', () => {
    // Upstream uses the app name verbatim when no chat is open.
    expect(withAppTitle('Draht')).toBe('Draht');
  });

  it('leaves decorated forms of the app title alone', () => {
    // Prefixing these would read "Draht | Draht [Inactive]".
    expect(withAppTitle('Draht [Inactive]')).toBe('Draht [Inactive]');
    expect(withAppTitle('[T] Draht')).toBe('[T] Draht');
  });

  it('does not double-prefix', () => {
    expect(withAppTitle('Draht | Alice')).toBe('Draht | Alice');
  });

  it('passes empty titles through', () => {
    expect(withAppTitle('')).toBe('');
  });

  it('prefixes the notification count title', () => {
    expect(withAppTitle('3 notifications')).toBe('Draht | 3 notifications');
  });
});
