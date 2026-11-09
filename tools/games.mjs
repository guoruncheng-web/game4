import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const owner = 'guoruncheng-web';
const shaPattern = /^[a-f0-9]{40}$/;

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function files(directory) {
  const result = [];
  if (!existsSync(directory)) throw new Error(`Missing game assets: ${directory}`);
  function visit(current) {
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Game assets must not contain symlinks: ${current}`);
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Game assets must not contain symlinks: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(relative(directory, path));
      else throw new Error(`Unsupported game asset: ${path}`);
    }
  }
  visit(directory);
  return result.sort();
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function validateLock(root, lock, { update = false } = {}) {
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.games)) throw new Error('Invalid games.lock.json');
  const seen = new Set();
  const modules = [];
  for (const game of lock.games) {
    if (!/^[a-z][a-z0-9-]*$/.test(game.slug) || seen.has(game.slug)) throw new Error('Invalid or duplicate game slug');
    seen.add(game.slug);
    if (!new RegExp(`^${owner}/[A-Za-z0-9-]+$`).test(game.repository)) throw new Error(`Game must belong to ${owner}: ${game.slug}`);
    if (game.kind === 'cocos-release') {
      // These games already have independent Cocos repositories. Their
      // accepted release packages remain in PWA; this migration does not rebuild them.
      continue;
    }
    if (game.kind !== 'source-submodule' || game.path !== `src/games/${game.slug}`) throw new Error(`Invalid source path: ${game.slug}`);
    const source = resolve(root, game.path);
    if (!source.startsWith(resolve(root) + sep)) throw new Error('Game path escapes PWA root');
    const gitEntry = join(source, '.git');
    if (!existsSync(gitEntry)) throw new Error(`Initialize private game submodules first: git submodule update --init --recursive (${game.slug})`);
    const configuredUrl = git(root, 'config', '-f', '.gitmodules', '--get', `submodule.${game.slug}.url`);
    if (configuredUrl !== `https://github.com/${game.repository}.git`) throw new Error(`Unexpected submodule repository: ${game.slug}`);
    const head = git(source, 'rev-parse', 'HEAD');
    if (!shaPattern.test(head)) throw new Error(`Invalid game revision: ${game.slug}`);
    if (update) game.revision = head;
    if (!shaPattern.test(game.revision) || head !== game.revision) throw new Error(`Game revision differs from lock: ${game.slug}. Commit the game, then run pnpm games:lock.`);
    const hasPublic = game.assets === `public/${game.slug}`;
    if (game.assets !== null && !hasPublic) throw new Error(`Invalid asset destination: ${game.slug}`);
    const assets = hasPublic ? join(source, game.assets) : null;
    const assetFiles = assets ? files(assets) : [];
    if (assets && assetFiles.length === 0) throw new Error(`Empty game assets: ${game.slug}`);
    modules.push({ game, source, assets, assetFiles });
  }
  return modules;
}

export function run(root, mode = 'prepare') {
  if (!['prepare', 'check', 'lock'].includes(mode)) throw new Error('Usage: node tools/games.mjs [prepare|check|lock]');
  const lockPath = join(root, 'games.lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  // Validate every source and destination before changing any generated files.
  const modules = validateLock(root, lock, { update: mode === 'lock' });
  if (mode === 'lock') {
    for (const { source, game } of modules) {
      if (git(source, 'status', '--porcelain', '--untracked-files=normal')) throw new Error(`Commit game changes before locking: ${game.slug}`);
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    return { modules: modules.length, assets: 0, mode };
  }
  let total = 0;
  for (const { game, source, assets, assetFiles } of modules) {
    if (mode === 'check' && git(source, 'status', '--porcelain', '--untracked-files=normal')) throw new Error(`Uncommitted game changes: ${game.slug}`);
    if (!assets) continue;
    const destination = join(root, game.assets);
    if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) throw new Error(`Asset destination must not be a symlink: ${destination}`);
    if (mode === 'prepare') {
      rmSync(destination, { recursive: true, force: true });
      cpSync(assets, destination, { recursive: true, errorOnExist: true });
    }
    const actual = files(destination);
    if (JSON.stringify(actual) !== JSON.stringify(assetFiles)) throw new Error(`Game asset list differs: ${game.slug}`);
    for (const name of assetFiles) {
      if (hash(join(assets, name)) !== hash(join(destination, name))) throw new Error(`Game asset differs: ${game.slug}/${name}`);
    }
    total += assetFiles.length;
  }
  return { modules: modules.length, assets: total, mode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = run(resolve(dirname(fileURLToPath(import.meta.url)), '..'), process.argv[2]);
    console.log(`PWA games: ${result.modules} independent source repositories, ${result.assets} verified assets (${result.mode}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
