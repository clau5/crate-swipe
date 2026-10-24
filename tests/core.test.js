import test from 'node:test';
import assert from 'node:assert/strict';
import {matchTrack, chooseNext, Explorer, releaseToSongs, Discogs} from '../core.js';
test('a confidently matched linked video retains track/release metadata',()=>{
  const rel={id:7,master_id:70,title:'Record',artists:[{name:'Example'}],tracklist:[{title:'Night drive',position:'A1',duration:'4:00'}],videos:[{title:'Example - Night drive',uri:'https://youtu.be/aaaaaaaaaaa',duration:240}]};
  assert.equal(matchTrack(rel.videos[0],rel).conf,'high');const songs=releaseToSongs(rel,null,{seenVid:new Set(),seenKey:new Set(),stats:{}});assert.equal(songs[0].releaseId,7);assert.equal(songs[0].trackTitle,'Night drive');
});
test('feed never immediately repeats the same master',()=>{
  const last={releaseId:1,masterId:10,artist:'A'},pool=[{releaseId:2,masterId:10,artist:'B'},{releaseId:3,masterId:11,artist:'C'}];
  assert.equal(chooseNext(pool,[last],{gap:15,ahead:0,rnd:()=>0}),1);
});
test('explorer builds vinyl searches with bounded year and filter parameters',()=>{
  const ex=new Explorer({}, {genre:'Electronic',style:'Minimal Techno',label:'Morris / Audio',country:'Switzerland'});const u=new URL(ex.qs(2001,2),'https://api.discogs.com');
  assert.equal(u.searchParams.get('format'),'Vinyl');assert.equal(u.searchParams.get('year'),'2001');assert.equal(u.searchParams.get('style'),'Minimal Techno');assert.equal(u.searchParams.get('page'),'2');
});
test('dry-run writes never invoke fetch',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('should not fetch');};
  try {const api=new Discogs('not-a-key',{dryRun:true});await api.req('PUT','/users/test/wants/1');await api.req('DELETE','/users/test/wants/1');assert.equal(api.dryLog.length,2);assert.equal(api.count,0);} finally{globalThis.fetch=original;}
});
