import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYLIST_MAX, playlistWindow, playlistMove, shouldRefresh} from '../playlist.js';
const card = (vid, dead=false) => ({song:{vid,dead}});
test('playlist starts at the chosen card and skips dead or duplicate upcoming videos',()=>{
  const cards=[card('a'),card('b'),card('c',true),card('d'),card('b'),card('e')];
  assert.deepEqual(playlistWindow(cards,1,vid=>vid==='d'),['b','e']);
  assert.deepEqual(playlistWindow(cards,0),['a','b','d','e']);
});
test('playlist window is bounded',()=>{
  const cards=Array.from({length:40},(_,i)=>card('v'+i));
  assert.equal(playlistWindow(cards,3).length,PLAYLIST_MAX);assert.equal(playlistWindow(cards,3)[0],'v3');
});
test('only forward moves inside the loaded playlist sync the UI',()=>{
  const ids=['a','b','c'];
  assert.equal(playlistMove(ids,'b','a'),1);assert.equal(playlistMove(ids,'c','a'),2);
  assert.equal(playlistMove(ids,'a','a'),-1);assert.equal(playlistMove(ids,'a','b'),-1);
  assert.equal(playlistMove(ids,'zzz','a'),-1);assert.equal(playlistMove(null,'b','a'),-1);
});
test('queue refreshes at a song boundary only when more cards are waiting',()=>{
  const ids=Array.from({length:12},(_,i)=>'v'+i);
  assert.equal(shouldRefresh(ids,7,10,false),true);
  assert.equal(shouldRefresh(ids,2,10,false),false);
  assert.equal(shouldRefresh(ids,7,4,false),false);
  assert.equal(shouldRefresh(ids,7,10,true),false,'hidden: keep the running chain');
  assert.equal(shouldRefresh(ids,11,3,true),true,'hidden: refresh only once the chain is on its last song');
});
