import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';

/**
 * Why a loopback HTTP server instead of a custom `app://` scheme:
 *
 * A privileged custom scheme satisfies almost everything telegram-tt needs (secure
 * context, Workers, SharedWorker, IndexedDB) but the **Cache API hard-rejects
 * non-HTTP(S) request schemes** — `put()` throws "Request scheme 'app' is unsupported".
 * telegram-tt caches all media through it (tt-media, tt-media-avatars,
 * tt-media-progressive), and `isCacheApiSupported()` probes with `caches.has()`, which
 * does *not* throw — so the app concludes caching works and then fails on every write.
 * Result: media never caches, and the hourly cleanup spams errors.
 *
 * `http://127.0.0.1` is a proper HTTP origin and is treated as a secure context, so
 * everything works. Two properties matter for how it is configured:
 *
 *  - **The port is fixed.** The origin is scheme+host+port, and IndexedDB is scoped to
 *    the origin. An ephemeral port would mint a new origin every launch and silently
 *    wipe the global state cache and our message log on every restart.
 *  - **The path prefix is random per launch.** Anything else on the machine can reach a
 *    loopback port. If another process could navigate a browser to our app it would run
 *    script on our origin and inherit the user's Telegram session and message log. The
 *    unguessable prefix prevents that, and paths outside it are served as plain-text
 *    404s so no script can execute on this origin.
 */
/**
 * Fixed, because the origin is scheme+host+port and IndexedDB is scoped to the origin.
 *
 * `DRAHT_PORT` overrides it for the boot check only (tools/check-app.mjs), so verifying a
 * build does not collide with a running instance. Do not set it for normal use: a
 * different port is a different origin, which orphans the session and the message log.
 */
const PORT = Number(process.env.DRAHT_PORT) || 48764;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.tgs': 'application/octet-stream',
};

export type WebServer = {
  server: Server;
  origin: string;
  baseUrl: string;
};

export function startWebServer(webRoot: string, extraRoutes: Record<string, {
  body: string; type: string;
}> = {}): Promise<WebServer> {
  const secret = randomBytes(16).toString('hex');
  const prefix = `/${secret}`;

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    // Everything outside the secret prefix gets a scriptless plain-text 404, so a
    // process that guesses the port still cannot get code running on this origin.
    if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let rel = url.pathname.slice(prefix.length) || '/';

    const extra = extraRoutes[rel];
    if (extra) {
      res.writeHead(200, { 'content-type': extra.type });
      res.end(extra.body);
      return;
    }

    if (rel === '/') rel = '/index.html';

    const candidate = normalize(join(webRoot, decodeURIComponent(rel)));
    if (candidate !== webRoot && !candidate.startsWith(webRoot + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const exists = existsSync(candidate) && statSync(candidate).isFile();

    // SPA fallback applies only to real navigations, which is what `Accept: text/html`
    // identifies — module scripts request with `Accept: */*`. Falling back for those
    // would turn a plain 404 into "Expected a JavaScript module but got text/html" and
    // hide which asset is actually missing.
    const isNavigation = (req.headers.accept || '').includes('text/html');

    if (!exists && !isNavigation) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`Not found: ${rel}`);
      return;
    }

    if (!exists && process.env.MOD_SERVER_DEBUG) {
      console.log(`[server] fallback -> index.html for ${rel} (accept: ${req.headers.accept})`);
    }

    const target = exists ? candidate : join(webRoot, 'index.html');

    if (!existsSync(target)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Web app not built. Run `npm run build:production` first.');
      return;
    }

    const { size } = statSync(target);
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';

    // Range support so <video>/<audio> seeking works.
    const range = req.headers.range;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;

      if (start >= size || end >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'content-length': String(end - start + 1),
      });
      createReadStream(target, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'content-type': type,
      'content-length': String(size),
      'accept-ranges': 'bytes',
      // The app registers a service worker at its own scope.
      'service-worker-allowed': '/',
    });
    createReadStream(target).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Deliberately fatal rather than falling back to another port: a different
        // port is a different origin, which would silently orphan the existing
        // IndexedDB data (session + message log).
        reject(new Error(
          `Port ${PORT} is already in use. Draht needs this fixed port so its origin `
          + 'stays stable across launches (IndexedDB is scoped to the origin). '
          + 'Close whatever is using it and relaunch.',
        ));
        return;
      }
      reject(err);
    });

    server.listen(PORT, '127.0.0.1', () => {
      resolve({
        server,
        origin: `http://127.0.0.1:${PORT}`,
        baseUrl: `http://127.0.0.1:${PORT}${prefix}/`,
      });
    });
  });
}
