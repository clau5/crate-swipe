import test from 'node:test';
import assert from 'node:assert/strict';
import {GuestDiscoveries, SessionDiscoveries, guestStatus} from '../session.js';
function store() {const data=new Map();return {get:(k,d)=>data.has(k)?structuredClone(data.get(k)):d,set:(k,v)=>{data.set(k,structuredClone(v));return true;}};}
const one={releaseId:10,masterId:100,vid:'aaaaaaaaaaa',trackTitle:'One',position:'A1',conf:'high'};
const two={...one,trackTitle:'Two',position:'B1',vid:'bbbbbbbbbbb'};
async function account(storage,user='alice',wants=[],request=async()=>({})) {
  const model=new SessionDiscoveries(user,storage,request);await model.refresh(async()=>wants);return model;
}
test('guest tracks persist locally and independently, without a shared wantlist read',async()=>{
  const storage=store(),mirrored=[],guest=new GuestDiscoveries(storage,async id=>mirrored.push(id));
  await guest.toggle(one);await guest.toggle(two);await Promise.resolve();
  assert.equal(guest.session.items.length,2);assert.deepEqual(mirrored,[10,10]);
  const restored=new GuestDiscoveries(storage);assert.equal(restored.session.id,guest.session.id);assert.equal(restored.session.items.length,2);
  const other=new GuestDiscoveries(store());assert.equal(other.session.items.length,0);
  await restored.toggle(one);assert.equal(restored.session.items.length,1);assert.equal(guestStatus(restored.session.items[0],'alice'),'local');
});
test('shared-copy failures do not lose guest finds and unlike never deletes shared wants',async()=>{
  const guest=new GuestDiscoveries(store(),async()=>{throw Error('offline');});
  await guest.toggle(one);await Promise.resolve();assert.equal(guest.has(one),true);assert.equal(guest.error,'');
  await guest.toggle(one);assert.equal(guest.session.items.length,0);
});
test('sync merges account finds, saves each record once and preserves separate tracks',async()=>{
  const storage=store(),calls=[],guest=new GuestDiscoveries(storage);
  await guest.toggle(one);await guest.toggle(two);
  const personal=await account(storage,'alice',[],async(...args)=>calls.push(args));
  personal.session.items.push({...one,releaseId:20,wantedReleaseId:20,vid:'ccccccccccc'});
  assert.equal(await guest.syncTo(personal),true);assert.equal(calls.length,1);assert.equal(calls[0][0],'PUT');
  assert.equal(personal.session.items.length,3);assert.equal(guest.session.items.length,2);
  assert.ok(guest.session.items.every(s=>guestStatus(s,'alice')==='saved'));
  await guest.syncTo(personal);assert.equal(calls.length,1);
});
test('sync reuses the actual wanted pressing and never invokes DELETE on existing wants',async()=>{
  const storage=store(),calls=[],guest=new GuestDiscoveries(storage);await guest.toggle(one);
  const personal=await account(storage,'alice',[{id:11,masterId:100}],async(...args)=>calls.push(args));
  await guest.syncTo(personal);assert.equal(calls.length,0);
  assert.equal(personal.session.items[0].wantedReleaseId,11);assert.equal(personal.wanted.has(11),true);
});
test('partial sync persists failed finds, retries only failures, and prevents duplicate jobs',async()=>{
  const storage=store(),calls=[],guest=new GuestDiscoveries(storage);await guest.toggle(one);
  const other={...one,releaseId:20,masterId:200,vid:'ccccccccccc'};await guest.toggle(other);
  let fail=true,release;const gate=new Promise(r=>release=r);
  const personal=await account(storage,'alice',[],async(method,path)=>{calls.push([method,path]);await gate;if(fail&&path.endsWith('/20'))throw Error('offline');});
  const first=guest.syncTo(personal),duplicate=guest.syncTo(personal);
  assert.equal(first,duplicate);assert.equal(guest.reset(),false);assert.equal(await guest.toggle(two),false);
  release();assert.equal(await first,false);assert.equal(guest.unsaved('alice').length,1);
  const restored=new GuestDiscoveries(storage);assert.equal(restored.unsaved('alice').length,1);
  fail=false;await restored.syncTo(personal);
  assert.equal(calls.filter(c=>c[1].endsWith('/10')).length,1);assert.equal(calls.filter(c=>c[1].endsWith('/20')).length,2);
  assert.ok(calls.every(c=>c[0]==='PUT'));
});
test('a new account gets an explicit independent sync, never the previous account targets',async()=>{
  const storage=store(),calls=[],guest=new GuestDiscoveries(storage);await guest.toggle(one);
  const alice=await account(storage,'alice',[{id:11,masterId:100}]);await guest.syncTo(alice);
  const bob=await account(storage,'bob',[],async(...args)=>calls.push(args));
  assert.equal(guest.unsaved('bob').length,1);assert.equal(bob.session.items.length,0);
  await guest.syncTo(bob);assert.match(calls[0][1],/^\/users\/bob\/wants\/10$/);
  assert.equal(bob.session.items[0].wantedReleaseId,10);assert.equal(alice.session.items[0].wantedReleaseId,11);
});
test('refresh and a new guest session do not erase unsaved finds or remote wants',async()=>{
  const storage=store(),guest=new GuestDiscoveries(storage);await guest.toggle(one);
  const personal=await account(storage);await personal.refresh(async()=>[]);assert.equal(guest.has(one),true);
  await guest.syncTo(personal);const id=guest.session.id;assert.equal(guest.reset(),true);
  assert.notEqual(guest.session.id,id);assert.equal(personal.wanted.has(10),true);
});
test('completed saves are not resurrected when retrying other finds after a personal removal',async()=>{
  const storage=store(),calls=[],guest=new GuestDiscoveries(storage);await guest.toggle(one);
  const personal=await account(storage,'alice',[],async(...args)=>calls.push(args));await guest.syncTo(personal);
  await personal.toggle(one);await guest.toggle({...one,releaseId:20,masterId:200,vid:'ccccccccccc'});
  await guest.syncTo(personal);assert.equal(calls.filter(c=>c[0]==='PUT'&&c[1].endsWith('/10')).length,1);
});
test('guest storage errors and malformed sync state remain recoverable',async()=>{
  const guest=new GuestDiscoveries({get:(k,d)=>d,set:()=>false});await guest.toggle(one);
  assert.equal(guest.has(one),true);assert.match(guest.error,/couldn’t save/);
  const storage=store();storage.set('crate_guest_session_v1',{version:1,id:'test',items:[{...one,sync:'broken'},null]});
  const restored=new GuestDiscoveries(storage);assert.equal(restored.session.items.length,1);assert.equal(guestStatus(restored.session.items[0],'alice'),'local');
});
