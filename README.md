<div align="center">

<img src="electron/assets/icon-wire-256.png" width="120" alt="Draht">

# Draht

**A Telegram desktop client with a plugin system.**

A fork of [telegram-tt](https://github.com/Ajaxy/telegram-tt) (Telegram Web A) wrapped in
an Electron shell — in the spirit of [Vencord](https://github.com/Vendicated/Vencord).

*Draht* is German for "wire".

</div>

---

## Features

### MessageLogger

Deleted messages don't disappear. They stay in the conversation, marked in red, so you can
still read what was said.

- **Works in every chat type** — channels, groups, and private chats
- **Edit history** — every previous version of an edited message, with timestamps
- **Manual control** — purge a single message, clear a whole chat's log, or exclude
  specific people and chats from logging entirely
- **Survives restarts** — with configurable retention limits so it can't grow forever
- **Secret chats are never logged**, by default. They carry an end-to-end promise that
  ordinary chats don't.

### Themes

Recolour the entire client. Ships with **caelus** (warm, muted, dark), and you can build
your own from eleven colours in a picker — everything else is derived from those, so hover
states, tints and borders stay consistent automatically.

- Built-in colour picker; no config files to hand-edit
- Brightness dial for lightening any theme
- Drop `.json` files into your themes folder and they appear in the list — the folder is
  created on first run with a worked example inside
- Includes a colour for deleted messages, so MessageLogger matches your theme

### HideSponsored

Hides sponsored messages (ads) in channels.

### Plugin system

Every feature above is a plugin. Writing one is a folder with an `index.tsx`:

```tsx
export default definePlugin({
  name: 'MyPlugin',
  description: 'Does something useful.',
  settings,
  seams: {
    messageClassNames: (message) => (message.isOutgoing ? 'my-class' : undefined),
  },
  start() { /* ... */ },
});
```

No registration step — the build discovers it. The settings UI is generated from whatever
options you declare, and plugins enable and disable instantly without a restart.

---

## Install

Download the latest `Draht-Setup-*.exe` from
[Releases](https://github.com/reniaz/draht/releases) and run it.

The build is unsigned, so Windows SmartScreen warns on first launch — click
**More info → Run anyway**.

Draht updates itself: it checks for new releases on launch and offers to restart when one
is ready.

> **You don't need Telegram API credentials to use Draht.** Install it and log in with your
> phone number, exactly like the official client.

Windows x64 only for now. macOS and Linux are configured but unbuilt.

---

## Building from source

Requires Node `^24.11 || ^26` and npm 11+.

```bash
git clone https://github.com/reniaz/draht.git
cd draht
npm install
npm run mod:secrets:install
```

Get an `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org) →
*API development tools*, then create `.env`:

```
TELEGRAM_API_ID=1234567
TELEGRAM_API_HASH=your_hash_here
APP_TITLE=Draht
APP_NAME=Draht
BASE_URL=https://web.telegram.org/a/
```

Those identify *the application* to Telegram, not you — every Telegram client has its own
pair. They get compiled into the build, which is why people installing the `.exe` never
need them.

| Command | |
|---|---|
| `npm run mod:dev` | Dev server + Electron with DevTools |
| `npm run mod:start` | Run the built app |
| `npm run mod:build` | Build the web app and the shell |
| `npm run mod:package` | Build a Windows installer into `release/` |
| `npm run mod:release` | Tag, build and publish a GitHub Release (needs `GH_TOKEN`) |
| `npm run mod:verify` | Typecheck, tests, and the upstream diff budget |

### Releasing

```bash
npm run mod:release
```

Bump `version` in `package.json` first. The script refuses to publish unless the working
tree is clean and pushed, so the released binary always corresponds to a commit anyone can
check out — then tags that commit, builds, and uploads the installer plus the update
manifest to a GitHub Release. Installed copies pick it up on their next launch.

Needs `GH_TOKEN` (a GitHub token with `repo` scope).

Architecture and contributor notes live in **[README.mod.md](README.mod.md)** — how the
plugin system hooks into upstream, and how to rebase onto new telegram-tt releases.

---

## How it works

Vencord patches Discord's webpack module factories at runtime. That has no equivalent
here: telegram-tt ships as native ESM with no module registry to hook. So Draht is a
**fork** with the plugin layer compiled in, through named extension points called *seams*.

The rule is one import plus one expression per upstream call site, enforced by
`npm run mod:diff`, which fails if the footprint grows. Currently **14 upstream files,
largest 9 lines** — that's what keeps rebasing onto new telegram-tt releases a mechanical
operation rather than a rewrite.

The app is served over a loopback origin rather than `file://` (which blocks Web Workers
and breaks IndexedDB persistence) or a custom protocol (which silently breaks the Cache
API that all media caching depends on).

---

## Status

Early. This is a personal project rather than a polished product — expect rough edges, and
open an issue if you hit one.

Not yet implemented: inline edit history under messages (it's currently in a modal),
collapsing runs of consecutive deleted messages, and ignore-lists by folder.

---

## Privacy

Everything Draht records stays on your machine. No telemetry, no analytics, no server of
its own — it talks only to Telegram, exactly as the official client does. The message log
lives in local storage on your computer and is never transmitted anywhere.

Persistence disables itself automatically when a Telegram passcode is set, because
Telegram encrypts its own cached data behind that passcode and Draht's log sits outside
it.

Worth saying plainly: this client keeps messages other people chose to delete. That's the
point of it, but it's worth knowing what you're running.

---

## Credits

Built on [telegram-tt](https://github.com/Ajaxy/telegram-tt) by Alexander Zinchuk — Draht
is a fork of it and wouldn't exist otherwise. Upstream's own README, including the full
dependency licence list, is preserved at [README.upstream.md](README.upstream.md).

Plugin architecture inspired by [Vencord](https://github.com/Vendicated/Vencord). The
bundled *caelus* palette is adapted from the colourscheme of the same name by **dacctal**.

## Licence

[GPL-3.0-or-later](LICENSE), inherited from telegram-tt. If you distribute builds, you must
make your source available.

Third-party Telegram clients are explicitly permitted — the MTProto API is public, and
registering your own `api_id` is the supported path.
