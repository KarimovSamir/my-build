import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeaders, headersFor } from './demo-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/out');
const port = Number(process.env.MYBUILD_PREVIEW_PORT ?? 4173);
await stat(join(root, 'index.html')).catch(() => { throw new Error('Run npm run build:demo first.'); });
const rules = parseHeaders(await readFile(join(root, '_headers'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.pdf': 'application/pdf', '.dxf': 'application/dxf' };

const server = createServer(async (req, res) => {
  let applied = headersFor(rules, '/');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...applied, Allow: 'GET, HEAD' }).end(); return;
  }
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4173');
    const pathname = decodeURIComponent(url.pathname);
    applied = headersFor(rules, pathname);
    if (pathname.split('/').some((part) => part.startsWith('.') || part === '_headers' || part === '_redirects')) {
      res.writeHead(404, applied).end(); return;
    }
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(308, { ...applied, Location: url.pathname + '/' + url.search }).end(); return; }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.length, 'cache-control': 'no-cache', ...applied });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const body = error instanceof URIError ? Buffer.from('Bad request') : await readFile(join(root, '404.html'));
    res.writeHead(error instanceof URIError ? 400 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...applied });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
}).listen(port, '127.0.0.1', () => console.log(`Static demo: http://127.0.0.1:${server.address().port} (Ctrl+C to stop)`));
