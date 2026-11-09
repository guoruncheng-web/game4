import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from './games.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pwa-game-repos-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'src/games/sample');
  mkdirSync(join(source, 'public/sample'), { recursive: true });
  writeFileSync(join(source, 'index.ts'), 'export const sample = true;\n');
  writeFileSync(join(source, 'public/sample/sprite.png'), Buffer.from([0, 1, 255]));
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-b', 'main');
  git('add', '.');
  git('-c', 'user.name=PWA Test', '-c', 'user.email=test@local', 'commit', '-m', 'fixture');
  const game = { slug: 'sample', repository: 'guoruncheng-web/sample', kind: 'source-submodule',
    path: 'src/games/sample', revision: git('rev-parse', 'HEAD'), assets: 'public/sample' };
  const lock = { schemaVersion: 1, games: [game] };
  const save = () => writeFileSync(join(root, 'games.lock.json'), JSON.stringify(lock));
  save();
  writeFileSync(join(root, '.gitmodules'), '[submodule "sample"]\n path = src/games/sample\n url = https://github.com/guoruncheng-web/sample.git\n');
  return { root, source, lock, game, save, git };
}

test('a fresh checkout materializes byte-identical assets; stale output is removed', t => {
  const { root } = fixture(t);
  assert.deepEqual(run(root), { modules: 1, assets: 1, mode: 'prepare' });
  writeFileSync(join(root, 'public/sample/old.png'), 'stale');
  assert.throws(() => run(root, 'check'), /asset list differs/);
  run(root);
  assert.equal(readFileSync(join(root, 'public/sample/sprite.png')).toString('hex'), '0001ff');
  assert.equal(run(root, 'check').assets, 1);
});

test('verification reports corrupted output without changing it', t => {
  const { root } = fixture(t);
  run(root);
  const output = join(root, 'public/sample/sprite.png');
  writeFileSync(output, 'bad');
  assert.throws(() => run(root, 'check'), /asset differs/);
  assert.equal(readFileSync(output, 'utf8'), 'bad');
});

test('missing private submodules fail before existing public assets are changed', t => {
  const { root, source } = fixture(t);
  run(root);
  rmSync(join(source, '.git'), { recursive: true });
  assert.throws(() => run(root), /Initialize private game submodules/);
  assert.equal(readFileSync(join(root, 'public/sample/sprite.png')).toString('hex'), '0001ff');
});

test('wrong account and escaping destinations are rejected', t => {
  const { root, game, save } = fixture(t);
  game.repository = 'typing-guoruncheng/sample';
  save();
  assert.throws(() => run(root), /must belong to guoruncheng-web/);
  game.repository = 'guoruncheng-web/sample';
  game.assets = '../outside';
  save();
  assert.throws(() => run(root), /Invalid asset destination/);
});

test('checkout revision changes require an explicit lock update', t => {
  const { root, source, git } = fixture(t);
  writeFileSync(join(source, 'index.ts'), 'export const sample = false;\n');
  git('add', '.');
  git('-c', 'user.name=PWA Test', '-c', 'user.email=test@local', 'commit', '-m', 'game update');
  assert.throws(() => run(root), /revision differs from lock/);
  run(root, 'lock');
  assert.equal(JSON.parse(readFileSync(join(root, 'games.lock.json'))).games[0].revision, git('rev-parse', 'HEAD'));
  run(root);
  assert.equal(run(root, 'check').modules, 1);
});

test('dirty source cannot pass release verification or be locked', t => {
  const { root, source } = fixture(t);
  run(root);
  writeFileSync(join(source, 'index.ts'), '// pending edit\n');
  assert.throws(() => run(root, 'lock'), /Commit game changes/);
  assert.throws(() => run(root, 'check'), /Uncommitted game changes/);
});

test('asset symlinks cannot copy content from outside the game', t => {
  const { root, source } = fixture(t);
  symlinkSync(join(root, 'games.lock.json'), join(source, 'public/sample/secret.txt'));
  assert.throws(() => run(root), /must not contain symlinks/);
});

test('unknown commands and duplicate slugs fail', t => {
  const { root, lock, game, save } = fixture(t);
  assert.throws(() => run(root, 'unknown'), /Usage:/);
  lock.games.push({ ...game });
  save();
  assert.throws(() => run(root), /duplicate game slug/);
});
