import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerifiedAdmin } from '../lib/sessionResolution';

test('a verified restricted admin retains only server permissions', async () => {
  const me = { uid: 'support', email: '', roles: ['support'], permissions: ['support.read'], legacy: false };
  assert.deepEqual(await resolveVerifiedAdmin(async () => me, 'fixture@example.test'), {
    ...me, email: 'fixture@example.test', degraded: false,
  });
});
test('permission denial cannot admit an administrator', async () => {
  assert.equal(await resolveVerifiedAdmin(async () => { throw { kind: 'permission' }; }, null), null);
});
for (const kind of ['unavailable', 'missing-function', 'network', 'internal']) {
  test(`${kind} preserves a retryable error and grants no fallback session`, async () => {
    const error = { kind, message: 'Fixture transport failure' };
    await assert.rejects(resolveVerifiedAdmin(async () => { throw error; }, null), e => e === error);
  });
}
