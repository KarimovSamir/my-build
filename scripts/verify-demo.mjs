import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'frontend', 'out');
const routes = ['', 'login', 'orders', 'orders/new', 'orders/view', 'available', 'offers',
  'contractors', 'contractors/view', 'documents', 'notifications', 'settings',
  'register', 'forgot-password', 'reset-password', 'callback', 'callback/complete', 'verify-email', 'no-role'];
let scanned = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(path); continue; }
    if (!['.js', '.html', '.txt', '.css', '.json'].includes(extname(path))) continue;
    const contents = await readFile(path, 'utf8');
    // Technology names in the landing copy are allowed; runtime endpoints and secrets are not.
    assert(!/supabase\.co|onrender\.com|\/auth\/v1|\/rest\/v1|\/storage\/v1|\/socket\.io\/|localhost:4000|sb_secret_|postgres(?:ql)?:\/\//i.test(contents),
      `Unexpected server dependency or credential in ${path}`);
    scanned++;
  }
}
await inspect(output);
for (const route of routes) await readFile(join(output, route, 'index.html'));

// A separate Node process serves the actual export. No browser or user process is controlled.
const child = spawn(process.execPath, [join(root, 'scripts', 'preview-demo.mjs')], {
  cwd: root, windowsHide: true, env: { ...process.env, MYBUILD_PREVIEW_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let errors = '';
child.stderr.on('data', (chunk) => { errors += chunk; });
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Preview did not start: ${errors}`)), 10_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Preview exited (${code}): ${errors}`)); });
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  const resources = new Set();
  for (const route of routes) {
    const response = await fetch(`${base}/${route}${route ? '/' : ''}?id=sample-4`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /<html/);
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/[^"?#]+)[^"]*"/g)) resources.add(match[1]);
  }
  for (const asset of resources) assert.equal((await fetch(`${base}${asset}`)).status, 200, asset);
  const sample = await fetch(`${base}/demo/room-plan.dxf`);
  assert.equal(sample.status, 200);
  assert.deepEqual(Buffer.from(await sample.arrayBuffer()), await readFile(join(root, 'frontend/public/demo/room-plan.dxf')));
  assert.equal((await fetch(`${base}/orders/?id=unknown`)).status, 200);
  assert.equal((await fetch(`${base}/does-not-exist/`)).status, 404);
  const redirect = await fetch(`${base}/orders/view?id=sample-4`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/orders/view/?id=sample-4');
  console.log(`Verified ${routes.length} static routes, ${resources.size} referenced assets, sample download and ${scanned} exported text files. No browser used.`);
} finally {
  if (child.exitCode === null) {
    const stopped = once(child, 'exit'); child.kill(); await stopped;
  }
}
