import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('PWA cache version is identical in the service worker, app constant and deploy acceptance', async () => {
  const sw = /const VERSION = '([^']+)'/.exec(await readFile('public/sw.js', 'utf8'))?.[1];
  const app = /PWA_VERSION = '([^']+)'/.exec(await readFile('src/lib/pwa-version.ts', 'utf8'))?.[1];
  const deploy = [...(await readFile('.github/workflows/deploy.yml', 'utf8')).matchAll(/PWA_CACHE_VERSION: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(sw, 'sw.js VERSION');
  assert.equal(app, sw);
  assert.ok(deploy.length > 0, 'deploy.yml PWA_CACHE_VERSION');
  for (const version of deploy) assert.equal(version, sw);
});

test('prepare screen is only opened on the home route before first paint', async () => {
  const source = await readFile('src/lib/pwa-version.ts', 'utf8');
  assert.match(source, /location\.pathname!=='\/'/);
  assert.match(source, /window\.self!==window\.top/);
});
