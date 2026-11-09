import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = join(root, 'tmp');
await mkdir(tempRoot, { recursive: true });
const staging = await mkdtemp(join(tempRoot, 'demo-build-'));
const output = join(root, 'frontend', 'out');

async function removeOwned(path, parent) {
  if (!resolve(path).startsWith(resolve(parent) + sep)) throw new Error('Unsafe cleanup path');
  await rm(path, { recursive: true, force: true });
}

try {
  // An allowlist makes the build independent of local .env files and backend assets.
  for (const name of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
    await cp(join(root, 'frontend', name), join(staging, name), { recursive: true });
  }
  const env = { ...process.env, MYBUILD_WORKSPACE_ROOT: root, NEXT_TELEMETRY_DISABLED: '1' };
  for (const key of Object.keys(env)) {
    if (/SUPABASE|DATABASE_URL|DIRECT_URL|^NEXT_PUBLIC_(API|WS)_URL$/.test(key)) delete env[key];
  }
  const next = spawnSync(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', staging], {
    cwd: root, env, stdio: 'inherit', windowsHide: true,
  });
  if (next.error) throw next.error;
  if (next.status !== 0) throw new Error(`Static demo build failed (${next.status})`);
  await readFile(join(staging, 'out', 'index.html'));
  await removeOwned(output, join(root, 'frontend'));
  await cp(join(staging, 'out'), output, { recursive: true });
  console.log('Static demo: frontend/out (no backend or Supabase environment used).');
} finally {
  await removeOwned(staging, tempRoot);
}
