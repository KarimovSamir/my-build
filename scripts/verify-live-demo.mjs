import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileVercelHeaders, vercelHeadersFor } from './vercel-headers.mjs';
import { join, relative, sep } from 'node:path';
const target = new URL(process.argv[2] ?? 'https://mybuild.mydigitalhome.me');
if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw Error('Provide an HTTPS origin without credentials, path or query');
const origin = target.origin;
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const headerRules = compileVercelHeaders(config);
const routes = ['/', '/login/', '/orders/', '/orders/new/', '/orders/view/?id=sample-4', '/available/', '/offers/', '/contractors/', '/contractors/view/?id=stroygrad', '/documents/', '/notifications/', '/settings/', '/register/', '/forgot-password/', '/reset-password/', '/callback/', '/callback/complete/', '/verify-email/', '/no-role/'];
const report = { at: new Date().toISOString(), origin, routes: [], assets: [], probes: [], findings: [], externalAssets: [], markers: [], browserUsed: false };
const resources = new Set(['/demo/room-plan.dxf', '/robots.txt']);
const bodies = new Map();
const forbidden = /supabase\.co|onrender\.com|cron-job\.org|\/auth\/v1|\/rest\/v1|\/storage\/v1|\/socket\.io\/|localhost:4000|sb_secret_|postgres(?:ql)?:\/\/|-----BEGIN [\w ]*PRIVATE KEY-----|GoTrueClient|SupabaseClient|socket\.io-client|MYBUILD_SECRET_SENTINEL/i;
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function get(path, method = 'GET', redirect = 'follow') {
  let url = new URL(path, origin); const start = performance.now();
  for (let n = 0; n < 6; n++) {
    if (url.host !== new URL(origin).host) throw Error('Unexpected host');
    const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status) && redirect === 'follow') {
      url = new URL(response.headers.get('location'), url); continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return { path, url: url.href, status: response.status, ms: Math.round(performance.now() - start), headers: Object.fromEntries(response.headers), bytes, sha256: hash(bytes) };
  }
  throw Error('Too many redirects');
}
function summary(r) { const { bytes, ...rest } = r; return { ...rest, bytes: bytes.length }; }
function checkHeaders(r) {
  const path = new URL(r.url).pathname;
  for (const [key, value] of Object.entries(vercelHeadersFor(headerRules, path))) {
    if (r.headers[key] !== value) report.findings.push({ path: r.path, kind: 'header', header: key, expected: value, actual: r.headers[key] ?? null });
  }
}
function scan(path, text) {
  const bad = text.match(forbidden);
  if (bad) report.markers.push({ path, marker: bad[0] });
  for (const m of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|media)\/[a-zA-Z0-9_.~-]+\.(?:js|css|woff2?|png|jpg|svg)/g)) resources.add(m[0].startsWith('/') ? m[0] : '/_next/' + m[0]);
}
for (const path of routes) {
  try {
    const r = await get(path); report.routes.push(summary(r)); checkHeaders(r);
    if (r.status !== 200 || !r.headers['content-type']?.includes('text/html')) report.findings.push({ path, kind: 'page-status', status: r.status });
    const html = r.bytes.toString(); bodies.set(path, html); scan(path, html);
    for (const tag of html.matchAll(/<(script|link|img)\b[^>]*>/gi)) {
      const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
      if (tag[1] === 'link' && !['stylesheet', 'preload', 'modulepreload', 'icon'].includes(attrs.rel)) continue;
      const src = attrs.src ?? attrs.href;
      if (!src || src.startsWith('data:')) continue;
      const u = new URL(src.replaceAll('&amp;', '&'), origin);
      if (u.origin !== origin) report.externalAssets.push(u.href); else resources.add(u.pathname);
    }
  } catch (e) { report.findings.push({ path, error: e.message }); }
}
// Next's Linux export flattens segment separators into dots. Our Windows export
// can retain nested paths, so normalize only the suffix starting with __next.
async function addPayloads(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await addPayloads(file);
    else if (entry.name.endsWith('.txt')) {
      const url = '/' + relative('frontend/out', file).split(sep).join('/');
      const start = url.indexOf('/__next.');
      resources.add(start < 0 ? url : url.slice(0, start + 1) + url.slice(start + 1).replaceAll('/', '.'));
    }
  }
}
await addPayloads('frontend/out');
const pending = [...resources]; const visited = new Set();
while (pending.length) {
  const batch = pending.splice(0, 6).filter((p) => !visited.has(p)); batch.forEach((p) => visited.add(p));
  if (visited.size > 300) throw Error('Resource cap exceeded');
  await Promise.all(batch.map(async (path) => {
    try {
      const r = await get(path); report.assets.push(summary(r)); checkHeaders(r);
      if (r.status !== 200) report.findings.push({ path, kind: 'asset-status', status: r.status });
      if (/\.(?:js|css|txt|svg)$/.test(path)) {
        const text = r.bytes.toString(); scan(path, text);
        if (path.endsWith('.css')) for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          if (m[1].startsWith('data:')) continue;
          const u = new URL(m[1], r.url);
          if (u.origin !== origin) report.externalAssets.push(u.href); else resources.add(u.pathname);
        }
        bodies.set(path, text);
      }
      if (path === '/demo/room-plan.dxf') report.sampleMatchesSource = r.sha256 === hash(await readFile('frontend/public/demo/room-plan.dxf'));
    } catch (e) { report.findings.push({ path, error: e.message }); }
  }));
  for (const path of resources) if (!visited.has(path) && !pending.includes(path)) pending.push(path);
}
for (const [path, method, expected] of [[origin.replace('https:', 'http:') + '/', 'GET', 308], ['/orders/view?id=sample-4','GET',308], ['/orders/','HEAD',200], ['/missing-audit-route/','GET',404], ['/.env','GET',404], ['/package.json','GET',404], ['/orders/view/?id=missing-audit','GET',200], ['/?deployment_audit=1','GET',200]]) {
  try {
    const r = await get(path, method, path.includes('?id=sample-4') || path.startsWith('http:') ? 'manual' : 'follow');
    report.probes.push(summary(r));
    if (r.url.startsWith('https:') && [200, 404].includes(r.status)) checkHeaders(r);
    if (r.status !== expected) report.findings.push({ path, kind: 'probe-status', expected, actual: r.status });
  } catch (e) { report.findings.push({ path, error: e.message }); }
}
report.autonomousMarkers = {};
const all = [...bodies.values()].join('\n');
for (const marker of ['mybuild-autonomous-demo', 'mybuild-demo-actor', 'Мои проекты', 'Все проекты']) { report.autonomousMarkers[marker] = all.includes(marker); if (!all.includes(marker)) report.findings.push({ kind: 'missing-demo-marker', marker }); }
if (!report.sampleMatchesSource) report.findings.push({ kind: 'sample-mismatch' });
if (report.markers.length || report.externalAssets.length) report.findings.push({ kind: 'unexpected-dependency' });
await mkdir('tmp/live-audit', { recursive: true });
for (const [path, body] of bodies) if (path.endsWith('.js')) await writeFile('tmp/live-audit/' + path.split('/').at(-1), body);
await writeFile('tmp/live-demo-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: report.routes.length, assets: report.assets.length, probes: report.probes.length, sampleMatchesSource: report.sampleMatchesSource, markers: report.markers, externalAssets: report.externalAssets, autonomousMarkers: report.autonomousMarkers, findings: report.findings.slice(0, 15), findingsCount: report.findings.length }, null, 2));

if (report.findings.length) process.exitCode = 1;
