// End-to-end checks against the localhost fixture only. No real credentials or remote writes.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {FakePlayer, releases, songs} from './fixture.js';
const {chromium, webkit} = createRequire(import.meta.url)('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw Error('Browser tests require localhost');
const output = process.env.BROWSER==='webkit' ? 'test-results/webkit' : 'test-results'; await mkdir(output,{recursive:true});
const options = {headless:true};
if (process.env.CHROME_PATH) options.executablePath=process.env.CHROME_PATH;
const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch(options);
const results = [], errors = [], requests = [];
const context = await browser.newContext({viewport:{width:402,height:874},reducedMotion:'reduce'});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(!request.url().startsWith(base)) requests.push(request.url());});
await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
async function open(query='fixture=1') {await page.goto(base+'/?'+query);await page.waitForFunction(()=>!!window.crateFixture?.playing.song);await page.evaluate(()=>document.fonts.ready);}
async function calls(){return page.evaluate(()=>window.crateFixture.api.calls.filter(c=>c.method!=='GET'));}
try {
  await open();
  await check('reference screen geometry and local assets',async()=>{
    assert.equal(await page.locator('#track').innerText(),'Tried and true');
    const cover=await page.locator('.card .art').first().boundingBox(),bar=await page.locator('#bar').boundingBox(),dock=await page.locator('#dock').boundingBox();
    assert.equal(cover.width,300);assert.ok(Math.abs(cover.x-52)<1);assert.ok(Math.abs(cover.y-265)<2,JSON.stringify(cover));
    assert.ok(Math.abs(bar.y-39)<1);assert.ok(Math.abs(dock.y-689)<2,JSON.stringify(dock));
    assert.equal(await page.locator('img').evaluateAll(images=>images.filter(i=>i.offsetParent!==null).every(i=>i.complete&&i.naturalWidth>0)),true);
    await page.locator('#sound').click();await page.locator('#seek').fill('840');
    await page.screenshot({path:output+'/playback-mobile.png'});
  });
  await check('heart writes immediately and records the discovery',async()=>{
    await page.locator('#heart').click();await page.waitForFunction(()=>window.crateFixture.model.session.items.length===1);
    assert.equal((await calls())[0].method,'PUT');assert.equal(await page.locator('#heart').getAttribute('aria-pressed'),'true');
    await page.locator('#sessionButton').click();await page.locator('[data-play="0"]').waitFor();
    assert.match(await page.locator('#sessionSummary').innerText(),/1 track · 1 record/);
    await page.locator('#status').waitFor({state:'hidden'});await page.screenshot({path:output+'/session-mobile.png'});
  });
  await check('session replay and auto-next leave the feed index intact',async()=>{
    await page.locator('#closeSession').click();
    await page.locator('#feed').evaluate(el=>el.scrollTop=874);await page.waitForFunction(()=>window.crateFixture.active===1);
    await page.locator('#sessionButton').click();await page.locator('[data-play="0"]').focus();await page.locator('[data-play="0"]').press('Enter');
    await page.waitForFunction(()=>window.crateFixture.playing.source==='session');
    assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-play')),true);
    assert.equal(await page.locator('#track').innerText(),'Tried and true');assert.match(await page.locator('#youtube').getAttribute('href'),/aaaaaaaaaaa/);
    await page.evaluate(()=>window.crateFixture.players.find(p=>p.getPlayerState()===1)?.emitState(0));
    assert.equal(await page.evaluate(()=>window.crateFixture.active),1);
    await page.locator('#closeSession').click();assert.equal(await page.locator('#track').innerText(),'A quiet place');
    assert.equal((await calls()).length,1);
  });
  await check('session survives reload and changed filters',async()=>{
    await page.reload();await page.waitForFunction(()=>!!window.crateFixture);await page.locator('#sessionButton').click();assert.equal(await page.locator('[data-play]').count(),1);
    await page.locator('#closeSession').click();await page.locator('#chip').click();await page.locator('#style').fill('House');await page.locator('#goBtn').click();
    await page.locator('#sessionButton').click();assert.equal(await page.locator('[data-play]').count(),1);await page.locator('#closeSession').click();
  });
  await check('release replay updates the playing identity and YouTube link',async()=>{
    await page.locator('.release-meta').first().click();await page.locator('[data-track="1"]').click();
    assert.equal(await page.locator('#track').innerText(),'Second thoughts');assert.match(await page.locator('#youtube').getAttribute('href'),/eeeeeeeeeee/);
    await page.locator('#seek').fill('500');await page.waitForFunction(()=>window.crateFixture.players.some(p=>p.getCurrentTime()===130));
    await page.screenshot({path:output+'/release-mobile.png'});await page.locator('#closeRelease').click();assert.equal(await page.locator('#track').innerText(),'Tried and true');
  });
  await check('new session clears the local view without deleting remote wants',async()=>{
    await page.locator('#sessionButton').click();const before=(await calls()).length;await page.locator('#newSession').click();
    assert.equal(await page.locator('[data-play]').count(),0);assert.equal((await calls()).length,before);
    assert.equal(await page.evaluate(()=>window.crateFixture.model.wanted.has(1001)),true);
    await page.locator('#closeSession').click();await page.locator('#heart').click();await page.waitForFunction(()=>!window.crateFixture.model.wanted.has(1001));
    assert.equal((await calls()).at(-1).method,'DELETE');
  });
  await check('failed add/removal leaves a retryable and consistent UI',async()=>{
    await open('fixture=1&fail=add');await page.locator('#heart').click();await page.waitForFunction(()=>!!window.crateFixture.model.error);
    assert.equal(await page.locator('#heart').getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>window.crateFixture.model.session.items.length),0);
    await page.locator('#heart').click();await page.waitForFunction(()=>window.crateFixture.model.session.items.length===1);
    await open('fixture=1&fail=remove');await page.locator('#sessionButton').click();await page.locator('[data-remove="0"]').click();await page.waitForFunction(()=>!!window.crateFixture.model.error);
    assert.equal(await page.locator('[data-remove]').count(),1);await page.locator('[data-remove="0"]').click();await page.waitForFunction(()=>window.crateFixture.model.session.items.length===0);
    assert.equal(await page.locator('[data-remove]').count(),0);await page.locator('#closeSession').click();
  });
  await check('failed wantlist refresh preserves session and can recover',async()=>{
    await page.locator('#heart').click();await page.waitForFunction(()=>window.crateFixture.model.session.items.length===1);
    await open('fixture=1&fail=refresh');await page.locator('#sessionButton').click();assert.equal(await page.locator('[data-play]').count(),1);
    assert.equal(await page.locator('[data-remove]').isDisabled(),true);await page.locator('#retryWants').click();await page.waitForFunction(()=>window.crateFixture.model.health==='ready');
    assert.equal(await page.locator('[data-remove]').isDisabled(),false);await page.locator('#closeSession').click();
  });
  await check('modal focus is contained, Escape closes it and icons keep their intended sizes',async()=>{
    await page.locator('#sessionButton').click();
    await page.locator('#youtube').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'closeSession');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#session').isVisible(),false);
    assert.equal(await page.locator('#sessionButton img').evaluate(el=>el.getBoundingClientRect().width),24);
    assert.equal(await page.locator('#heart img').evaluate(el=>el.getBoundingClientRect().width),24);
    assert.equal(await page.locator('#youtube img').evaluate(el=>el.getBoundingClientRect().width),14);
  });
  await check('responsive geometry: small phone, standard phone, desktop and long titles',async()=>{
    for(const [width,height] of [[320,568],[390,844],[1440,900]]) {
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const bounds=await page.locator('#dock').boundingBox(),cover=await page.locator('.card .art').first().boundingBox();
      assert.ok(bounds.y+ bounds.height<=height+.5);assert.ok(cover.y+cover.height<bounds.y,JSON.stringify({width,bounds,cover}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:output+`/playback-${width}x${height}.png`});
    }
    await page.setViewportSize({width:320,height:568});
    await page.evaluate(()=>{const s=window.crateFixture.playing.song;s.artist='An exceptionally long artist name with collaborators';s.trackTitle='A very long track title that needs more than one line on a small screen';});
    // A real view transition rerenders the same data without a special production test hook.
    await page.locator('#sessionButton').click();await page.locator('#closeSession').click();await page.waitForTimeout(100);
    const bounds=await page.locator('#dock').boundingBox(),cover=await page.locator('.card .art').first().boundingBox();
    assert.ok(cover.y+cover.height<=bounds.y+1,JSON.stringify({bounds,cover}));
    if(await page.locator('#sound').isVisible()) {
      const sound=await page.locator('#sound').boundingBox();assert.ok(sound.y>=cover.y && sound.y+sound.height<=cover.y+cover.height+1,JSON.stringify({sound,cover}));
    }
    await page.screenshot({path:output+'/long-title-small-phone.png'});
  });
  await check('onboarding and filters render without credentials or external requests',async()=>{
    await page.setViewportSize({width:402,height:874});await page.locator('#chip').click();await page.screenshot({path:output+'/filters-mobile.png'});
    await page.locator('#changeTok').click();await page.screenshot({path:output+'/onboarding-mobile.png'});
    assert.equal(await page.locator('#tok').inputValue(),'');assert.equal(requests.length,0);
  });
  await check('missing artwork and uncertain matching stay usable',async()=>{
    await page.locator('#closeSetup').click();
    await page.evaluate(async()=>{const fixture=await import('./tests/fixture.js');fixture.songs[0].cover='';fixture.songs[0].conf='none';fixture.songs[0].trackTitle=null;});
    await page.locator('#chip').click();await page.locator('#goBtn').click();
    assert.equal(await page.locator('.card .art img').first().getAttribute('src'),'tests/reference-cover.png');
    assert.equal(await page.locator('.card').first().locator('.art img').count(),0);
    assert.match(await page.locator('#matchWarning').innerText(),/unmatched/);await page.screenshot({path:output+'/missing-artwork.png'});
  });
  await check('double-tap and keyboard likes use the same immediate record toggle',async()=>{
    const before=await page.evaluate(()=>window.crateFixture.model.has(window.crateFixture.playing.song));
    const count=(await calls()).length;
    await page.locator('.card .art').first().dblclick();
    await page.waitForFunction(expected=>window.crateFixture.model.has(window.crateFixture.playing.song)!==expected,before);
    assert.equal((await calls()).length,count+1);
    await page.locator('body').click({position:{x:8,y:8}});await page.keyboard.press('l');
    await page.waitForFunction(expected=>window.crateFixture.model.has(window.crateFixture.playing.song)===expected,before);
    assert.equal((await calls()).length,count+2);
  });
  await check('production entry: connect, discover, like, reload, replay and remove with mocked endpoints',async()=>{
    const isolated=await browser.newContext({viewport:{width:402,height:874},reducedMotion:'reduce'}), live=await isolated.newPage();
    live.setDefaultTimeout(15000); const remote=new Map(),writes=[];
    live.on('pageerror',error=>errors.push(error.message));
    await live.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.url().startsWith(base)) return route.continue();
      if(url.hostname==='www.youtube.com' && url.pathname==='/iframe_api') return route.fulfill({contentType:'text/javascript',body:`window.YT={Player:class extends (${FakePlayer.toString()}){constructor(id,options){super(options.events)}}};window.onYouTubeIframeAPIReady();`});
      if(url.hostname!=='api.discogs.com') return route.abort();
      assert.equal(request.headers().authorization,'Discogs token=local-test-token');
      let body;
      if(url.pathname==='/oauth/identity') body={username:'browser-test'};
      else if(url.pathname==='/database/search') body={pagination:{pages:1,items:4},results:songs.map(s=>({id:s.releaseId,master_id:s.masterId,type:'release',title:s.artist+' - '+s.releaseTitle}))};
      else if(url.pathname.startsWith('/releases/')) body=releases.get(Number(url.pathname.split('/').at(-1)));
      else if(request.method()==='GET' && url.pathname.includes('/wants')) body={pagination:{pages:1},wants:[...remote].map(([id,master_id])=>({id,basic_information:{master_id}}))};
      else if(['PUT','DELETE'].includes(request.method()) && url.pathname.includes('/wants/')) {
        const id=Number(url.pathname.split('/').at(-1));writes.push(request.method());
        if(request.method()==='PUT')remote.set(id,releases.get(id).master_id);else remote.delete(id);body={};
      } else throw Error('Unexpected mock request '+request.method()+' '+url.pathname);
      return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
    });
    try {
      await live.goto(base);await live.locator('#setup').waitFor({state:'visible'});
      await live.locator('#closeSetup').click();await live.locator('#emptyAction').click();assert.equal(await live.locator('#setup').isVisible(),true);
      await live.locator('#tok').fill('local-test-token');await live.locator('#saveTok').click();await live.locator('#pick').waitFor({state:'visible'});
      await live.locator('#goBtn').click();await live.locator('#dock').waitFor({state:'visible'});await live.locator('#heart:not(:disabled)').waitFor();
      await live.locator('#heart').click();await live.waitForFunction(()=>document.querySelector('#heart').getAttribute('aria-pressed')==='true');
      assert.deepEqual(writes,['PUT']);await live.reload();await live.locator('#sessionButton').click();await live.locator('[data-play="0"]').waitFor();
      await live.locator('[data-play="0"]').click();await live.locator('[data-remove="0"]:not(:disabled)').waitFor();await live.locator('[data-remove="0"]').click();
      await live.waitForFunction(()=>document.querySelectorAll('[data-remove]').length===0);assert.deepEqual(writes,['PUT','DELETE']);
    } finally {await isolated.close();}
  });
  assert.deepEqual(errors,[]);
  await writeFile(output+'/browser-report.json',JSON.stringify({browser:process.env.BROWSER||'chromium',version:browser.version(),results,errors,externalRequests:requests},null,2));
  console.log(`${results.length} browser checks passed; no browser errors or external requests.`);
} finally {await browser.close();}
