const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
function load(extra={}){const c={console,Date,Promise,setInterval:()=>1,clearInterval(){},setTimeout,TextEncoder,...extra};c.globalThis=c;vm.runInNewContext(fs.readFileSync(path.join(root,'hub-activity.js'),'utf8'),c);return c;}
test('입력칸·비밀번호·편집 영역 내용은 이름표에서 제외',()=>{
 const h=load().HubActivity._t;
 for(const tag of ['INPUT','TEXTAREA'])assert.equal(h.label({tagName:tag,value:'SECRET',textContent:'SECRET',getAttribute:()=>null}),'');
 assert.equal(h.label({tagName:'BUTTON',textContent:'保存',querySelector:()=>({}),getAttribute:()=>null}),'button');
 assert.equal(h.label({tagName:'BUTTON',textContent:'今日の運勢',querySelector:()=>null,getAttribute:()=>null}),'今日の運勢');
});
test('작은 허용 항목만 보내고 본문·사용자 위조값 제외',()=>{
 const h=load().HubActivity._t,e=h.event('write','suggestions','12',{body:'SECRET',password:'SECRET',duration_seconds:4,user_id:'spoof'});
 assert.equal(e.target_id,'12');assert.deepEqual(Object.keys(e.meta),['duration_seconds']);assert.ok(!JSON.stringify(e).includes('SECRET'));
});
test('5초 묶음 전송·최대 50건·실패가 화면에 전파되지 않음',async()=>{
 const calls=[],h=load().HubActivity;h.start({sb:{rpc:async(n,p)=>{calls.push(p.p_events);return {error:{message:'offline'}};}},me:{id:'s',role:'staff'},document:null});
 for(let i=0;i<65;i++)h.record('click','button');await h.flush();assert.equal(calls.length,2);assert.equal(calls[0].length,50);assert.equal(calls[1].length,16);assert.equal(h._t.pending(),0);
});
test('CSV 수식 시작 문자와 따옴표 처리',()=>{
 const h=load().HubActivity._t;assert.equal(h.csvCell('=cmd()'),'"\'=cmd()"');assert.equal(h.csvCell('\t+1'),'"\'\t+1"');assert.equal(h.csvCell('a"b'),'"a""b"');
});
test('날짜 범위는 한국시간으로 계산',()=>{
 const h=load().HubActivity._t;assert.deepEqual(JSON.parse(JSON.stringify(h.dates('today',new Date('2026-10-05T16:00:00Z')))),{from:'2026-10-06',to:'2026-10-06'});
});
test('사용 기록 탭·설정·캐시 연결',()=>{
 const hr=fs.readFileSync(path.join(root,'hr.html'),'utf8'),texts=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8');
 assert.match(hr,/hub-activity\.js\?v=2026100601/);assert.match(hr,/hub-texts\.js\?v=2026100607/);assert.match(hr,/t\.key!==\s*'actlog'/);assert.match(hr,/HubActivity\.start/);assert.match(texts,/activity_log\.retention_days/);
 const c=load();vm.runInNewContext(texts,c);assert.ok(c.HubUi.textDefs().some(d=>d.key==='actlog.title'));
});
