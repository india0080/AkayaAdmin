import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkFlagPatch, flagExport, formatPreview } from '../features/config/matrixLogic';
import type { FlagDef, TargetState } from '../features/config/logic';
const flags: FlagDef[] = [{ key: 'voice', label: 'Voice', domain: 'AI', description: '', defaultWhenAbsent: true, readBy: 'app' }];
test('matrix export excludes unregistered keys and respects absent defaults', () => {
  const state: TargetState = { target: 'flags', version: 4, updatedAt: null, updatedByEmail: 'private@example.test', snapshot: { secretKey: 'never-export', voice: null } };
  const result = flagExport(flags, state);
  assert.deepEqual(result.flags, [{ key: 'voice', override: null, effective: true }]);
  assert.ok(!JSON.stringify(result).includes('never-export'));
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  assert.equal(flagExport(flags, { ...state, snapshot: { voice: false } }).flags[0].effective, false);
  assert.equal(flagExport(flags, { ...state, snapshot: { voice: 'malformed' } }).flags[0].override, null);
});
test('localization preview uses selected timezone at date boundary', () => {
  const date = new Date('2026-10-09T20:00:00Z');
  assert.equal(formatPreview(date, 'UTC', 'YYYY-MM-DD'), '2026-10-09');
  assert.equal(formatPreview(date, 'Asia/Kolkata', 'DD/MM/YYYY'), '10/10/2026');
  assert.equal(formatPreview(date, 'Asia/Kolkata', 'MM/DD/YYYY'), '10/10/2026');
  assert.throws(() => formatPreview(date, 'invalid/timezone', 'YYYY-MM-DD'));
});
test('bulk flags preserve matching compiled defaults and exclude unknown keys', () => {
  assert.deepEqual(bulkFlagPatch(flags, { secret: false }, true), {});
  assert.deepEqual(bulkFlagPatch(flags, { secret: false }, false), { voice: false });
  assert.deepEqual(bulkFlagPatch(flags, { voice: false, unknown: true }, true), { voice: true });
});
