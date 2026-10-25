// Deterministic localhost-only demo. No token and no requests to Discogs or YouTube.
const base = {releaseId:1001,masterId:501,releaseTitle:'Checks And Balances',label:'Morris / Audio · morris5',year:2001,country:'Switzerland',artist:'Geoff White',trackTitle:'Tried and true',position:'A1',conf:'high',score:1,vid:'aaaaaaaaaaa',videoTitle:'Geoff White - Tried and True',duration:229,cover:'tests/reference-cover.png',cover2:'',url:'https://www.discogs.com/release/1001'};
export const songs = [base,
  {...base,releaseId:1002,masterId:502,releaseTitle:'Night signals',artist:'The Other Side',trackTitle:'A quiet place',videoTitle:'The Other Side - A quiet place',vid:'bbbbbbbbbbb'},
  {...base,releaseId:1003,masterId:503,releaseTitle:'After hours',artist:'Soft Focus',trackTitle:'Somewhere new',videoTitle:'Soft Focus - Somewhere new',vid:'ccccccccccc'},
  {...base,releaseId:1004,masterId:504,releaseTitle:'Morning light',artist:'Low Tide',trackTitle:'Back to the start',videoTitle:'Low Tide - Back to the start',vid:'ddddddddddd'}];
export const releases = new Map(songs.map(s=>[s.releaseId,{
  id:s.releaseId,master_id:s.masterId,title:s.releaseTitle,artists:[{name:s.artist}],year:s.year,country:s.country,
  labels:[{name:'Morris / Audio',catno:'morris5'}],styles:['Minimal Techno'],formats:[{name:'Vinyl'}],uri:s.url,
  tracklist:[{position:'A1',title:s.trackTitle,duration:'3:49',type_:'track'},{position:'B1',title:'Second thoughts',duration:'4:20',type_:'track'}],
  videos:[{title:s.videoTitle,uri:'https://www.youtube.com/watch?v='+s.vid,duration:229,embed:true},
    {title:s.artist+' - Second thoughts',uri:'https://www.youtube.com/watch?v=eeeeeeeeeee',duration:260,embed:true}]
}]));
export function createAPI(params) {
  let wanted = new Map(JSON.parse(localStorage.getItem('crate_fixture_remote')||'[]'));
  const calls = [], failed = new Set();
  return {calls,count:0,async req(method,path) {
    this.count++; calls.push({method,path}); await new Promise(resolve=>setTimeout(resolve,40));
    const kind = method==='PUT'?'add':method==='DELETE'?'remove':'refresh';
    if (params.get('fail') === kind && !failed.has(kind)) {failed.add(kind);throw Error('Simulated '+kind+' failure');}
    if (path.includes('/wants?')) return {pagination:{pages:1},wants:[...wanted].map(([id,master_id])=>({id,basic_information:{master_id}}))};
    const id = Number(path.split('/').at(-1));
    if (method==='PUT') wanted.set(id,songs.find(s=>s.releaseId===id)?.masterId||0);
    if (method==='DELETE') wanted.delete(id);
    localStorage.setItem('crate_fixture_remote',JSON.stringify([...wanted])); return {};
  },get(path) {return this.req('GET',path);}};
}
export class FakePlayer {
  // Models the IFrame API, including a playlist the player advances on its own when a video ends.
  constructor(events) {this.events=events;this.state=2;this.time=0;this.muted=true;this.list=null;this.idx=-1;this.loads=0;queueMicrotask(()=>events.onReady());}
  emitState(data){this.state=data;this.events.onStateChange({data});if(data===0&&this.list&&this.idx<this.list.length-1&&!this.holdPlaylist)queueMicrotask(()=>this.nextVideo());}
  loadVideoById({videoId,startSeconds=0}) {this.loads++;(this.history||=[]).push("v:"+videoId);this.list=null;this.idx=-1;this.vid=videoId;this.time=startSeconds;queueMicrotask(()=>this.emitState(1));}
  cueVideoById({videoId,startSeconds=0}) {this.list=null;this.idx=-1;this.vid=videoId;this.time=startSeconds;this.state=5;}
  loadPlaylist({playlist,index=0,startSeconds=0}) {this.loads++;(this.history||=[]).push("p:"+playlist[index]);this.list=[...playlist];this.idx=index;this.vid=this.list[index];this.time=startSeconds;queueMicrotask(()=>this.emitState(1));}
  cuePlaylist({playlist,index=0,startSeconds=0}) {this.list=[...playlist];this.idx=index;this.vid=this.list[index];this.time=startSeconds;this.state=5;}
  nextVideo(){if(!this.list||this.idx>=this.list.length-1)return;this.idx++;this.vid=this.list[this.idx];this.time=0;this.emitState(-1);this.emitState(1);}
  getPlaylist(){return this.list?[...this.list]:null;}getPlaylistIndex(){return this.list?this.idx:-1;}
  getVideoData(){return {video_id:this.vid};}getVideoUrl(){return 'https://www.youtube.com/watch?v='+this.vid;}
  playVideo(){this.emitState(1);}
  pauseVideo(){this.emitState(2);}
  stopVideo(){this.state=-1;}
  mute(){this.muted=true;}unMute(){this.muted=false;}isMuted(){return this.muted;}setVolume(){}
  getPlayerState(){return this.state;}getCurrentTime(){return this.time;}getDuration(){return this.vid==='eeeeeeeeeee'?260:229;}
  seekTo(time){this.time=time;}
}
export async function probeVideo(url, params) {
  if (params.get('probe') === 'offline') throw Error('Simulated metadata outage');
  const vid = new URL(new URL(url).searchParams.get('url')).searchParams.get('v');
  return new Response(JSON.stringify({type:'video'}), {status:params.get('unavailable')?.split(',').includes(vid) ? 404 : 200});
}
