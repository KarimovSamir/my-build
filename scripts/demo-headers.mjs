import assert from 'node:assert/strict';

/** Small, strict subset used by our _headers: exact paths or a trailing wildcard.
 * It deliberately rejects unsupported syntax instead of pretending to emulate Pages. */
export function parseHeaders(text) {
  const rules = [];
  let current;
  for (const line of text.split(/\r?\n/)) {
    assert(line.length <= 2000, 'Pages header line exceeds 2000 characters');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      assert(/^\/[A-Za-z0-9_./-]*(?:\*)?$/.test(line), `Unsupported header route: ${line}`);
      current = { path: line, headers: {} }; rules.push(current);
    } else {
      const match = /^\s+([\w-]+):\s*(\S.*)$/.exec(line);
      assert(current && match, 'Malformed header rule');
      const key = match[1].toLowerCase();
      assert(!Object.hasOwn(current.headers, key), `Duplicate header ${key}`);
      current.headers[key] = match[2];
    }
  }
  assert(rules.length > 0 && rules.length <= 100, 'Invalid Pages rule count');
  return rules;
}

export function headersFor(rules, pathname) {
  const headers = {};
  for (const rule of rules) {
    if (rule.path.endsWith('*') ? !pathname.startsWith(rule.path.slice(0, -1)) : pathname !== rule.path) continue;
    for (const [key, value] of Object.entries(rule.headers)) {
      // Pages concatenates matching duplicate headers. Reject them for this project.
      assert(!Object.hasOwn(headers, key), `Overlapping ${key} rules for ${pathname}`);
      headers[key] = value;
    }
  }
  return headers;
}
