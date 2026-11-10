import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compileVercelHeaders, vercelHeadersFor } from './vercel-headers.mjs';
import { headersFor, parseHeaders } from './demo-headers.mjs';

test('deployed directory URL regression: strict named wildcard misses pages, full wildcard covers them', () => {
  const config = (source) => ({ headers: [{ source, headers: [{ key: 'X-Test', value: 'yes' }] }] });
  const old = compileVercelHeaders(config('/:path*'));
  const fixed = compileVercelHeaders(config('/(.*)'));
  for (const path of ['/', '/login/', '/orders/', '/orders/view/', '/missing/']) {
    assert.equal(vercelHeadersFor(old, path)['x-test'], undefined);
    assert.equal(vercelHeadersFor(fixed, path)['x-test'], 'yes');
  }
  assert.equal(vercelHeadersFor(old, '/index.html')['x-test'], 'yes');
});

test('actual Vercel policy covers exported pages, nested URLs, files and missing routes like preview', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const preview = parseHeaders(await readFile(new URL('../frontend/public/_headers', import.meta.url), 'utf8'));
  const compiled = compileVercelHeaders(config);
  for (const path of ['/', '/index.html', '/orders', '/orders/', '/orders/new/', '/orders/view/', '/contractors/view/', '/callback/complete/', '/unknown/', '/404.html', '/robots.txt', '/_next/static/chunks/a.js', '/_next/static/media/a.woff2', '/demo/', '/demo/room-plan.dxf']) {
    assert.deepEqual(vercelHeadersFor(compiled, path), headersFor(preview, path), path);
  }
});
