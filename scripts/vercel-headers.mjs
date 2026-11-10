import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp');

// Vercel routing-utils sourceToRegex uses these strict options. In particular,
// /:path* excludes both the root slash and a trailing slash; /(.*) includes them.
// This checks header matching only, not the whole Vercel CDN router.
export function compileVercelHeaders(config) {
  return config.headers.map(({ source, headers }) => ({
    matcher: pathToRegexp(source, [], { strict: true, sensitive: true, delimiter: '/' }),
    headers: Object.fromEntries(headers.map(({ key, value }) => [key.toLowerCase(), value])),
  }));
}

export function vercelHeadersFor(rules, pathname) {
  const result = {};
  for (const { matcher, headers } of rules) {
    if (!matcher.test(pathname)) continue;
    for (const [key, value] of Object.entries(headers)) {
      assert(!Object.hasOwn(result, key), `Overlapping Vercel header: ${key}`);
      result[key] = value;
    }
  }
  return result;
}
