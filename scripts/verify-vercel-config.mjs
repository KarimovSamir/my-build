import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { headersFor, parseHeaders } from './demo-headers.mjs';

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.engines.node, '24.x', 'Vercel must use the tested Node major, not an open-ended range');
assert.equal(config.framework, null, 'Deploy as Other/static, without the Vercel Next server adapter');
assert.equal(config.installCommand, 'npm run install:demo');
assert.equal(config.buildCommand, 'npm run build:vercel');
assert.equal(config.outputDirectory, 'frontend/out');
assert.equal(config.trailingSlash, true, 'Directory routes must agree with the Next export');
assert.equal(config.cleanUrls, false);
for (const key of ['functions', 'crons', 'builds', 'routes', 'rewrites', 'redirects']) {
  assert(!Object.hasOwn(config, key), `Unexpected runtime or routing override: ${key}`);
}

// Compare declarations, not an emulation of Vercel's request router.
const previewRules = parseHeaders(await readFile(new URL('../frontend/public/_headers', import.meta.url), 'utf8'));
const vercelRules = config.headers.map(({ source, headers, ...extra }) => {
  assert.equal(Object.keys(extra).length, 0, 'Conditional headers need a separate review');
  assert(['/:path*', '/_next/static/:path*', '/demo/:path*'].includes(source));
  const entries = headers.map(({ key, value }) => [key.toLowerCase(), value]);
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Duplicate Vercel header');
  return { path: source.replace(':path*', '*'), headers: Object.fromEntries(entries) };
});
assert.deepEqual(vercelRules, previewRules, 'Vercel and local preview must declare the same security/cache policy');
for (const path of ['/', '/orders/view/', '/404.html', '/_next/static/chunks/example.js', '/demo/room-plan.dxf']) {
  headersFor(vercelRules, path); // Also reject conflicting matching rules.
}
console.log('Vercel static configuration and header parity verified. No Vercel account accessed.');
