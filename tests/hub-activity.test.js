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
 assert.match(hr,/hub-activity\.js\?v=2026100601/);assert.match(hr,/hub-texts\.js\?v=2026100801/);assert.match(hr,/t\.key!==\s*'actlog'/);assert.match(hr,/HubActivity\.start/);assert.match(texts,/activity_log\.retention_days/);
 const c=load();vm.runInNewContext(texts,c);assert.ok(c.HubUi.helpers.hubTextDefByKey('actlog.title'));
});
test('실제 저장 성공 뒤에만 작성 로그·글 ID 기록하고 본문 제외',async()=>{
 const calls=[],responses=[{data:[{id:42,body:'SECRET'}],error:null},{data:null,error:{message:'fail'}},{data:null,error:null}];
 const sb={rpc:async(n,p)=>{calls.push([n,p]);return {data:null,error:null};},from(){const builder={insert(){return this;},update(){return this;},select(){return this;},eq(){return this;},then(ok,bad){return Promise.resolve(responses.shift()).then(ok,bad);}};return builder;}};
 const h=load().HubActivity;h.start({sb,me:{id:'s',role:'staff'},document:null});
 await sb.from('suggestions').insert({body:'SECRET'}).select('id');await sb.from('suggestions').update({body:'SECRET'}).eq('id',42);await sb.from('notice_reads').insert({notice_id:3});await h.flush();
 const writes=calls.filter(([n])=>n==='log_hub_activity').flatMap(([,p])=>p.p_events).filter(e=>e.kind==='write');assert.equal(writes.length,1);assert.equal(writes[0].target_id,'42');assert.ok(!JSON.stringify(writes).includes('SECRET'));
});
test('읽기 RPC는 그대로 두고 실패한 운세 RPC는 작성으로 기록하지 않음',async()=>{
 const calls=[],sb={from(){return {};},rpc:async(n,p)=>{calls.push([n,p]);return {data:n==='fortune_draw'?{ok:false}:null,error:null};}};
 const h=load().HubActivity;h.start({sb,me:{id:'s',role:'staff'},document:null});await sb.rpc('fortune_status');await sb.rpc('fortune_draw');await h.flush();assert.equal(calls.at(-1)[1].p_events.filter(e=>e.kind==='write').length,0);
});
test('pagehide·visibilitychange는 keepalive 전송·머문 시간 기록',async()=>{
 const listeners={},win={},sent=[],doc={addEventListener(k,fn){listeners[k]=fn;},visibilityState:'visible'};
 const c=load({document:doc,addEventListener:(k,fn)=>win[k]=fn,fetch:async(u,o)=>{sent.push(JSON.parse(o.body));return {};}}),h=c.HubActivity;
 h.start({sb:{rpc:async()=>({})},me:{id:'s',role:'staff'},url:'https://example.invalid',key:'fixture',token:()=> 'fixture'});
 h.record('click','운세');doc.visibilityState='hidden';listeners.visibilitychange();assert.equal(sent.length,1);assert.ok(sent[0].p_events.some(e=>e.kind==='leave'&&Number.isFinite(e.meta.duration_seconds)));win.pagehide();assert.equal(sent.length,1,'숨김 후 pagehide는 이중 나감 없음');
 doc.visibilityState='visible';listeners.visibilitychange();await h.flush();
});
test('문서 ID 조회는 열람 기록·파일 내려받기는 내용 없이 기록',async()=>{
 const calls=[],sb={rpc:async(n,p)=>{calls.push(p);return {};},from(){const b={select(){return this;},eq(){return this;},single(){return this;},then(ok,bad){return Promise.resolve({data:{id:7,body:'SECRET'},error:null}).then(ok,bad);}};return b;},storage:{from(){return {download:async()=>({data:'SECRET',error:null})};}}};
 const h=load().HubActivity;h.start({sb,me:{id:'s',role:'staff'},document:null});await sb.from('contracts').select('*').eq('id',7).single();await sb.storage.from('employee-documents').download('SECRET-path');await h.flush();
 const events=calls.flatMap(p=>p.p_events);assert.ok(events.some(e=>e.kind==='view'&&e.target_id==='7'));assert.ok(events.some(e=>e.kind==='download'));assert.ok(!JSON.stringify(events).includes('SECRET'));
});
test('전역 클릭 감시로 운세·상품권·다운로드 기록, 입력 클릭은 제외',async()=>{
 const listeners={},calls=[],doc={addEventListener(k,f){listeners[k]=f;}};
 const c=load({document:doc,addEventListener(){}}),h=c.HubActivity;
 h.start({sb:{rpc:async(n,p)=>{calls.push(p);return {};}},me:{id:'s',role:'staff'}});
 for(const name of ['오늘의 운세','상품권 보기']){const el={tagName:'BUTTON',textContent:name,closest:()=>null,querySelector:()=>null,getAttribute:()=>null,hasAttribute:()=>false};listeners.click({target:{closest:()=>el}});}
 listeners.click({target:{closest:()=>null}});await h.flush();const clicks=calls.flatMap(p=>p.p_events).filter(e=>e.kind==='click');assert.deepEqual(clicks.map(e=>e.target),['오늘의 운세','상품권 보기']);
});
test('연차 처리·문의 처리·서류 RPC 성공이 종류·ID만 기록됨',async()=>{
 const calls=[],sb={from:()=>({}),rpc:async(n,p)=>{calls.push([n,p]);return {data:n==='submit_approval_document'?19:null,error:null};}};
 const h=load().HubActivity;h.start({sb,me:{id:'s',role:'staff'},document:null});
 for(const n of ['process_leave_request','payment_request_act','consultation_inbox_set_dentweb_entered','submit_approval_document'])await sb.rpc(n,{p_id:7,p_body:'SECRET'});
 await sb.rpc('consultation_inbox_record_view',{p_id:7});await h.flush();const writes=calls.at(-1)[1].p_events.filter(e=>e.kind==='write');assert.equal(writes.length,4);assert.equal(writes.at(-1).target_id,'19');assert.ok(!JSON.stringify(writes).includes('SECRET'));
});
test('직접 수정할 수 없는 DB 객체라도 수집 때문에 시작이 실패하지 않음',()=>{
 const sb=Object.freeze({from(){return {};},rpc:async()=>({})}),h=load().HubActivity;assert.doesNotThrow(()=>h.start({sb,me:{id:'s',role:'staff'},document:null}));assert.equal(h._t.pending(),1);
});
test('서명 URL 내려받기도 파일 이름·주소 없이 기록',async()=>{
 const calls=[],sb={from:()=>({}),rpc:async(n,p)=>{calls.push(p);return {};},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'SECRET-url'},error:null})})}};
 const h=load().HubActivity;h.start({sb,me:{id:'s',role:'staff'},document:null});await sb.storage.from('notice-attachments').createSignedUrl('SECRET-path',60,{download:'SECRET-name'});await h.flush();
 const events=calls.flatMap(p=>p.p_events);assert.ok(events.some(e=>e.kind==='download'&&e.target==='storage:notice-attachments'));assert.ok(!JSON.stringify(events).includes('SECRET'));
});
