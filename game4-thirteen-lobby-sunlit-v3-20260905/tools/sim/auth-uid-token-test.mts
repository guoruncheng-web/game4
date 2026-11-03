import assert from 'node:assert/strict';

process.env.AUTH_SECRET ??= 'test-only-auth-secret-at-least-32-characters';

const {
  createApiAccessToken, createSessionToken, generateUid, readApiAccessToken, readSessionToken,
} = await import('../../src/lib/auth');
const { withGameCredentials } = await import('../../src/lib/api-contract');

for (let index = 0; index < 2_000; index += 1) {
  const uid = generateUid();
  assert.match(String(uid), /^\d{6}$/);
}

const token = createApiAccessToken(42, 654321, 7);
assert.deepEqual(
  readApiAccessToken(token),
  { userId: 42, uid: 654321, tokenVersion: 7, expiresAt: readApiAccessToken(token)?.expiresAt },
);
assert.equal(readSessionToken(token), null, 'API token must not work as a session cookie');
assert.equal(readApiAccessToken(createSessionToken(42, 7)), null, 'session cookie must not work as an API token');
assert.equal(readApiAccessToken(`${token.slice(0, -1)}x`), null, 'tampered token must be rejected');

const originalDateNow = Date.now;
Object.defineProperty(Date, 'now', { value: () => originalDateNow() + 3 * 60 * 60 * 1_000 });
assert.equal(readApiAccessToken(token), null, 'expired API token must be rejected');
Object.defineProperty(Date, 'now', { value: originalDateNow });

const linked = withGameCredentials('/thirteen?locale=zh-CN#table', { uid: 654321, token });
const linkedUrl = new URL(linked, 'https://example.test');
assert.equal(linkedUrl.searchParams.get('uid'), '654321');
assert.equal(linkedUrl.searchParams.get('token'), token);
assert.equal(linkedUrl.searchParams.get('locale'), 'zh-CN');
assert.equal(linkedUrl.hash, '#table');

console.log(JSON.stringify({
  feature: 'six-digit UID and scoped API/game token contract',
  uidSamples: 2_000,
  tokenPrefix: token.split('.')[0],
  accepted: true,
}, null, 2));
