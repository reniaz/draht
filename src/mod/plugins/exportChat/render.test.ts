import { describe, expect, it } from 'vitest';

import { buildChatHtml, escapeHtml } from './render';

const base = {
  title: 'Test chat',
  vars: { '--color-background': '#101010', '--color-text': '#ffffff' },
  exportedAt: Date.UTC(2026, 0, 15, 12, 0),
};

const message = (over: Partial<Parameters<typeof buildChatHtml>[0]['messages'][0]> = {}) => ({
  id: 1,
  sender: 'Alice',
  date: Date.UTC(2026, 0, 15, 10, 30),
  text: 'hello',
  ...over,
});

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    // Every string in the export came from someone else, so this is the only thing
    // between a message containing a script tag and a file that runs it when opened.
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes quotes and ampersands too', () => {
    expect(escapeHtml(`&"'`)).toBe('&amp;&quot;&#39;');
  });
});

describe('buildChatHtml', () => {
  it('produces a standalone document', () => {
    const html = buildChatHtml({ ...base, messages: [message()] });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    // No external requests: a file that needs the network is not an archive.
    expect(html).not.toMatch(/<(script|link)\b/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('carries the theme in as CSS variables', () => {
    const html = buildChatHtml({ ...base, messages: [message()] });

    expect(html).toContain('--color-background: #101010;');
    expect(html).toContain('--color-text: #ffffff;');
  });

  it('escapes the messages, the senders and the title', () => {
    const html = buildChatHtml({
      ...base,
      title: '<b>chat</b>',
      messages: [message({ text: '<img onerror=alert(1)>', sender: '</div><script>' })],
    });

    expect(html).not.toContain('<img onerror');
    expect(html).not.toContain('</div><script>');
    expect(html).toContain('&lt;img onerror');
  });

  it('keeps the sender line breaks and nothing else', () => {
    const html = buildChatHtml({ ...base, messages: [message({ text: 'one\ntwo' })] });

    expect(html).toContain('one<br>two');
  });

  it('describes media instead of embedding it', () => {
    const html = buildChatHtml({
      ...base,
      messages: [message({ text: '', attachment: 'Photo' })],
    });

    expect(html).toContain('Photo');
    expect(html).not.toContain('data:image');
  });

  it('marks messages the sender deleted', () => {
    const html = buildChatHtml({ ...base, messages: [message({ isDeleted: true })] });

    expect(html).toContain('class="msg deleted"');
  });

  it('groups messages under the day they were sent', () => {
    const html = buildChatHtml({
      ...base,
      messages: [
        message({ id: 1, date: Date.UTC(2026, 0, 14, 10) }),
        message({ id: 2, date: Date.UTC(2026, 0, 14, 11) }),
        message({ id: 3, date: Date.UTC(2026, 0, 15, 9) }),
      ],
    });

    // Two days, so two dividers — not one per message.
    expect(html.match(/class="day"/g)).toHaveLength(2);
  });

  it('says how many messages it holds, so it never implies it is complete', () => {
    const html = buildChatHtml({ ...base, messages: [message(), message({ id: 2 })] });

    expect(html).toContain('2 messages');
  });

  it('renders an empty chat rather than a broken file', () => {
    const html = buildChatHtml({ ...base, messages: [] });

    expect(html).toContain('No messages were loaded');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });
});
