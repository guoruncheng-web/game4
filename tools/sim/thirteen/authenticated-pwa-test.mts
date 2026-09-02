import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createSessionToken, hashPassword } from '../../../src/lib/auth';

const args = process.argv.slice(2).filter((value) => value !== '--');
const url = args[0] || 'http://127.0.0.1:3220/thirteen';
const screenshot = args[1];
const resultPath = args[2];
const onlineScreenshot = args[3];
assert.ok(screenshot && resultPath, 'screenshot_and_result_paths_required');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL_required');

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? 'require' : false,
  max: 2,
});
const username = `test-thirteen-pwa-${Date.now()}`;
const users = await sql`
  insert into users (uid, username, password_hash, avatar, last_login_at)
  select candidate, ${username}, ${hashPassword('Testpass123')}, '🧪', now()
  from generate_series(900000, 999999) candidate
  where not exists (select 1 from users where uid = candidate)
  order by candidate desc limit 1
  returning id, uid, token_version
`;
const userId = Number(users[0]?.id);
const uid = Number(users[0]?.uid);
assert.ok(Number.isSafeInteger(userId) && /^\d{6}$/.test(String(uid)));
const avatarBytes = await readFile('public/icons/icon-192.png');
await sql.begin(async (tx) => {
  await tx`
    insert into user_avatars (user_id, mime, bytes, width, height, updated_at)
    values (${userId}, 'image/png', ${avatarBytes}, 192, 192, now())
  `;
  await tx`update users set avatar_version = 1 where id = ${userId}`;
});

try {
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [
      'tools/sim/thirteen/pwa-offline-test.mjs', url, screenshot, resultPath,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        THIRTEEN_PWA_SESSION_COOKIE: createSessionToken(userId, Number(users[0].token_version)),
        ...(onlineScreenshot ? { THIRTEEN_PWA_ONLINE_SCREENSHOT: onlineScreenshot } : {}),
      },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  assert.equal(exitCode, 0, 'authenticated_pwa_child_failed');
  const report = JSON.parse(await readFile(resultPath, 'utf8'));
  assert.equal(report.accepted, true);
  assert.equal(report.online.accountIdentity.playerName, username);
  assert.equal(report.online.accountIdentity.avatarSource, `/api/avatar/${uid}?v=1`);
  assert.equal(report.online.accountIdentity.runtimeAvatarFrame, true);
  assert.ok(report.online.accountIdentity.textureWidth > 0);
  assert.equal(report.online.accountRooms.selfName, username);
  assert.equal(report.online.accountRooms.selfAvatar, `/api/avatar/${uid}?v=1`);
  assert.equal(report.online.accountRooms.privateEntry.roomCode, '');
  assert.equal(report.online.accountRooms.privateEntry.seatNames[0], username);
  assert.equal(report.online.accountRooms.privateRoom.roomCode, 'A1B 2C3');
  assert.deepEqual(report.online.accountRooms.privateRoom.seatNames.slice(0, 2), [username, '真实对手']);
  assert.equal(report.online.accountRooms.privateRoom.avatarSources[0], `/api/avatar/${uid}?v=1`);
  assert.equal(report.online.accountRooms.quickQueue.roomCode, '');
  assert.deepEqual(report.online.accountRooms.quickQueue.seatNames.slice(0, 2), [username, '玩家已匹配']);
  assert.deepEqual(report.online.authenticatedEconomy.wallet, {
    diamonds: 9_990, chips: 11_000, reserved: 0, totalChips: 11_000,
  });
  assert.deepEqual(report.online.authenticatedEconomy.bridge, {
    diamonds: 9_990, chips: 11_000, reserved: 0, totalChips: 11_000,
  });
  const wallet = await sql`
    select p.diamonds_available, g.balance, g.reserved
    from platform_wallets p
    join game_wallets g on g.user_id = p.user_id and g.game_slug = 'thirteen'
    where p.user_id = ${userId}
  `;
  assert.deepEqual(wallet.map((row) => [
    Number(row.diamonds_available), Number(row.balance), Number(row.reserved),
  ]), [[9_990, 11_000, 0]]);
  const transactionKinds = await sql`
    select kind from wallet_transactions where user_id = ${userId} order by id
  `;
  assert.deepEqual(transactionKinds.map((row) => row.kind), [
    'grant', 'grant', 'exchange_debit', 'exchange_credit',
  ]);
  console.log(JSON.stringify({
    feature: 'authenticated Thirteen PWA wallet bridge',
    uidIsSixDigits: /^\d{6}$/.test(String(uid)),
    iframeCredentials: true,
    accountIdentity: { displayName: username, avatarUrl: `/api/avatar/${uid}?v=1`, rendered: true },
    initialGrant: { diamonds: 10_000, chips: 10_000 },
    exchange: { spentDiamonds: 10, receivedChips: 1_000 },
    databaseWallet: { diamonds: 9_990, chips: 11_000, reserved: 0 },
    cocosToPwaWalletEvent: true,
    accepted: true,
  }, null, 2));
} finally {
  // The browser process is gone when the child exits, but a request already accepted by
  // Next can still be completing on the server. Let those handlers drain before deleting
  // the temporary user so teardown cannot race wallet foreign-key writes.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  await sql`delete from users where id = ${userId}`;
  await sql.end({ timeout: 2 });
}
