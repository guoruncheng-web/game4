import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApiAccessToken, hashPassword } from '../../../src/lib/auth';
import { getSql } from '../../../src/lib/db';
import { RoomDirectory } from '../../../server/thirteen/server/room-directory';
import { createThirteenMatchStore } from '../../../server/thirteen-match-store.mjs';

const baseUrl = process.env.GAME4_TEST_ORIGIN ?? 'http://127.0.0.1:3220';
const sql = getSql();
const stamp = Date.now();
const startingRoomNumber = Number(String(stamp).slice(-9));
const roomId = `THIRTEEN-${startingRoomNumber}`;
const password = `P0-${stamp}-safe`;
const createdUserIds: number[] = [];
let matchDatabaseId: number | null = null;
let supportRequestId: number | null = null;

const users = [] as Array<{
  id: number; uid: number; username: string; tokenVersion: number;
}>;
for (let seat = 0; seat < 4; seat += 1) {
  const rows = await sql`
    insert into users (uid, username, password_hash, avatar)
    select candidate, ${`thirteen-p0-${stamp}-${seat}`}, ${hashPassword(password)}, '🧪'
    from generate_series(800000, 899999) candidate
    where not exists (select 1 from users where uid = candidate)
    order by candidate desc limit 1
    returning id, uid, username, token_version
  `;
  const user = {
    id: Number(rows[0].id), uid: Number(rows[0].uid),
    username: String(rows[0].username), tokenVersion: Number(rows[0].token_version),
  };
  users.push(user);
  createdUserIds.push(user.id);
}

const headers = {
  'content-type': 'application/json',
  'x-game-uid': String(users[0].uid),
  authorization: `Bearer ${createApiAccessToken(users[0].id, users[0].uid, users[0].tokenVersion)}`,
};

try {
  let clock = 1_000_000;
  const emptyDirectory = new RoomDirectory(() => 0x5eed1234, () => clock);
  const directory = RoomDirectory.restore({
    ...emptyDirectory.snapshot(), nextRoomNumber: startingRoomNumber,
  }, () => 0x5eed1234, () => clock, { disconnectAll: false });
  for (const user of users) {
    directory.registerPlayer({
      userId: String(user.id), publicId: String(user.uid),
      displayName: user.username, avatar: '🧪',
    });
  }
  const created = directory.createPrivate(String(users[0].id));
  for (const user of users.slice(1)) directory.joinPrivate(String(user.id), created.room.code!);
  for (const user of users) directory.setReady(String(user.id), true);
  for (let guard = 0; directory.snapshotFor(String(users[0].id)).winner === null && guard < 200; guard += 1) {
    clock += 20_000;
    directory.tick(clock);
  }
  const audits = directory.completedMatchAudits();
  assert.equal(audits.length, 1);
  const store = createThirteenMatchStore(sql);
  await store.persistCompletedMatches(audits);
  await store.persistCompletedMatches(audits);

  const actualArchived = await sql`
    select id, deal_commitment, seed_reveal, deal_nonce_reveal, result, actions
    from thirteen_matches where room_id = ${roomId}
  `;
  const auditRoomId = audits[0].roomId;
  assert.equal(auditRoomId, roomId);
  assert.equal(actualArchived.length, 1);
  matchDatabaseId = Number(actualArchived[0].id);
  const canonical = `thirteen-deal-v1\n${auditRoomId}\n1\n${Number(actualArchived[0].seed_reveal)}\n${actualArchived[0].deal_nonce_reveal}`;
  assert.equal(createHash('sha256').update(canonical).digest('hex'), actualArchived[0].deal_commitment);
  const archivedJson = JSON.stringify({ result: actualArchived[0].result, actions: actualArchived[0].actions });
  for (const user of users) assert.equal(archivedJson.includes(`\"${user.id}\"`), false);

  const versionResponse = await fetch(`${baseUrl}/api/games/thirteen/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  assert.equal(version.economyMode, 'free-v1');
  assert.equal(version.currency, 'diamond');
  assert.equal(version.capabilities.matchHistory, true);

  const historyResponse = await fetch(`${baseUrl}/api/games/thirteen/history`, { headers });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.matches.length, 1);
  assert.equal(history.matches[0].roomId, auditRoomId);
  assert.match(history.matches[0].appealCode, /^T13-[0-9A-Z]{8}$/);
  assert.equal(createHash('sha256').update(history.matches[0].fairness.canonicalInput).digest('hex'),
    history.matches[0].fairness.commitment);
  assert.equal(JSON.stringify(history).includes(`\"id\":${users[0].id}`), false);

  const supportResponse = await fetch(`${baseUrl}/api/support`, {
    method: 'POST', headers,
    body: JSON.stringify({
      category: 'fairness', message: '请复核这一局发牌。',
      diagnostic: {
        appealCode: history.matches[0].appealCode,
        roomId: auditRoomId,
        accessToken: 'must-not-be-stored',
      },
    }),
  });
  assert.equal(supportResponse.status, 201);
  const support = await supportResponse.json();
  supportRequestId = Number(support.request.id);
  const storedSupport = await sql`select diagnostic from support_requests where id = ${supportRequestId}`;
  assert.equal(storedSupport[0].diagnostic.accessToken, undefined);
  assert.equal(storedSupport[0].diagnostic.roomId, auditRoomId);

  const exportResponse = await fetch(`${baseUrl}/api/account/export`, { headers });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-disposition') ?? '', /attachment/);
  const exported = await exportResponse.json();
  assert.equal(exported.account.uid, users[0].uid);
  assert.equal(exported.thirteenMatches.length, 1);
  assert.equal(JSON.stringify(exported).includes('password_hash'), false);

  const wrongDelete = await fetch(`${baseUrl}/api/account`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ password: 'wrong', confirmation: `DELETE ${users[0].uid}` }),
  });
  assert.equal(wrongDelete.status, 403);
  const deleteResponse = await fetch(`${baseUrl}/api/account`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ password, confirmation: `DELETE ${users[0].uid}` }),
  });
  assert.equal(deleteResponse.status, 200);
  createdUserIds.shift();
  const anonymized = await sql`
    select user_id, public_uid, display_name, avatar
    from thirteen_match_players where match_id = ${matchDatabaseId} and seat = 0
  `;
  assert.deepEqual(anonymized[0], {
    user_id: null, public_uid: null, display_name: '已注销玩家', avatar: '',
  });
  const retainedSupport = await sql`select user_id from support_requests where id = ${supportRequestId}`;
  assert.equal(retainedSupport[0].user_id, null);

  console.log(JSON.stringify({
    accepted: true,
    archivedMatches: 1,
    archiveIdempotent: true,
    commitmentVerified: true,
    internalIdsHidden: true,
    historyStatus: 200,
    supportStatus: 201,
    exportStatus: 200,
    deletionStatus: 200,
    deletionAnonymizedHistory: true,
  }));
} finally {
  if (matchDatabaseId !== null) await sql`delete from thirteen_matches where id = ${matchDatabaseId}`;
  if (supportRequestId !== null) await sql`delete from support_requests where id = ${supportRequestId}`;
  if (createdUserIds.length > 0) await sql`delete from users where id in ${sql(createdUserIds)}`;
  await sql.end();
}
