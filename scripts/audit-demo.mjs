import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { headersFor, parseHeaders } from './demo-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'frontend/out');
const origin = 'https://demo.invalid';
const rules = parseHeaders(await readFile(join(output, '_headers'), 'utf8'));
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), 'Export must not contain symbolic links');
    if (entry.isDirectory()) await walk(path);
    else files.push({ path, url: '/' + relative(output, path).split(sep).join('/'), bytes: await readFile(path) });
  }
}
await walk(output);
const byUrl = new Map(files.map((file) => [file.url, file]));
const textTypes = new Set(['.html', '.js', '.css', '.txt', '.json', '.svg']);
const forbidden = /supabase\.co|onrender\.com|cron-job\.org|\/auth\/v1|\/rest\/v1|\/storage\/v1|\/socket\.io\/|localhost:4000|sb_secret_|postgres(?:ql)?:\/\/|-----BEGIN [\w ]*PRIVATE KEY-----|GoTrueClient|SupabaseClient|socket\.io-client|MYBUILD_SECRET_SENTINEL/i;
for (const file of files) {
  assert(!/(?:^|\/)(?:\.env(?:\..*)?|node_modules|src|functions|_worker\.js)(?:\/|$)|\.(?:pem|key|map)$/i.test(file.url), `Unexpected exported file: ${file.url}`);
  if (textTypes.has(extname(file.path))) assert(!forbidden.test(file.bytes.toString('utf8')), `Server dependency or secret marker in ${file.url}`);
}

function asset(url, parent = '/') {
  const parsed = new URL(url.replaceAll('&amp;', '&'), origin + parent);
  assert.equal(parsed.origin, origin, `External resource: ${parsed.origin}`);
  const file = byUrl.get(decodeURIComponent(parsed.pathname));
  assert(file, `Missing asset: ${parsed.pathname}`);
  return file;
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const pages = [];
for (const file of files.filter((f) => f.url.endsWith('.html'))) {
  const route = file.url.replace(/index\.html$/, '');
  const html = file.bytes.toString('utf8');
  const csp = headersFor(rules, route)['content-security-policy'];
  assert(csp?.includes("connect-src 'self'"));
  assert(csp.includes("script-src 'self' 'unsafe-inline'") && !csp.includes('unsafe-eval'));
  assert(csp.includes("img-src 'self' data: blob:") && csp.includes("font-src 'self'"));
  const initial = new Map([[file.url, { file, kind: 'html' }]]);
  const deferred = new Set();
  let inlineScripts = 0;
  for (const match of html.matchAll(/<(script|link|img|iframe|video|source)\b[^>]*>/gi)) {
    const kind = match[1].toLowerCase(); const a = attrs(match[0]);
    assert(!['iframe', 'video', 'source'].includes(kind), `Unexpected embedded media on ${route}`);
    assert(!/\son\w+=/i.test(match[0]), `Inline event handler on ${route}`);
    if (kind === 'script') {
      if (a.src) { const f = asset(a.src); initial.set(f.url, { file: f, kind: 'js' }); }
      else inlineScripts++;
    } else if (kind === 'link' && ['stylesheet', 'preload', 'modulepreload'].includes(a.rel)) {
      const f = asset(a.href);
      initial.set(f.url, { file: f, kind: a.as === 'font' ? 'font' : extname(f.path).slice(1) });
    } else if (kind === 'img') {
      if (!a.src || a.src.startsWith('data:')) continue;
      const f = asset(a.src);
      if (a.loading === 'lazy') deferred.add(f.url);
      else initial.set(f.url, { file: f, kind: 'image' });
    }
  }
  assert(!html.includes('/_next/image?'), 'Static export cannot use the Next image optimizer');
  const resources = [...initial.values()].map(({ file: f, kind }) => ({ url: f.url, kind, bytes: f.bytes.length, gzipBytes: gzipSync(f.bytes).length }));
  pages.push({ route, inlineScripts, bytes: resources.reduce((sum, f) => sum + f.bytes, 0),
    gzipBytes: resources.reduce((sum, f) => sum + f.gzipBytes, 0), resources, lazyImages: [...deferred] });
}
// Every CSS resource resolves locally, including non-preloaded language subsets.
for (const file of files.filter((f) => f.url.endsWith('.css'))) {
  for (const match of file.bytes.toString().matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
    if (!match[1].startsWith('data:')) asset(match[1], file.url);
  }
}
const report = {
  generatedAt: new Date().toISOString(), node: process.version,
  method: 'Static HTML resource references, no browser. gzip is computed per file, not measured network transfer. Excludes route prefetch, later dynamic chunks and fonts selected at runtime. LCP is not measured.',
  lcp: null, fileCount: files.length, totalBytes: files.reduce((sum, f) => sum + f.bytes.length, 0),
  largestFiles: [...files].sort((a, b) => b.bytes.length - a.bytes.length).slice(0, 10).map((f) => ({ url: f.url, bytes: f.bytes.length })),
  artifactSha256: createHash('sha256').update(files.sort((a, b) => a.url.localeCompare(b.url)).map((f) => `${f.url}:${createHash('sha256').update(f.bytes).digest('hex')}`).join('\n')).digest('hex'),
  headers: rules, pages,
};
await mkdir(join(root, 'tmp'), { recursive: true });
await writeFile(join(root, 'tmp/demo-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Static audit: ${files.length} files, ${pages.length} HTML pages, no forbidden markers or external referenced resources. Report: tmp/demo-audit.json`);
for (const route of ['/', '/login/', '/orders/', '/orders/view/', '/documents/']) {
  const page = pages.find((p) => p.route === route);
  console.log(`${route}: ${Math.round(page.bytes / 1024)} KiB raw, ${Math.round(page.gzipBytes / 1024)} KiB gzip estimate; ${page.lazyImages.length} lazy image(s). LCP: not measured.`);
}
