import test from 'node:test';
import assert from 'node:assert/strict';
import {VideoAvailability} from '../video-availability.js';
const id = 'aaaaaaaaaaa', second = 'bbbbbbbbbbb';
const response = status => new Response(JSON.stringify({type:'video'}), {status});
test('removed/private videos are rejected; rate limits, denied requests and outages remain unknown',async()=>{
  for (const status of [200,401,404,410,403,429,500]) {
    const checker = new VideoAvailability({fetcher:async()=>response(status)});
    assert.equal(await checker.check(id),status===200?true:[401,404,410].includes(status)?false:null);
  }
});
test('preflight is credential-free and only uses the official metadata endpoint',async()=>{
  const checker = new VideoAvailability({fetcher:async(url,opts)=>{
    const u=new URL(url); assert.equal(u.origin,'https://www.youtube.com');assert.equal(u.pathname,'/oembed');
    assert.equal(u.searchParams.get('url'),'https://www.youtube.com/watch?v='+id);assert.equal(opts.credentials,'omit');
    return response(200);
  }});
  assert.equal(await checker.check(id),true);
});
test('concurrent checks coalesce, persist and expire instead of rechecking on each swipe',async()=>{
  let time=1000,calls=0,saved=[];
  const storage={get:()=>saved,set:(key,value)=>{saved=value;}};
  const options={storage,now:()=>time,fetcher:async()=>{calls++;return response(200);}};
  const checker=new VideoAvailability(options);
  assert.deepEqual(await Promise.all([checker.check(id),checker.check(id)]),[true,true]);assert.equal(calls,1);
  assert.equal(await new VideoAvailability(options).check(id),true);assert.equal(calls,1);
  time+=7*3600000;assert.equal(await new VideoAvailability(options).check(id),true);assert.equal(calls,2);
});
test('transport failures never blacklist videos and briefly pause queued probes',async()=>{
  let time=1,calls=0;
  const checker=new VideoAvailability({now:()=>time,concurrency:1,fetcher:async()=>{calls++;if(calls===1)throw Error('offline');return response(200);}});
  assert.deepEqual(await Promise.all([checker.check(id),checker.check(second)]),[null,null]);assert.equal(calls,1);
  time+=31000;assert.equal(await checker.check(id),true);assert.equal(calls,2);
});
test('slow probes time out without poisoning later checks',async()=>{
  const checker=new VideoAvailability({timeout:5,fetcher:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});
  assert.equal(await checker.check(id),null);assert.equal(checker.cache.has(id),false);
});
test('playback-confirmed unavailability replaces cached positive metadata',async()=>{
  const checker=new VideoAvailability({fetcher:async()=>response(200)});
  assert.equal(await checker.check(id),true);checker.remember(id,false);assert.equal(await checker.check(id),false);
  checker.clear();assert.equal(await checker.check(id),true);
});
