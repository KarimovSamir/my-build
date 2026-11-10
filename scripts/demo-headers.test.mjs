import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { headersFor, parseHeaders } from './demo-headers.mjs';

test('Pages rules declare same-origin connections and permissions for inline Next scripts and Blob images', async () => {
  const rules = parseHeaders(await readFile(new URL('../frontend/public/_headers', import.meta.url), 'utf8'));
  for (const path of ['/', '/orders/view/', '/documents/', '/404.html']) {
    const headers = headersFor(rules, path);
    const csp = headers['content-security-policy'];
    assert.match(csp, /connect-src 'self';/);
    assert.match(csp, /script-src 'self' 'unsafe-inline';/);
    assert.match(csp, /img-src 'self' data: blob:;/);
    assert(!/unsafe-eval|https?:|wss?:/.test(csp));
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['cache-control'], undefined);
  }
  assert.equal(headersFor(rules, '/demo/room-plan.dxf')['content-disposition'], 'attachment');
  assert.equal(headersFor(rules, '/_next/static/chunks/hash.js')['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(headersFor(rules, '/orders/index.txt')['cache-control'], undefined);
});
test('rejects unsupported, ambiguous and oversized configuration before publication', () => {
  for (const input of ['  Header: value', '/*\n  Broken', '/:slug\n  Header: value', '/a?query=1\n  Header: value', 'not-a-path', '/*\n  X: a\n  x: b', '/*\n  X: ' + 'a'.repeat(2000)]) {
    assert.throws(() => parseHeaders(input));
  }
  assert.throws(() => headersFor(parseHeaders('/*\n  Cache-Control: no-cache\n/_next/*\n  Cache-Control: immutable'), '/_next/a.js'));
});
