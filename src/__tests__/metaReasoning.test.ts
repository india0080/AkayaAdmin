import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PROVIDER_FORM, upsertPayload, usesMetaReasoning } from '../features/ai/providerPresets';

test('Meta reasoning survives an edit and activation toggle; automatic clears the override', () => {
  const meta={...EMPTY_PROVIDER_FORM,baseUrl:'https://api.meta.ai/v1',model:'muse-spark-1.3',reasoningEffort:'high'};
  assert.equal(usesMetaReasoning(meta),true);
  assert.equal(upsertPayload(meta,'meta-chat').reasoningEffort,'high');
  assert.equal(upsertPayload({...meta,isActive:true},'meta-chat').reasoningEffort,'high');
  assert.equal(upsertPayload({...meta,reasoningEffort:'auto'},'meta-chat').reasoningEffort,'auto');
  assert.equal(upsertPayload({...meta,reasoningEffort:undefined},'meta-chat').reasoningEffort,'auto');
  assert.equal(upsertPayload({...meta,category:'stt'},'meta-stt').reasoningEffort,undefined);
  assert.equal(upsertPayload({...meta,baseUrl:'https://api.openai.com/v1'},'custom').reasoningEffort,undefined);
});
