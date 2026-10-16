import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft,parseDraft,buildDiff} from '../features/pricing/draft';
import {flatOf,compiledRegistry} from '../features/pricing/registry';
import {buildPublishPlan} from '../features/pricing/publish';
test('tier assignment survives draft reload and goes through versioned policy publication',()=>{const d=emptyDraft();d.policy={'tier.IN':'low'};const restored=parseDraft(JSON.stringify(d));assert.equal(restored.policy['tier.IN'],'low');assert.equal(flatOf({'tier.IN':'low','tier.US':'bogus'})['tier.US'],undefined);const diff=buildDiff({baseRows:new Map(),basePolicy:{},draft:restored,registry:compiledRegistry()});assert.equal(diff.errors.length,0);assert.equal(buildPublishPlan(diff)[0].target,'pricingPolicy');assert.equal(buildPublishPlan(diff)[0].patch['tier.IN'],'low');});
