import { test } from "node:test"; import assert from "node:assert/strict";
import { chooseVoice, toggleIdentity, type SpeechVoice } from "../features/voice/speechLogic";
const v: SpeechVoice={provider:"p",model:"m",voice:"v",name:"v",languages:[],gender:null,streaming:"unknown",evidence:"provider",enabled:true,userSelectable:false};
test("default and fallback changes retain existing chain and exact voice identity",()=>{
  const old=[{provider:"q",model:"n",voice:"a"},{provider:"q",model:"n",voice:"b"}];
  assert.deepEqual(chooseVoice(old,v,"default"),[{provider:"p",model:"m",voice:"v"},...old]);
  assert.deepEqual(chooseVoice(old,v,"fallback"),[old[0],{provider:"p",model:"m",voice:"v"},old[1]]);
  assert.throws(()=>chooseVoice([],v,"fallback"));
});
test("disable/selectable controls retain the catalog and never duplicate identities",()=>{
  assert.deepEqual(toggleIdentity(["x"],"x",true),["x"]);assert.deepEqual(toggleIdentity(["x","y"],"x",false),["y"]);
});
