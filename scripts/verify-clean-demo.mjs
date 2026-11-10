import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = join(root, 'tmp');
await mkdir(tempRoot, { recursive: true });
const staging = await mkdtemp(join(tempRoot, 'demo-clean-'));
assert(process.env.npm_execpath, 'Run through npm run verify:demo:clean');
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) {
  if (/SUPABASE|DATABASE_URL|DIRECT_URL|^NEXT_PUBLIC_(API|WS)_URL$|MYBUILD_WORKSPACE_ROOT/.test(key)) delete env[key];
}
// Fake values prove these legacy variables cannot enter the export.
for (const key of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_WS_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  env[key] = 'https://MYBUILD_SECRET_SENTINEL.invalid';
}
async function npm(args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], { cwd: staging, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`npm ${args.join(' ')} failed (${code})`)));
  });
}
try {
  for (const path of ['package.json', 'package-lock.json', 'scripts', 'shared/src', 'shared/package.json', 'shared/tsconfig.json', 'shared/tsconfig.build.json',
    'frontend/src', 'frontend/public', 'frontend/package.json', 'frontend/tsconfig.json', 'frontend/next.config.ts', 'frontend/postcss.config.mjs']) {
    await cp(join(root, path), join(staging, path), { recursive: true });
  }
  await npm(['ci', '--ignore-scripts', '--workspace', 'shared', '--workspace', 'frontend', '--include-workspace-root', '--no-audit', '--no-fund']);
  for (const path of ['backend', 'frontend/.env', 'node_modules/@prisma/client']) {
    assert(!(await access(join(staging, path)).then(() => true, () => false)), `Unexpected backend input: ${path}`);
  }
  await npm(['run', 'build:demo']);
  await npm(['run', 'verify:demo']);
  const report = JSON.parse(await readFile(join(staging, 'tmp/demo-audit.json'), 'utf8'));
  await writeFile(join(tempRoot, 'demo-clean-audit.json'), JSON.stringify({ ...report, cleanInstall: true, backendPresent: false, legacyEnvironmentSentinelsAbsent: true }, null, 2) + '\n');
  console.log('Clean install, build and HTTP verification passed without backend, Prisma Client or .env. Report: tmp/demo-clean-audit.json');
} finally {
  if (!resolve(staging).startsWith(resolve(tempRoot) + sep + 'demo-clean-')) throw new Error('Unsafe cleanup path');
  await rm(staging, { recursive: true, force: true });
}
