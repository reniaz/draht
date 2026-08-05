#!/usr/bin/env node
/**
 * Lists the chats your announcement bot can currently see, with their ids.
 *
 *   npm run mod:telegram:chats
 *
 * A public channel can be addressed as `@name`. A private one has no username, only an
 * invite link, so `DRAHT_TELEGRAM_CHAT` has to be its numeric id — and that id is not
 * shown anywhere in the Telegram apps.
 *
 * The usual advice is to forward a message to a third-party bot that reports the id. That
 * works, but it hands the message to someone else's bot. Your own bot is already an
 * administrator of the channel, so it can be asked directly.
 *
 * Telegram only keeps recent updates, and only delivers them to `getUpdates` while no
 * webhook is set. So: add the bot to the channel first, post a message there, then run
 * this.
 */
const TOKEN = process.env.DRAHT_TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error('\n  DRAHT_TELEGRAM_TOKEN is not set.');
  console.error('  Create a bot with @BotFather, then set the token in your environment.\n');
  process.exit(1);
}

const api = (method) => fetch(`https://api.telegram.org/bot${TOKEN}/${method}`)
  .then((r) => r.json());

const me = await api('getMe');
if (!me.ok) {
  console.error(`\n  Telegram rejected the token: ${me.description}\n`);
  process.exit(1);
}

console.log(`\nBot: @${me.result.username}\n`);

const updates = await api('getUpdates');
if (!updates.ok) {
  console.error(`  Could not read updates: ${updates.description}\n`);
  process.exit(1);
}

// One update per message, so the same chat appears many times.
const chats = new Map();
for (const update of updates.result) {
  const message = update.channel_post || update.message || update.my_chat_member;
  const chat = message?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (!chats.size) {
  console.log('  No chats visible yet.\n');
  console.log('  Telegram only reports recent activity, so:');
  console.log('    1. add the bot to the channel as an administrator that can post,');
  console.log('    2. post any message in the channel,');
  console.log('    3. run this again.\n');
  console.log('  If the bot has a webhook set, getUpdates stays empty by design —');
  console.log(`    clear it with https://api.telegram.org/bot<token>/deleteWebhook\n`);
  process.exit(0);
}

for (const chat of chats.values()) {
  const name = chat.title || chat.username || `${chat.first_name || ''} ${chat.last_name || ''}`.trim();
  const addressable = chat.username ? `@${chat.username}` : String(chat.id);

  console.log(`  ${name} (${chat.type})`);
  console.log(`    DRAHT_TELEGRAM_CHAT=${addressable}`);
  if (chat.username) console.log(`    private id, if you ever unpublish it: ${chat.id}`);
  console.log('');
}
