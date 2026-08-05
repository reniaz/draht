# Draht

A Telegram client with a plugin system — a fork of [telegram-tt](https://github.com/Ajaxy/telegram-tt)
(Telegram Web A) wrapped in an Electron desktop shell, in the spirit of Vencord/Vesktop.

*Draht* is German for "wire".

## What it does

| Plugin | |
|---|---|
| **MessageLogger** | Keeps deleted messages visible instead of letting them disappear, and records the previous versions of edited messages. Deleted messages can be purged manually, per message or per chat. |
| **Themes** | Custom colourschemes, applied over Telegram's own palette. Ships with *caelus*; any palette can be built from ten colours in a picker, or imported from a Zed theme. |
| **HideSponsored** | Hides sponsored messages (ads) in channels. |

Settings → **Plugins**.

---

## Building it

Requires Node `^24.11 || ^26` and npm 11+.

```bash
npm install
```

Then get an `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org) →
*API development tools*, and put them in `.env`:

```
TELEGRAM_API_ID=1234567
TELEGRAM_API_HASH=...
APP_TITLE=Draht
APP_NAME=Draht
BASE_URL=https://web.telegram.org/a/
```

`.env` is gitignored. The build fails without those two values.

| Command | |
|---|---|
| `npm run mod:dev` | Vite dev server + Electron with DevTools. Fast iteration. |
| `npm run mod:build` | Production build of the web app and the shell. |
| `npm run mod:start` | Runs the built app. |
| `npm run mod:package` | Builds a Windows installer into `release/`. |
| `npm run mod:verify` | Typecheck + tests + upstream diff budget. |
| `npm run mod:smoke` | Checks the shell's transport (workers, IndexedDB, Cache API). |
| `npm run mod:icon` | Regenerates icon PNG/ICO from the SVGs. |

### Distributing it

`npm run mod:package` produces `release/Draht-Setup-<version>.exe`.

> **Your API credentials are compiled into that installer.** Anyone you send it to will be
> using *your* `api_id`. Telegram rate-limits and can ban an `api_id` for the behaviour of
> everyone using it, and it is tied to your my.telegram.org account. For a couple of
> friends this is normally fine; for wider distribution, have people build with their own
> credentials.

The build is unsigned, so Windows SmartScreen will warn on first run — recipients need
*More info* → *Run anyway*. Silencing that needs a real code-signing certificate.

---

## Architecture

Vencord patches Discord's webpack module factories at runtime. That has no equivalent
here: telegram-tt ships as native ESM (Vite/Rolldown) with no module registry to hook. So
this is a **fork** with the plugin layer compiled in.

```
src/mod/            all mod code — upstream never creates this path
├─ api/             plugin system: types, PluginManager, Settings, Seams, ActionBus, Storage
├─ components/      settings screen, ModRoot (root-level modals)
├─ plugins/         one directory per plugin, globbed at build time
└─ userplugins/     gitignored drop-in
electron/           desktop shell (main, preload, loopback server, smoke test)
tools/              icon builder, diff guard, Vite plugin for the plugin registry
```

Three things carry the design:

**Seams** replace Vencord's `patches`. Each is a named, typed extension point compiled
into upstream at a single call site. The rule is strict: **one import plus one expression
per upstream file**. If a seam needs more than that where it's called, the seam is wrong
and the logic belongs in `src/mod/`.

**The ActionBus** registers exactly one permanent handler per action name and fans out to
a mutable array of plugin handlers. Upstream has `addActionHandler` but no
`removeActionHandler`, so a handler-per-plugin design could never be stopped — plugins
would be un-disableable without a reload. The fan-out makes stop an array splice.

**The loopback server** (`electron/server.ts`) serves the built app over
`http://127.0.0.1:48764` instead of `file://` or a custom scheme. `file://` blocks Workers
and gives an opaque origin; a custom `app://` scheme breaks the Cache API, which all media
caching runs through. The port is fixed because IndexedDB is scoped to the origin, and the
path prefix is random per launch so nothing else on the machine can reach the app.

---

## Keeping up with upstream

The whole strategy rests on the upstream diff staying tiny. `npm run mod:diff` enforces
that — it fails on any upstream file that isn't allowlisted, or that exceeds its line
budget. Currently 14 files, largest 9 lines.

Forked from `a323b1f29` (2026-07-30), telegram-tt 12.0.37.

```bash
git fetch upstream
git rebase upstream/master
npm run mod:verify
```

Notes:

- `git config rerere.enabled true` is already set. The same handful of conflicts recur
  every rebase and rerere replays their resolutions after the first time.
- Every upstream edit is wrapped in `// #region mod` / `// #endregion mod`, so conflicts
  land inside labelled regions.
- **Upstream commits its `dist/` folder**, and any local build overwrites it. Run
  `git checkout -- dist` before rebasing or you'll fight hundreds of irrelevant conflicts.
- If `mod:diff` fails after a rebase, look at *why* the line count grew before raising a
  budget.

---

## Licence

telegram-tt is GPL-3.0-or-later, so this fork is too. The upstream `LICENSE` is unchanged.
If you distribute binaries, you must make the corresponding source available.

Third-party Telegram clients are explicitly permitted — the MTProto API is public and
registering your own `api_id` is the supported path.

---

## Known limitations

- **Deleted messages appear in a list, not inline, after a restart.** In-session they stay
  in place. Re-injecting them into the message list across restarts requires rebuilding
  `listedIds`/`viewportIds` in the right order, which fails by silently rendering nothing;
  the per-chat *Deleted messages* viewer always works.
- **Media on deleted messages doesn't survive a restart.** The blobs live in Telegram's
  own cache, aren't copied into the log, and the server has deleted the originals.
- **Persistence is off by default when a Telegram passcode is set.** Telegram encrypts its
  own cache behind the passcode; this log sits outside that, so persisting would leave
  deleted messages readable on disk. Opt in under the plugin's settings if you want it.
- **Secret chats are never logged by default.** They carry an explicit end-to-end promise
  that ordinary chats don't.
