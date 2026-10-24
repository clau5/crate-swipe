import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogueClient} from '../catalogue-client.js';
function client(handler=async()=>({})) {
  const calls=[];return {calls,count:0,async get(path,priority){calls.push(['GET',path,priority]);return handler('GET',path);},async req(method,path,priority){calls.push([method,path,priority]);return handler(method,path);}};
}
test('guest catalogue accepts public search/releases and rejects account reads and arbitrary paths',async()=>{
  const api=client(),guest=new CatalogueClient('fake',{client:api});
  await guest.get('/database/search?type=release&format=Vinyl');await guest.get('/releases/10');
  for(const path of ['/users/shared/wants','/oauth/identity','https://example.com','/releases/10?user=other'])await assert.rejects(guest.get(path));
  assert.equal(api.calls.length,2);
});
test('shared copies derive the owner once, coalesce duplicates and only PUT',async()=>{
  const api=client(async(method,path)=>path==='/oauth/identity'?{username:'shared account'}:{}),guest=new CatalogueClient('fake',{client:api});
  await Promise.all([guest.addShared(10),guest.addShared(10)]);await guest.addShared(20);await guest.addShared(10);
  assert.deepEqual(api.calls.map(c=>c.slice(0,2)),[['GET','/oauth/identity'],['PUT','/users/shared%20account/wants/10'],['PUT','/users/shared%20account/wants/20']]);
  for(const id of [0,-1,'10',NaN])await assert.rejects(guest.addShared(id));
});
test('failed shared copies can retry without discarding a successful owner lookup',async()=>{
  let fail=true;const api=client(async(method,path)=>{if(path==='/oauth/identity')return {username:'shared'};if(fail)throw Error('offline');return {};});
  const guest=new CatalogueClient('fake',{client:api});await assert.rejects(guest.addShared(10));fail=false;await guest.addShared(10);
  assert.equal(api.calls.filter(c=>c[0]==='PUT').length,2);assert.equal(api.calls.filter(c=>c[1]==='/oauth/identity').length,1);
});
test('failed owner discovery is retryable and never sends a write to an unknown account',async()=>{
  let valid=false;const api=client(async()=>valid?{username:'shared'}:{}),guest=new CatalogueClient('fake',{client:api});
  await assert.rejects(guest.addShared(10));assert.equal(api.calls.length,1);valid=true;await guest.addShared(10);assert.equal(api.calls.at(-1)[1],'/users/shared/wants/10');
});
test('guest dry-run retains the existing no-write guarantee',async()=>{
  const guest=new CatalogueClient('fake',{dryRun:true});guest.owner=Promise.resolve('shared');
  await guest.addShared(10);assert.deepEqual(guest.api.dryLog,['PUT /users/shared/wants/10']);assert.equal(guest.api.count,0);
});
