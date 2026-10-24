import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionDiscoveries, trackKey} from '../session.js';
function store() { const data=new Map(); return {get:(k,d)=>data.has(k)?structuredClone(data.get(k)):d,set:(k,v)=>data.set(k,structuredClone(v))}; }
const song={releaseId:10,masterId:100,vid:'aaaaaaaaaaa',trackTitle:'One',position:'A1',conf:'high'};
function setup(request=async()=>({}),storage=store(),user='test') {return new SessionDiscoveries(user,storage,request);}

test('like writes immediately, persists track and removes its record on unlike',async()=>{
  const calls=[],storage=store(),m=setup(async(...args)=>calls.push(args),storage); await m.refresh(async()=>[]);
  await m.toggle(song); assert.equal(calls[0][0],'PUT');assert.match(calls[0][1],/wants\/10$/);assert.equal(m.session.items.length,1);
  const restored=setup(undefined,storage);assert.equal(restored.session.items.length,1);assert.equal(restored.has(song),true);
  await m.toggle(song);assert.equal(calls[1][0],'DELETE');assert.equal(m.session.items.length,0);assert.equal(m.has(song),false);
});
test('reset clears only local discoveries and keeps remote wants',async()=>{
  const calls=[],m=setup(async(...args)=>calls.push(args));await m.refresh(async()=>[]);await m.toggle(song);m.reset();
  assert.equal(m.session.items.length,0);assert.equal(m.has(song),true);assert.equal(calls.length,1);
});
test('sessions and cached remote wants are isolated by account',async()=>{
  const storage=store(),a=setup(undefined,storage,'alice');await a.refresh(async()=>[]);await a.toggle(song);
  const b=setup(undefined,storage,'bob');assert.equal(b.session.items.length,0);assert.equal(b.has(song),false);
});
test('failed add does not create a session entry or optimistic wanted state',async()=>{
  const m=setup(async()=>{throw Error('offline');});await m.refresh(async()=>[]);await m.toggle(song);
  assert.equal(m.has(song),false);assert.equal(m.session.items.length,0);assert.match(m.error,/Nothing changed/);assert.equal(m.pending.size,0);
});
test('failed removal retains discoveries and wanted state',async()=>{
  let fail=false;const m=setup(async()=>{if(fail)throw Error('offline');});await m.refresh(async()=>[]);await m.toggle(song);fail=true;await m.toggle(song);
  assert.equal(m.has(song),true);assert.equal(m.session.items.length,1);assert.equal(m.pending.size,0);
});
test('a failed concurrent write cannot overwrite an independent successful write',async()=>{
  const pending=new Map();const m=setup((method,path)=>new Promise((resolve,reject)=>pending.set(path,{resolve,reject})));await m.refresh(async()=>[]);
  const a=m.toggle(song),other={...song,releaseId:20,masterId:200,vid:'bbbbbbbbbbb'},b=m.toggle(other);
  pending.get('/users/test/wants/20').resolve({});await b;pending.get('/users/test/wants/10').reject(Error('offline'));await a;
  assert.equal(m.has(other),true);assert.equal(m.has(song),false);assert.deepEqual(m.session.items.map(s=>s.releaseId),[20]);
});
test('same master mutations are guarded, including alternate pressings',async()=>{
  let resolve;const calls=[];const m=setup((...args)=>{calls.push(args);return new Promise(r=>resolve=r);});await m.refresh(async()=>[]);
  const first=m.toggle(song);assert.equal(await m.toggle({...song,releaseId:11}),false);assert.equal(m.reset(),false);resolve({});await first;assert.equal(calls.length,1);
});
test('removal targets the actual wanted pressing and removes all linked session tracks only',async()=>{
  const calls=[],m=setup(async(...args)=>calls.push(args));await m.refresh(async()=>[{id:11,masterId:100},{id:12,masterId:100}]);
  m.session.items=[{...song,wantedReleaseId:11},{...song,vid:'bbbbbbbbbbb',position:'B1',wantedReleaseId:11},{...song,releaseId:12,wantedReleaseId:12}];
  await m.toggle(m.session.items[0]);assert.match(calls[0][1],/wants\/11$/);assert.equal(m.session.items.length,1);assert.equal(m.wanted.has(12),true);
});
test('successful refresh reconciles externally removed records, failed refresh preserves them',async()=>{
  const m=setup();await m.refresh(async()=>[]);await m.toggle(song);await m.refresh(async()=>{throw Error('offline');});
  assert.equal(m.session.items.length,1);assert.equal(m.health,'unknown');assert.equal(await m.toggle(song),false);
  await m.refresh(async()=>[]);assert.equal(m.session.items.length,0);assert.equal(m.health,'ready');
});
test('snapshot refresh cannot undo a write that completes while it loads',async()=>{
  let finishAdd,finishRead;const m=setup(()=>new Promise(r=>finishAdd=r));await m.refresh(async()=>[]);
  const add=m.toggle(song),refresh=m.refresh(()=>new Promise(r=>finishRead=r));finishAdd({});await add;finishRead([]);await refresh;
  assert.equal(m.has(song),true);assert.equal(m.session.items.length,1);
});
test('pre-existing wants are not copied into this session',async()=>{
  const m=setup();await m.refresh(async()=>[{id:10,masterId:100}]);assert.equal(m.has(song),true);assert.equal(m.session.items.length,0);
});
test('track keys distinguish unmatched videos and confident track positions',()=>{
  assert.notEqual(trackKey(song),trackKey({...song,position:'B1'}));assert.notEqual(trackKey({...song,conf:'none'}),trackKey({...song,conf:'none',vid:'bbbbbbbbbbb'}));
});
test('browser storage failure is surfaced without undoing a successful remote add',async()=>{
  const m=setup(undefined,{get:(k,d)=>d,set:()=>false});await m.refresh(async()=>[]);await m.toggle(song);
  assert.equal(m.has(song),true);assert.equal(m.session.items.length,1);assert.match(m.error,/couldn’t save the session/);
});
test('malformed cached wantlist data is discarded safely',()=>{
  const m=setup(undefined,{get:(k,d)=>k.startsWith('crate_wants')?{broken:true}:d,set:()=>true});
  assert.equal(m.wanted.size,0);assert.equal(m.health,'unknown');
});
