#!/usr/bin/env node
/**
 * Announces a release to Discord and Telegram.
 *
 *   npm run mod:announce            # the version in package.json
 *   npm run mod:announce -- 1.0.11  # any released version, e.g. to re-post one
 *
 * Runs as the last step of `mod:release`, and standalone for a release that was already
 * published.
 *
 * Two different mechanisms, because the platforms differ:
 *
 * - Discord takes an incoming **webhook**. A bot would mean an application, a token, an
 *   invite with scopes and a gateway connection; none of that buys anything for a message
 *   posted on release. Channel Settings -> Integrations -> Webhooks gives a URL, and a
 *   POST to it is the whole integration.
 * - Telegram has no equivalent — its "webhooks" are for *receiving* updates, not posting.
 *   Announcing into a channel means a bot: @BotFather to create one, add it to the channel
 *   as an admin with permission to post, then call `sendMessage`.
 *
 * Both credentials are secrets: anyone holding them can post as you. Keep them in your
 * user environment next to GH_TOKEN, never in the repo. Nothing is sent when they are
 * unset, so a fork or a fresh clone releases fine without them.
 *
 * Nothing here can fail a release. By the time this runs the build is published and
 * installed clients can already see it; a Discord outage must not make that look like a
 * failed release.
 */
import { readFileSync } from 'node:fs';

import { buildNotes } from './notes.mjs';

const DISCORD_WEBHOOK = process.env.DRAHT_DISCORD_WEBHOOK;
const TELEGRAM_TOKEN = process.env.DRAHT_TELEGRAM_TOKEN;
const TELEGRAM_CHAT = process.env.DRAHT_TELEGRAM_CHAT;

// Telegram's own limit is 4096 characters and Discord's embed description 4096, so the
// same budget works for both, with room left for the heading and the links.
const MAX_BODY = 3500;

const { version: packageVersion } = JSON.parse(readFileSync('package.json', 'utf8'));
const version = process.argv[2]?.replace(/^v/, '') || packageVersion;
const tag = `v${version}`;

const builderConfig = readFileSync('electron-builder.yml', 'utf8');
const owner = builderConfig.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builderConfig.match(/^\s*repo:\s*(\S+)/m)?.[1];

const releaseUrl = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;

function truncate(text) {
  return text.length <= MAX_BODY ? text : `${text.slice(0, MAX_BODY - 1)}…`;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function post(name, url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // The body carries the actual reason (bad token, bot not in the channel, deleted
      // webhook), and without it every failure looks the same.
      console.error(`  ${name}: ${response.status} ${(await response.text()).slice(0, 300)}`);
      return false;
    }

    console.log(`  ${name}: announced.`);
    return true;
  } catch (err) {
    console.error(`  ${name}: ${err.message}`);
    return false;
  }
}

const notes = buildNotes(tag, { owner, repo, version });
const changeList = notes.changes.length ? notes.changes : ['Maintenance release.'];

console.log(`\nAnnouncing ${tag}...\n`);

if (!DISCORD_WEBHOOK && !TELEGRAM_TOKEN) {
  console.log('  No announcement targets configured; skipping.');
  console.log('  Set DRAHT_DISCORD_WEBHOOK and/or DRAHT_TELEGRAM_TOKEN + '
    + 'DRAHT_TELEGRAM_CHAT to enable.\n');
  process.exit(0);
}

if (DISCORD_WEBHOOK) {
  await post('Discord', DISCORD_WEBHOOK, {
    // A plain embed rather than a fat message: Discord renders the title as the link and
    // collapses long descriptions, which is what you want in a busy channel.
    embeds: [{
      title: `Draht ${version}`,
      url: releaseUrl,
      description: truncate(changeList.map((line) => `• ${line}`).join('\n')),
      // Telegram blue, matching the icon.
      color: 0x2AABEE,
      fields: [{
        name: 'Download',
        value: `[Windows](${notes.downloads.windows})`
          + ` · [Linux AppImage](${notes.downloads.appImage})`
          + ` · [Fedora rpm](${notes.downloads.rpm})`,
      }],
      footer: { text: 'Existing installs update on next launch' },
    }],
  });
}

if (TELEGRAM_TOKEN) {
  if (!TELEGRAM_CHAT) {
    console.error('  Telegram: DRAHT_TELEGRAM_CHAT is not set (e.g. @drahtupdates).');
  } else {
    const text = [
      `<b>Draht ${escapeHtml(version)}</b>`,
      '',
      truncate(changeList.map((line) => `• ${escapeHtml(line)}`).join('\n')),
      '',
      `Download: <a href="${notes.downloads.windows}">Windows</a>`
      + ` · <a href="${notes.downloads.appImage}">Linux AppImage</a>`
      + ` · <a href="${notes.downloads.rpm}">Fedora rpm</a>`,
      `<a href="${releaseUrl}">Release notes</a>`,
      '',
      '<i>Existing installs update on next launch.</i>',
    ].join('\n');

    await post('Telegram', `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT,
      text,
      parse_mode: 'HTML',
      // The preview would be a second, larger copy of the link already in the message.
      link_preview_options: { is_disabled: true },
    });
  }
}

console.log('');
