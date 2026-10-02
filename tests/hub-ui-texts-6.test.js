// 직원허브 「⚙️ 허브 설정」 차례 6 시험 — 근로계약서 글·계약서 본문 기본 문구·계약 만료 알림 일수를 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 근로계약서 화면·미리보기·계약서 본문 합치기·메시지·확인창이 옛 화면(699df1c)과 글자 하나까지 같음(5가지 상태)
//       ②표에 값이 있으면 그 글(이스케이프 · {자리표시자}) ③만료 알림 일수는 정수 1~365 · 1~5개 · 중복 없음, 틀리면 기본 14·30·60
//       ④이미 발송·서명한 계약서는 저장된 본문(merged_html)을 그대로 보여 줌 — 글을 고쳐도 소급 변경 없음 ⑤법적 동의 문장·기존 시험이 줄 모양을 찾는 곳은 안 옮김.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll,TEMPLATE,CONTRACT_ROWS}=require('./fixtures/hub6-harness.cjs');
const golden=JSON.parse(read('tests/fixtures/hub6-golden-699df1c.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const CH6=/^contract\./;
const COUNT=188;
const EXPIRY='contract.expiry_alert_days';
const STATIC_KEYS=['contract.end_title','contract.f_employee','contract.end_f_date','contract.f_period','contract.f_noend','contract.end_hint','contract.btn_save']; // 계약 종료일 설정 창(정적 HTML)의 data-hubk 표지

function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block);
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubSetting,hubSettingChecked,hubSettingIntList,hubContractExpiryDays,hubSettingSetValues,hubSettingValidate,hubSettingSave,hubSettingReset,HUB_SETTING_DEFS,hubTextDefs,hubTextDefByKey,hubTextMatches,hubTextSetOverrides};',c);
  return c.h;
}
function fakeSb(opts){
  const o=opts||{},state={texts:(o.texts||[]).map(r=>Object.assign({},r)),settings:(o.settings||[]).map(r=>Object.assign({},r)),calls:[]};
  function from(table){
    const q={table,op:null,payload:null,opts:null,filters:{}};
    const api={
      select(c){q.op='select';q.cols=c;return api;},
      upsert(row,op){q.op='upsert';q.payload=row;q.opts=op;return api;},
      delete(){q.op='delete';return api;},
      eq(k,v){q.filters[k]=v;return api;},
      then(res,rej){
        state.calls.push(q);
        const rows=table==='hub_ui_texts'?state.texts:state.settings;
        let out;
        if(q.op==='select')out=o.failSelect?{data:null,error:{message:'boom'}}:{data:rows.map(r=>Object.assign({},r)),error:null};
        else if(o.failWrite)out={data:null,error:{code:'42501',message:'new row violates row-level security policy'}};
        else if(q.op==='upsert'){const i=rows.findIndex(r=>r.key===q.payload.key);if(i>=0)rows[i]=Object.assign({},rows[i],q.payload);else rows.push(Object.assign({},q.payload));out={data:null,error:null};}
        else if(q.op==='delete'){const keep=rows.filter(r=>r.key!==q.filters.key);rows.length=0;keep.forEach(r=>rows.push(r));out={data:null,error:null};}
        return Promise.resolve(out).then(res,rej);
      }};
    return api;
  }
  return {sb:{from},state};
}
const dynRows=defs=>defs.map(d=>({key:d.key,value:'«'+d.key+'»'+(d.vars?' '+d.vars.map(v=>'{'+v+'}').join(' '):'')}));
const ch6Defs=()=>helpers().hubTextDefs().filter(d=>CH6.test(d.key));
const allOut=out=>Object.values(out).join('\n');

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 6 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 5개·188개 · 계약서 본문 문구는 ⚠️ 안내로 시작',()=>{
  const defs=ch6Defs();
  assert.equal(defs.length,COUNT,'차례 6 글 키 수');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.deepEqual(clone(screens),['📝 근로계약서 › 새 계약서 쓰기·미리보기','📝 근로계약서 › 발송·반려·원본 PDF','📝 근로계약서 › 계약 목록·계약기간·만료 알림','📝 근로계약서 › 직원 서명 화면','📝 근로계약서 › 계약서 본문 기본 문구']);
  const body=defs.filter(d=>d.key.startsWith('contract.body.'));
  assert.equal(body.length,14);
  for(const d of body)assert.ok(d.where.startsWith('⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요(이미 발송·서명한 계약서는'),d.key+' 소급 안 바뀐다는 경고');
  assert.deepEqual(clone(body.map(d=>d.screen).filter((v,i,a)=>a.indexOf(v)===i)),['📝 근로계약서 › 계약서 본문 기본 문구']);
});

test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:ctT|T)\(\s*'(contract\.[a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  let m;
  while((m=re.exec(hr))){
    const v=vm.runInNewContext(m[2]);
    if(found.has(m[1]))assert.equal(found.get(m[1]),v,m[1]+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(m[1],v);
  }
  const marks=new Map();
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="(contract\.[a-z0-9_.]+)"[^>]*>([^<]*)</g))marks.set(sm[1],sm[2]);
  assert.deepEqual([...marks.keys()].sort(),[...STATIC_KEYS].sort(),'계약 종료일 설정 창의 표지 7개');
  const defs=h.hubTextDefs().filter(d=>CH6.test(d.key));
  for(const d of defs){
    if(marks.has(d.key)){assert.equal(marks.get(d.key),d.def,d.key+' 표지 글이 기본값과 다름');}
    if(STATIC_KEYS.includes(d.key)&&!['contract.f_employee','contract.f_period','contract.f_noend','contract.btn_save'].includes(d.key))continue; // 정적 창에서만 쓰는 키
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of [...found.keys(),...marks.keys()])assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  assert.ok(found.size>=170,'화면에서 쓰는 키 수');
});

test('숫자: 만료 알림 일수 하나(정수 목록) · 다른 숫자 18개는 그대로 · 캐시 번호 · DB에도 같은 일수가 없음',()=>{
  const h=helpers();
  assert.equal(h.HUB_SETTING_DEFS.length,28);
  const d=h.HUB_SETTING_DEFS[18];
  assert.deepEqual(clone([d.key,d.screen,d.def,d.kind,d.min,d.max,d.unit]),[EXPIRY,'📝 근로계약 기준','[14,30,60]','intlist',1,365,'일']);
  assert.ok(d.where.includes('가장 작은 수=긴급')&&d.where.includes('이미 저장된 계약서는 안 바뀌어요'));
  assert.match(hr,/typeof hubContractExpiryDays==='function'\?hubContractExpiryDays\(\):\[14,30,60\]/,'화면은 허브 설정 일수를 읽고 엔진이 없으면 14·30·60');
  assert.match(hr,/hub-texts\.js\?v=2026100302/,'캐시 번호를 새 값으로 올림(차례 5에서 2026100111 → 2026100112, 차례 7에서 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-02 인박스 판에서 → 2026100223)');
  assert.ok(!/hub-texts\.js\?v=2026100111/.test(hr));
  // 화면에만 있던 숫자라 옮김 — DB 함수·크론·Edge에 같은 일수가 있으면 안 옮겼어야 함
  const files=[];
  for(const f of fs.readdirSync(path.join(root,'db')))if(f.endsWith('.sql'))files.push('db/'+f);
  const walk=p=>{for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){const q=p+'/'+e.name;if(e.isDirectory())walk(q);else if(/\.(ts|sql)$/.test(e.name))files.push(q);}};
  walk('supabase/functions');
  for(const f of files){
    const t=read(f);
    assert.ok(!/expiry_alert_days/.test(t),f);
    assert.ok(!/(expir|만료)[^\n]{0,80}interval\s*'(14|30|60) days'/i.test(t)&&!/interval\s*'(14|30|60) days'[^\n]{0,80}(expir|만료)/i.test(t),f+' 에 계약 만료 알림 일수가 박혀 있음');
  }
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 근로계약서 화면·본문·메시지가 옛 화면(699df1c)과 글자 하나까지 같다',async()=>{
  const out=await renderAll(hr,{engine:false});
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
  assert.ok(Object.keys(golden).length>=130,'대조 항목 수');
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('기본값만 있을 때: 엔진을 못 불러와 hr.html의 대비책(shim)만 있어도 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:false,shim:true});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('기본값만 있을 때: 엔진이 있고 표가 비어 있어도 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('표를 못 읽어도(읽기 실패) 옛 화면과 같다 — 기본값으로 조용히 동작',async()=>{
  const out=await renderAll(hr,{engine:true,loadFail:true,settings:{}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('잘못된 값이 들어 있어도(만료 일수가 글자·범위 밖·6개·중복·빈 목록, 글이 공백뿐) 옛 화면과 같다',async()=>{
  for(const bad of ['abc','0','366','1,2,3,4,5,6','14,14','[]','[14,"a"]','{"a":1}','14.5','-3','  ','']){
    const out=await renderAll(hr,{engine:true,textRows:[],settings:{[EXPIRY]:bad}});
    for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k+' ← '+JSON.stringify(bad));
  }
  const out=await renderAll(hr,{engine:true,textRows:[{key:'contract.al_title',value:'   '},{key:'contract.body.fixed_term',value:''},{key:'contract.btn_save',value:'\n'}],settings:{}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
  const same=await renderAll(hr,{engine:true,textRows:[],settings:{[EXPIRY]:'[14, 30, 60]'}});
  for(const k of Object.keys(golden))assert.equal(same[k],golden[k],k+' 모양만 다른 기본 일수');
  const same2=await renderAll(hr,{engine:true,textRows:[],settings:{[EXPIRY]:'60,30,14'}});
  for(const k of Object.keys(golden))assert.equal(same2[k],golden[k],k+' 순서만 다른 기본 일수(작은 수부터 정렬)');
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다(원장 화면·직원 화면·본문·메시지·확인창 각각)',async()=>{
  const cases=[
    ["ctT('contract.al_title','⏰ 근로계약 만료 확인')","ctT('contract.al_title','⏰ 근로계약 만료확인')",'pure.alerts_card'],
    ["ctT('contract.new_title','📝 새 근로계약서')","ctT('contract.new_title','📝 새 근로계약서!')",'owner.render.owner'],
    ["ctT('contract.mine_title','📝 내 근로계약서')","ctT('contract.mine_title','📝 내 근로 계약서')",'emp.render.staff'],
    ["ctT('contract.body.fixed_term','기간 만료 시 근로관계는 종료됩니다.","ctT('contract.body.fixed_term','기간 만료시 근로관계는 종료됩니다.",'pure.merge.fixed'],
    ["ctT('contract.body.holiday','■ 설·추석 등 공휴일 근무 포함')","ctT('contract.body.holiday','■ 설·추석 등 공휴일 근무포함')",'pure.merge.fixed'],
    ["ctT('contract.body.wage_empty','임금 구성은 계약 발송 전에 직원별로 기입합니다.')","ctT('contract.body.wage_empty','임금 구성은 계약 발송 전에 직원별로 기입합니다')",'pure.merge.no_schedule'],
    ["ctT('contract.body.sched_twice','상기 주 5일 중 {days} 야간 2회 (근무표에 따름)'","ctT('contract.body.sched_twice','상기 주 5일 중 {days} 야간 2회(근무표에 따름)'",'pure.schedule_html'],
    ["ctT('contract.m_need_fields','필수 계약 조건을 입력하세요: {list}'","ctT('contract.m_need_fields','필수 계약 조건을 입력하세요 : {list}'",'send.missing_required'],
    ["T('contract.confirm_reject','이 발송 요청을 반려할까요? 직원에게 가지 않고 취소로 바뀝니다')","T('contract.confirm_reject','이 발송 요청을 반려할까요? 직원에게 가지 않고 취소로 바뀝니다.')",'reject.ok'],
    ["ctT('contract.m_expired','서명 기간이 만료되었습니다. 원장에게 문의하세요.')","ctT('contract.m_expired','서명 기간이 만료되었습니다. 원장께 문의하세요.')",'sign.save.expired'],
    ["ctT('contract.m_pdf_done','원본 PDF를 보관하고 해시를 등록했습니다.')","ctT('contract.m_pdf_done','원본 PDF를 보관하고 해시를 등록했어요.')",'pdfreg.ok'],
    ["ctT('contract.v_warn','이전 브라우저에서 저장된 요청이라 근무시간표 값을 다시 확인해야 합니다.')","ctT('contract.v_warn','이전 브라우저에서 저장된 요청이라 근무시간표 값을 다시 확인해야 합니다')",'view.broken_owner'],
    ["ctT('contract.m_save_fail','저장 실패: {msg}'","ctT('contract.m_save_fail','저장실패: {msg}'",'end.fail'],
    ["ctT('contract.al_review','관리자 확인 필요')","ctT('contract.al_review','관리자 확인필요')",'pure.alert_text'],
    ['<h2>🖋 원장 최종 발송 대기</h2>${CONTRACT_ROWS','<h2>🖋 원장 최종 발송 대기 </h2>${CONTRACT_ROWS','owner.render.owner'],
    ["CONTRACT_FLASH=finalSend?'발송했습니다.':","CONTRACT_FLASH=finalSend?'발송했습니다':",'send.owner_ok']
  ];
  for(const [from,to,key] of cases){
    const c=hr.replace(from,to);
    assert.notEqual(c,hr,'바꿀 곳을 못 찾음: '+from);
    assert.notEqual((await renderAll(c,{engine:false}))[key],golden[key],key+' ← '+from);
  }
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 고쳐 쓰는 글 188개 가운데 화면에서 나오는 181개가 모두 나오고(나머지 7개는 정적 창), {자리표시자}가 채워진다',async()=>{
  const defs=ch6Defs();
  const out=await renderAll(hr,{engine:true,textRows:dynRows(defs),settings:{}});
  const all=allOut(out);
  const missing=defs.filter(d=>!all.includes('«'+d.key+'»')).map(d=>d.key);
  assert.deepEqual(clone(missing).sort(),['contract.end_f_date','contract.end_hint','contract.end_title'],'값을 넣었는데 화면에 안 나오는 키(계약 종료일 설정 창은 정적 HTML이라 허브가 열릴 때 hubStaticFill이 채움)');
  assert.ok(!/«[a-z0-9_.]+»[^"\\]*\{[a-z_]+\}/.test(all.replace(/\\"/g,'"')),'{자리표시자}가 채워지지 않고 남음');
});
test('표에 값이 있으면 그 글: 구체적인 예(제목·단추·메시지·알림창·확인창·본문 조항) + HTML은 이스케이프',async()=>{
  const rows=[
    {key:'contract.new_title',value:'📝 새 계약서 <쓰기>'},{key:'contract.btn_send_owner',value:'바로 보냄'},{key:'contract.btn_send_req',value:'원장님께 요청'},{key:'contract.th_status',value:'지금 상태'},
    {key:'contract.al_title',value:'⏰ 만료 곧'},{key:'contract.al_end',value:'끝나는 날 {end}'},{key:'contract.al_expired',value:'{n}일 지났음'},{key:'contract.al_dday',value:'{n}일 남음'},{key:'contract.al_count',value:'[{n}]'},{key:'contract.al_empty',value:'{n}일 안에 끝나는 계약 없음'},
    {key:'contract.mine_title',value:'내 계약서들'},{key:'contract.meta_sent',value:'보냄 {date}'},{key:'contract.meta_due',value:'기한 {date}'},{key:'contract.btn_sign_save',value:'읽었고 서명함'},{key:'contract.int_sig_h',value:'{part} 서명란'},
    {key:'contract.m_need_fields',value:'{list} 를 안 적었어요'},{key:'contract.m_pdf_save_fail',value:'{msg} 때문에 PDF 보관 실패'},{key:'contract.confirm_reject',value:'정말 반려해요?'},{key:'contract.m_reject_fail',value:'{msg} 로 반려 안 됨'},{key:'contract.m_expired',value:'기간이 지났어요'},
    {key:'contract.body.fixed_term',value:'계약기간이 끝나면 <b>자동</b> 종료됩니다.'},{key:'contract.body.na',value:'없음'},{key:'contract.body.holiday',value:'■ 공휴일에도 근무'},{key:'contract.body.sched_rot_wk',value:'{days} 중 5일(주말 가능)'},{key:'contract.body.sched_th_days',value:'요일'},
    {key:'contract.body.wage_hours',value:'[{h}시간]'},{key:'contract.body.wage_caption',value:'임금표'},{key:'contract.body.wage_empty',value:'임금은 따로 적습니다.'},
    {key:'contract.m_rejected',value:'반려했어요'},{key:'contract.m_sent',value:'보냈어요'}
  ];
  const out=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  const ow=JSON.parse(out['owner.render.owner'])[0];
  assert.match(ow,/<h2>📝 새 계약서 &lt;쓰기&gt;<\/h2>/);assert.ok(!ow.includes('<쓰기>'));
  assert.match(ow,/sendContract\(\)">바로 보냄<\/button>/);
  const mgr=JSON.parse(out['owner.render.manager'])[0];assert.match(mgr,/sendContract\(\)">원장님께 요청<\/button>/);
  assert.match(ow,/<th>지금 상태<\/th>/);
  assert.match(out['pure.alerts_card'],/⏰ 만료 곧/);assert.match(out['pure.alerts_card'],/\[5\]/);assert.match(out['pure.alerts_card'],/끝나는 날 2026-09-28/);assert.match(out['pure.alerts_card'],/3일 지났음/);
  assert.ok(JSON.parse(out['pure.alerts_card'])[1].includes('60일 안에 끝나는 계약 없음'));
  const emp=JSON.parse(out['emp.render.staff'])[0];
  assert.match(emp,/<h2>내 계약서들<\/h2>/);assert.match(emp,/보냄 \d{4}\.\d{2}\.\d{2} · 기한 \d{4}\.\d{2}\.\d{2}/);assert.match(emp,/읽었고 서명함<\/button>/);assert.match(emp,/근로계약 서명란/);
  assert.match(out['send.missing_required'],/직종 를 안 적었어요/);
  assert.match(out['pdfreg.upload_fail'],/올리기<실패> 때문에 PDF 보관 실패/);
  assert.match(out['reject.ok'],/confirm:정말 반려해요\?/);assert.match(out['reject.fail'],/alert:반려<실패> 로 반려 안 됨/);
  assert.match(out['sign.save.expired'],/기간이 지났어요/);
  // 새로 만드는 계약서 본문 문구
  assert.ok(out['pure.merge.fixed'].includes('계약기간이 끝나면 &lt;b&gt;자동&lt;/b&gt; 종료됩니다.'));assert.ok(!out['pure.merge.fixed'].includes('<b>자동</b>'));
  assert.ok(!out['pure.merge.fixed'].includes('기간 만료 시 근로관계는 종료됩니다.'));
  assert.ok(out['pure.merge.fixed'].includes('■ 공휴일에도 근무<br>'));
  assert.ok(out['pure.merge.fixed'].includes('<th style="border:1px solid #aaa;padding:4px;background:#f4f7f7">요일</th>'));
  assert.ok(out['pure.merge.fixed'].includes('월·화·수·목·금·토·일 중 5일(주말 가능)'));
  assert.ok(out['pure.merge.fixed'].includes('기본급 [209시간]'));
  assert.ok(out['pure.merge.open'].includes('연봉 없음 · 시급 없음 · 이메일 없음'),'비워 둔 선택 항목 글');
  assert.ok(out['pure.merge.no_schedule'].includes('임금은 따로 적습니다.'));
  assert.ok(out['pure.wage'].includes('<caption>임금표</caption>'));
  // 안 고친 글은 그대로
  assert.ok(out['pure.merge.fixed'].includes('<h1>근 로 계 약 서</h1>'));
  assert.match(ow,/<label>직원<\/label>/);
});
test('표에 값이 있으면 그 글: 발송 결과 안내(새 계약서 칸 아래) 5가지는 고친 글로 바뀌고, 안 고친 글·낯선 안내는 그대로',async()=>{
  const rows=[{key:'contract.m_sent',value:'보냈어요'},{key:'contract.m_requested',value:'요청했어요'},{key:'contract.m_edit_sent',value:'고쳐서 보냈어요'},{key:'contract.m_approved',value:'확인하고 보냈어요'},{key:'contract.m_rejected',value:'반려했어요'}];
  const out=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  const msgOf=k=>JSON.parse(out[k])[1].filter(h=>h.startsWith('#contractMsg|t|'));
  assert.deepEqual(msgOf('owner.render.flash_sent'),['#contractMsg|t|보냈어요']);
  assert.deepEqual(msgOf('owner.render.flash_req'),['#contractMsg|t|요청했어요']);
  assert.deepEqual(msgOf('owner.render.flash_edit'),['#contractMsg|t|고쳐서 보냈어요']);
  assert.deepEqual(msgOf('owner.render.flash_approved'),['#contractMsg|t|확인하고 보냈어요']);
  assert.deepEqual(msgOf('owner.render.flash_rejected'),['#contractMsg|t|반려했어요']);
  assert.deepEqual(msgOf('owner.render.flash_other'),[],'낯선 안내는 그대로(바꿔 넣지 않음)');
  assert.deepEqual(msgOf('owner.render.owner'),[]);
  // 글을 안 고쳤으면 화면 글자 그대로(바꿔 넣는 줄을 아예 안 지남)
  const plain=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  assert.deepEqual(JSON.parse(plain['owner.render.flash_sent'])[1].filter(h=>h.startsWith('#contractMsg|t|')),[]);
  assert.ok(JSON.parse(plain['owner.render.flash_sent'])[0].includes('<div class="msg" id="contractMsg">발송했습니다.</div>'));
});
test('표에 값이 있으면 그 글: 「최종 발송 대기」 제목은 기존 시험이 찾는 줄을 그대로 두고 고쳤을 때만 바꿔 넣는다',async()=>{
  assert.ok(hr.includes('<div class="card"><h2>🖋 원장 최종 발송 대기</h2>'),'기존 시험이 찾는 줄 모양 그대로');
  const out=await renderAll(hr,{engine:true,textRows:[{key:'contract.send_title',value:'🖋 보내기 전 <확인>'}],settings:{}});
  const ow=JSON.parse(out['owner.render.owner'])[0];
  assert.ok(ow.includes('<h2>🖋 보내기 전 &lt;확인&gt;</h2>'));assert.ok(!ow.includes('원장 최종 발송 대기'));
  assert.ok(!JSON.parse(out['owner.render.manager'])[0].includes('보내기 전'),'원장이 아닌 사람 화면에는 이 칸이 없음');
});
test('시험 하나: 모든 글을 고쳐 둬도 계약 종료일 설정 창(정적 HTML)은 표지(data-hubk)로 hubStaticFill이 채운다',()=>{
  const modal=hr.slice(hr.indexOf('<div class="mask" id="contractEndMask">'),hr.indexOf('<footer>'));
  assert.ok(modal.length>500&&modal.length<2500,'계약 종료일 설정 창 조각');
  for(const k of ['contract.end_title','contract.f_employee','contract.end_f_date','contract.f_period','contract.f_noend','contract.end_hint','contract.btn_save'])assert.ok(modal.includes('data-hubk="'+k+'"'),k);
  assert.ok(modal.includes('<h3><span data-hubk="contract.end_title">📅 계약 종료일 설정</span><button class="x"'),'제목 옆 닫기 단추를 안 지우도록 제목 글만 span으로 감쌈');
  assert.ok(modal.includes('onchange="toggleExistingContractNoEnd()"> <span data-hubk="contract.f_noend">기간의 정함 없음</span></label>'),'체크칸은 span으로 글만 감쌈');
  assert.match(hr,/hubStaticFill\(\);apprKindSelectFill\(\)/,'화면을 그릴 때마다 정적 글을 채움');
});

/* ───────────── 4. 이미 서명·저장된 계약서는 안 바뀐다 ───────────── */
test('저장된 계약서 소급 변경 없음: 모든 글을 고쳐 둬도 발송·서명한 계약서는 저장된 본문(merged_html)이 그대로 보인다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:dynRows(ch6Defs()),settings:{}});
  // 원장 화면 「보기」: 서명 완료·발송 요청·구성이 깨진 요청
  assert.ok(out['view.signed'].includes('<div class=\\"contract-doc\\"><p>서명완료본</p></div>'));
  assert.ok(out['view.plain'].includes('<div class=\\"contract-doc\\"><p>요청본</p></div>'));
  assert.ok(!out['view.signed'].includes('«contract.body'));
  // 직원 화면: 대기 계약의 본문은 저장된 글 그대로, 원본 PDF가 있는 서명 완료 계약은 HTML 본문 대신 PDF 안내만(옛 화면과 같음)
  const emp=JSON.parse(out['emp.render.staff'])[0],segs=emp.split('<div class="card" id="integratedContract-');
  const seg=id=>segs.find(x=>x.startsWith(id+'"'));
  assert.ok(seg(13).includes('<div class="contract-doc" style="margin-top:10px"><p>대기본</p><span data-sign-slot="employee"></span></div>'));
  assert.ok(!seg(14).includes('contract-doc'));
  for(const id of [11,13,14,17,18])assert.ok(!/<div class="contract-doc"[^>]*>[^]*«contract\.body/.test(seg(id).split('</div></div><div class=')[0]),id+' 본문에 설정 글이 끼어듦');
  // 본문 합치기는 새 계약서를 만들 때(미리보기·발송)만 부른다 — 저장된 계약을 다시 그릴 때 현재 설정 글을 끼워 넣지 않음
  const calls=[...hr.matchAll(/mergeContractHtml\(/g)].length;
  assert.equal(calls,3,'정의 1 + 미리보기 1 + 발송 1');
  assert.match(hr,/function previewContract\(\)\{[\s\S]*?mergeContractHtml\(d\.template,d\.fields\)/);
  assert.match(hr,/const finalSend=ME\.role==='owner',merged=mergeContractHtml\(d\.template,d\.fields\)/);
  const approve=hr.match(/async function approveContractSend\(id\)\{[\s\S]*?\n\}/)[0];
  assert.ok(approve.includes("new Blob([row.merged_html||'']")&&!approve.includes('mergeContractHtml'),'최종 발송 확인 때 보관하는 최종본도 저장된 본문');
  const saveSig=hr.match(/async function saveContractSignature\(id\)\{[\s\S]*?\n\}/)[0];
  assert.ok(saveSig.includes('String(row.merged_html).replace(slot,')&&!saveSig.includes('mergeContractHtml')&&!saveSig.includes('body_html'),'서명 저장은 저장된 본문에서 서명 자리만 바꿈');
  const view=hr.match(/function viewContract\(id\)\{[\s\S]*?\n\}/)[0];
  assert.ok(view.includes("(row.merged_html||'')")&&!view.includes('mergeContractHtml'),'보기도 저장된 본문');
});
test('저장된 계약서 소급 변경 없음: 새로 만드는 계약서만 고친 글로 만들어지고(발송 때 본문에 박힘), 같은 글을 되돌려도 이미 보낸 본문은 그대로',async()=>{
  const rows=[{key:'contract.body.fixed_term',value:'기간이 끝나면 근로관계가 종료됩니다(고친 글).'},{key:'contract.body.holiday',value:'■ 공휴일 근무(고친 글)'}];
  const make=async textRows=>{
    const P=await renderAll(hr,{engine:true,textRows,settings:{},probe:true});
    const d=P.makeDom();
    const els={계약종료:'2027-09-30',직종:'위생사',공휴일근무:'포함'};
    const doc={querySelectorAll:sel=>sel==='[data-contract-key]'?Object.entries(els).map(([k,v])=>({dataset:{contractKey:k},value:v})):[]};
    const r=await P.asRole('owner',{$:d.$,document:doc});
    r.ctx.api=r.api;r.api.set('CONTRACT_TEMPLATES',[TEMPLATE]);r.api.set('CONTRACT_TEMPLATE_ID',1);r.api.set('CONTRACT_DRAFT_FIELDS',null);
    d.$('#contractEmployee').value='u1';d.$('#contractDue').value='2026-10-08';
    await r.api.sendContract();
    return r.ctx.sb.writes.find(w=>w[1]==='insert')[2][0].merged_html;
  };
  const changed=await make(rows),plain=await make([]);
  assert.ok(changed.includes('기간이 끝나면 근로관계가 종료됩니다(고친 글).')&&changed.includes('■ 공휴일 근무(고친 글)'));
  assert.ok(plain.includes('기간 만료 시 근로관계는 종료됩니다.')&&plain.includes('■ 설·추석 등 공휴일 근무 포함'));
  assert.notEqual(changed,plain);
  // 이미 보낸 계약의 저장 본문은 두 번 합쳐도 같은 글자(저장된 값이므로 설정과 무관) — 직원 화면은 저장된 값만 보임
  const e1=await renderAll(hr,{engine:true,textRows:rows,settings:{}}),e2=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  assert.equal(e1['emp.render.staff'],e2['emp.render.staff']);
  assert.equal(e1['view.signed'],e2['view.signed']);
  assert.equal(e1['view.plain'],e2['view.plain']);
});

/* ───────────── 5. 만료 알림 일수 ───────────── */
test('만료 알림 일수 검사(hubSettingValidate): 정수 1~365 · 1~5개 · 중복 없음 · 작은 수부터 [14,30,60] 모양으로 저장',()=>{
  const h=helpers(),d=h.HUB_SETTING_DEFS.find(x=>x.key===EXPIRY);
  const ok=(raw,exp)=>{const r=h.hubSettingValidate(d,raw);assert.equal(r.ok,true,JSON.stringify(raw));assert.equal(r.value,exp,JSON.stringify(raw));};
  ok('14,30,60','[14,30,60]');ok('14, 30, 60','[14,30,60]');ok(' 60 30  14 ','[14,30,60]');ok('[14,30,60]','[14,30,60]');ok('[60, 30, 14]','[14,30,60]');ok('7','[7]');ok('1,365','[1,365]');ok('5,10,20,40,80','[5,10,20,40,80]');ok('["7","21"]','[7,21]');ok('030, 014','[14,30]');
  const bad=['','  ','abc','0','366','1000','-3','14.5','14,14','1,2,3,4,5,6','[]','{}','[14,"a"]','[[1,2]]','[null]','[true]','14;30','14，30','[14,','٣٠'];
  for(const raw of bad){const r=h.hubSettingValidate(d,raw);assert.equal(r.ok,false,'거절돼야 함: '+JSON.stringify(raw));assert.ok(r.reason&&r.reason.length>3);}
  assert.equal(h.hubSettingValidate(d,'0').reason,'1부터 365까지만 쓸 수 있어요.');
  assert.match(h.hubSettingValidate(d,'14,14').reason,/같은 일수가 두 번/);
  assert.match(h.hubSettingValidate(d,'1,2,3,4,5,6').reason,/1개부터 5개까지/);
});
test('만료 알림 일수 읽기: 기본 [14,30,60] · 표 값은 작은 수부터 · 모양이 틀리면 기본',()=>{
  const h=helpers();
  const t=raw=>{h.hubSettingSetValues(raw===undefined?{}:{[EXPIRY]:raw});return clone(h.hubContractExpiryDays());};
  assert.deepEqual(t(undefined),[14,30,60]);assert.deepEqual(t('[7,21]'),[7,21]);assert.deepEqual(t('60,30,14'),[14,30,60]);assert.deepEqual(t('[10]'),[10]);assert.deepEqual(t('[5,10,20,40,80]'),[5,10,20,40,80]);
  for(const bad of ['','abc','0','366','[]','1,2,3,4,5,6','14,14','[14,"a"]'])assert.deepEqual(t(bad),[14,30,60],'잘못된 값 → 기본값: '+JSON.stringify(bad));
  assert.deepEqual(clone(h.hubSettingIntList('없는.키')),[]);
});
test('만료 알림 분류(hr.html): 가장 작은 수=긴급 · 두 번째=경고 · 나머지=예정, 기본 14·30·60이면 옛 경계와 같고 엔진이 없어도 같다',()=>{
  const block=hr.match(/\/\* contract-expiry:test-start \*\/([\s\S]*?)\/\* contract-expiry:test-end \*\//)[1];
  const mk=days=>{const c={};if(days)c.hubContractExpiryDays=()=>days;vm.createContext(c);vm.runInContext(block,c);return (end)=>clone(c.contractExpiryInfo({fields:{계약종료:end},status:'서명완료'},'2026-10-01'));};
  const D=n=>{const d=new Date(Date.UTC(2026,9,1+n));return d.toISOString().slice(0,10);};
  const kinds=(f,list)=>list.map(n=>{const r=f(D(n));return r?r.kind:null;});
  const probe=[-1,0,5,7,8,14,15,20,21,22,30,31,45,60,61,90];
  assert.deepEqual(kinds(mk(null),probe),['expired','urgent','urgent','urgent','urgent','urgent','warning','warning','warning','warning','warning','upcoming','upcoming','upcoming',null,null],'엔진 없음 = 기본 14·30·60');
  assert.deepEqual(kinds(mk([14,30,60]),probe),kinds(mk(null),probe));
  const N=n=>Array(n).fill(null);
  assert.deepEqual(kinds(mk([7,21]),probe),['expired','urgent','urgent','urgent','warning','warning','warning','warning','warning',...N(7)],'2개면 긴급·경고만(8~21일은 경고, 22일부터 알림 없음)');
  assert.deepEqual(kinds(mk([10]),probe),['expired','urgent','urgent','urgent','urgent',...N(11)],'1개면 긴급만');
  assert.deepEqual(kinds(mk([5,10,20,40,80]),[3,5,6,10,11,20,21,40,41,80,81]),['urgent','urgent','warning','warning','upcoming','upcoming','upcoming','upcoming','upcoming','upcoming',null],'5개면 앞 둘이 긴급·경고, 나머지는 모두 예정(가장 큰 수까지)');
  assert.equal(mk([14,30,60])('기간의 정함 없음'),null);assert.equal(mk([14,30,60])('').kind,'review');
});
test('만료 알림 일수가 화면에 반영됨: 알림 목록의 단계·「N일 안에 …없습니다」 글의 N은 가장 큰 일수 · 못 읽으면 14·30·60·60일',async()=>{
  const kindsOf=async raw=>JSON.parse((await renderAll(hr,{engine:true,textRows:[],settings:raw===undefined?{}:{[EXPIRY]:raw}}))['pure.alerts_kinds']).map(k=>[k[0],k[1]]);
  // 시험 자료: 1번 만료(-3일) · 5번 종료일 없음(확인 필요) · 2번 9일 · 3번 24일 · 4번 50일 · 6번 퇴사자(알림 제외)
  assert.deepEqual(await kindsOf(),[[1,'expired'],[5,'review'],[2,'urgent'],[3,'warning'],[4,'upcoming']],'기본 14·30·60');
  assert.deepEqual(await kindsOf('[7,21]'),[[1,'expired'],[5,'review'],[2,'warning']]);
  assert.deepEqual(await kindsOf('[10,30]'),[[1,'expired'],[5,'review'],[2,'urgent'],[3,'warning']]);
  assert.deepEqual(await kindsOf('[10]'),[[1,'expired'],[5,'review'],[2,'urgent']]);
  assert.deepEqual(await kindsOf('[5,10,25,60]'),[[1,'expired'],[5,'review'],[2,'warning'],[3,'upcoming'],[4,'upcoming']]);
  assert.deepEqual(await kindsOf('zzz'),await kindsOf(),'모양이 틀리면 기본 14·30·60');
  const text=async raw=>JSON.parse((await renderAll(hr,{engine:true,textRows:[],settings:raw===undefined?{}:{[EXPIRY]:raw}}))['pure.alerts_card'])[1];
  assert.ok((await text('[7,21]')).includes('21일 안에 만료되거나 확인이 필요한 계약이 없습니다.'));
  assert.ok((await text('[100,200]')).includes('200일 안에 만료되거나'));
  assert.ok((await text('zzz')).includes('60일 안에 만료되거나'));
  assert.ok((await text()).includes('60일 안에 만료되거나'));
  // 허브 배지·계약 화면이 같은 계산(contractExpiryRows → contractExpiryInfo)을 씀
  assert.equal([...hr.matchAll(/contractExpiryRows\(/g)].length,3,'정의 1 + 사용 2(허브 시작 때 배지 · 계약 화면)');
});

/* ───────────── 6. 허브 설정 화면 ───────────── */
function ui(opts){
  const handlers={},registry={},{sb,state}=fakeSb(opts);
  function attrs(html,name){const out=[];const re=new RegExp('data-'+name+'(?:="([^"]*)")?','g');let m;while((m=re.exec(html)))out.push(m[1]==null?'':m[1]);return out;}
  function listAll(el,sel){
    const m=sel.match(/^\[data-([\w-]+)\]$/);if(!m)return [];
    return attrs(el.innerHTML,m[1]).map(function(v){return {addEventListener(t,f){handlers['['+m[1]+']='+v+'|'+t]=f;},getAttribute(){return v;}};});
  }
  function makeEl(key){const el={innerHTML:'',value:'',textContent:'',hidden:false,addEventListener(t,f){handlers[key+'|'+t]=f;},querySelector(sel){return getEl(sel);},querySelectorAll(sel){return listAll(el,sel);},getAttribute(){return '';}};return el;}
  function getEl(sel){if(sel[0]==='#'){registry[sel]=registry[sel]||makeEl(sel);return registry[sel];}return {addEventListener(t,f){handlers[sel.replace('[data-','[')+'|'+t]=f;}};}
  const rootEl=makeEl('root');
  const ctx={window:{},document:{head:{appendChild(){}},createElement(){return {};}}};
  vm.createContext(ctx);vm.runInContext(js,ctx);
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
  return {ctx,root:rootEl,section:getEl('#hubSection'),el:getEl,sb,state,settle,has(k){return (k+'|click') in handlers;},
    async click(key){const r=handlers[key+'|click']();await settle();return r;},
    async render(me){await ctx.window.HubUi.renderSettings(rootEl,{sb,me});await settle();}};
}
const OWNER={id:'o1',role:'owner'};
test('화면: 🔢 숫자·기준에 「📝 근로계약 기준」 칸이 있고 만료 일수는 「14, 30, 60」 모양 글 입력칸 — 잘못된 값은 DB 호출 없이 거절, 저장은 [14,30,60] 모양, 되돌리기',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,28);
  assert.ok(sec.includes('📝 근로계약 기준'));
  assert.match(sec,/id="hubSetIn_18" type="text" inputmode="numeric" size="16" placeholder="14, 30, 60" value="14, 30, 60"> 일 \(쉼표로 나눠 적어요\)/);
  assert.match(sec,/처음 값 14, 30, 60 · 숫자 1~5개, 각각 1~365 사이/);
  assert.match(sec,/이름표: contract\.expiry_alert_days/);
  assert.ok(!/id="hubSetBadge_18"><span class="b ok">고침/.test(sec),'처음에는 고침 표시 없음');
  const before=t.state.calls.length;
  for(const bad of ['','abc','0','366','14,14','1,2,3,4,5,6','14.5']){
    t.el('#hubSetIn_18').value=bad;await t.click('[hub-set-save]=18');
    assert.match(t.el('#hubSetMsg_18').textContent,/저장하지 못했어요/,bad);
  }
  assert.equal(t.state.calls.length,before,'잘못된 값은 DB를 부르지 않음');
  t.el('#hubSetIn_18').value=' 60, 30 ,14';await t.click('[hub-set-save]=18');
  let up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.deepEqual(clone(up.map(u=>u.payload)),[{key:EXPIRY,value:'[14,30,60]'}],'순서를 바꿔 적어도 작은 수부터 [14,30,60]');
  assert.equal(t.el('#hubSetIn_18').value,'14, 30, 60');
  assert.ok(!/고침/.test(t.el('#hubSetBadge_18').innerHTML),'기본 일수와 같으면 고침 표시 없음');
  t.el('#hubSetIn_18').value='7, 21';await t.click('[hub-set-save]=18');
  up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.equal(up[1].payload.value,'[7,21]');
  assert.equal(t.el('#hubSetIn_18').value,'7, 21');
  assert.match(t.el('#hubSetBadge_18').innerHTML,/고침/);
  assert.equal(t.el('#hubSetMsg_18').textContent,'저장했어요.');
  await t.click('[hub-set-reset]=18');
  assert.equal(t.state.settings.find(r=>r.key===EXPIRY).value,'[14,30,60]','되돌리기는 기본값을 다시 적음(설정 표는 지울 수 없음)');
  assert.equal(t.el('#hubSetIn_18').value,'14, 30, 60');
  assert.ok(!/고침/.test(t.el('#hubSetBadge_18').innerHTML));
  // 다시 열면 저장된 값이 보임
  const t2=ui({settings:[{key:EXPIRY,value:'[10,20]'}]});
  await t2.render(OWNER);await t2.click('[hub-subtab]=settings');
  assert.match(t2.section.innerHTML,/id="hubSetIn_18" type="text"[^>]*value="10, 20"/);assert.match(t2.section.innerHTML,/id="hubSetBadge_18"><span class="b ok">고침<\/span>/);
  const t3=ui({settings:[{key:EXPIRY,value:'깨짐'}]});
  await t3.render(OWNER);await t3.click('[hub-subtab]=settings');
  assert.match(t3.section.innerHTML,/id="hubSetIn_18" type="text"[^>]*value="깨짐"/,'깨진 값은 그대로 보여 주되(원장이 고치도록)');
  assert.ok(!/id="hubSetBadge_18"><span class="b ok">고침/.test(t3.section.innerHTML),'실제로는 기본값으로 읽히므로 고침 표시 없음');
});
test('화면: 글 고치기에 근로계약서 5개 묶음(188개)이 접혀 나오고, 계약서 본문 문구는 저장 전에 한 번 확인한다',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  for(const name of ['📝 근로계약서 › 새 계약서 쓰기·미리보기','📝 근로계약서 › 발송·반려·원본 PDF','📝 근로계약서 › 계약 목록·계약기간·만료 알림','📝 근로계약서 › 직원 서명 화면','📝 근로계약서 › 계약서 본문 기본 문구'])assert.ok(sec.includes('data-hub-group="'+name+'"'),name);
  assert.match(sec,/이름표: contract\.body\.fixed_term/);assert.match(sec,/⚠️ 새로 만드는 계약서 본문에 들어가는 글이에요/);
  const idxOf=key=>Number(sec.match(new RegExp('data-hub-text-row="(\\d+)">(?:(?!data-hub-text-row)[^])*?이름표: '+key.replace(/\./g,'\\.')+'(?![a-z_])'))[1]);
  // 계약서 본문 문구: 확인창에서 취소하면 저장 안 함, 확인하면 저장
  const bi=idxOf('contract.body.fixed_term');
  let asked=0;
  t.ctx.window.confirm=m=>{asked++;assert.match(m,/앞으로 새로 만드는 근로계약서 본문에 들어가는 법적 문구예요\(이미 발송·서명한 계약서는 안 바뀌어요\)/);return false;};
  t.el('#hubTxtIn_'+bi).value='기간이 끝나면 종료됩니다.';await t.click('[hub-text-save]='+bi);
  assert.equal(asked,1);assert.equal(t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert').length,0,'확인창에서 취소하면 저장하지 않음');
  assert.equal(t.el('#hubTxtMsg_'+bi).textContent,'저장하지 않았어요.');
  t.ctx.window.confirm=()=>true;
  await t.click('[hub-text-save]='+bi);
  let up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.deepEqual(clone(up.map(u=>u.payload)),[{key:'contract.body.fixed_term',value:'기간이 끝나면 종료됩니다.'}]);
  assert.equal(t.el('#hubTxtMsg_'+bi).textContent,'저장했어요.');
  // 기본으로 되돌리기·기본 글과 같게 저장은 확인 없이
  asked=0;t.ctx.window.confirm=()=>{asked++;return false;};
  await t.click('[hub-text-reset]='+bi);
  assert.equal(asked,0);assert.equal(t.state.texts.length,0);
  // 화면 글(본문이 아닌 글)은 확인 없이 바로 저장
  const ti=idxOf('contract.al_title');
  t.el('#hubTxtIn_'+ti).value='⏰ 만료 곧';await t.click('[hub-text-save]='+ti);
  assert.equal(asked,0);up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.equal(up[up.length-1].payload.key,'contract.al_title');
  // 검색: 「소급」이 아니라 화면에 보이는 낱말로 찾음
  const h=helpers(),hits=q=>h.hubTextDefs().filter(d=>h.hubTextMatches(d,q,null)).map(d=>d.key);
  assert.ok(hits('만료 확인').includes('contract.al_title'));assert.ok(hits('기간 만료 시 근로관계').includes('contract.body.fixed_term'));assert.ok(hits('원본 PDF 해시').includes('contract.pdf_btn'));assert.ok(hits('서명 기간').includes('contract.m_expired'));
});

/* ───────────── 7. 안 옮긴 것 · 기존 시험이 찾는 줄 ───────────── */
test('안 옮긴 것: 법적 동의 확인창·서명 구역 이름·임금 항목 이름·직무 분류 안내 등은 코드에 그대로 · 기존 시험이 줄 모양을 찾는 곳은 그대로',()=>{
  // 법적 동의 문장(기존 시험이 confirm('… 줄 모양을 찾음)
  assert.ok(hr.includes("if(!confirm('원본 PDF를 확인했고, 아래 좌표에 본인 서명을 넣어 완료 PDF를 만드는 것에 동의합니까?'))return;"));
  assert.ok(hr.includes("if(!confirm('근로계약·의료정보 보안·개인정보 취급자 서약을 각각 확인하고 세 서명을 완료합니까?'))return;"));
  // 이미 저장되는 서명 본문·서명 구역 이름·임금 항목 이름은 DB·PDF와 묶여 있어 안 옮김
  assert.ok(hr.includes('alt="직원 서명"'));
  assert.ok(hr.includes("const CONTRACT_PARTS=[['employment','근로계약'],['medical','의료정보 보안 서약'],['privacy','개인정보 취급자 서약']];"));
  assert.ok(hr.includes("const CONTRACT_WAGE_PARTS=[['기본급','기본급','기본급산정시간'],['식대','식대(비과세)'],"));
  assert.ok(hr.includes('직무 분류 참고: 미지정</div>'));
  // 기존 시험이 찾는 줄
  assert.ok(hr.includes("CONTRACT_FLASH=finalSend?'발송했습니다.':'원장에게 최종 발송을 요청했습니다.';"));
  assert.ok(hr.includes("CONTRACT_FLASH='수정 후 발송했습니다.';")&&hr.includes("CONTRACT_FLASH='최종 발송을 완료했습니다.';")&&hr.includes("CONTRACT_FLASH='발송 요청을 반려했습니다.';"));
  assert.ok(hr.includes('<div class="msg" id="contractMsg">${contractFlash?esc(contractFlash):\'\'}</div>'));
  assert.ok(hr.includes("if(!confirm(`'${name}' 설정을 지울까요?`))return;"));
  assert.ok(hr.includes("const name=prompt('설정 이름을 입력하세요.');"));
  assert.match(hr,/ME\.role==='owner'\?`<div class="card"><h2>🖋 원장 최종 발송 대기[\s\S]*onclick="rejectContractSend\(\$\{r\.id\}\)"/);
  assert.match(hr,/계약 종료일을 입력하거나 '기간의 정함 없음'을 선택하세요\./);
  assert.match(hr,/initContractSignatures\(\);\s*autoLoadStoredContractSignatures\(ownRows\)/);
  assert.ok(hr.includes('<h2>⏰ 근로계약 만료 확인')||hr.includes("'⏰ 근로계약 만료 확인'"));
  // 계약서 작성 미리보기(별도 화면)는 이번에 안 건드림 — 허브·DB와 이어지지 않는 독립 파일
  assert.ok(!read('contract-preview.html').includes('hubText'));
  // 로그인 직원 허브 밖: 푸시·Edge 글은 차례 7 이후(이 파일에서 안 옮김)
  assert.ok(!js.includes("push-dispatcher"));
});
test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장)',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_6.sql')),false);
  const SEC=String.fromCharCode(0xA7); // 섹션 기호는 어디에도 쓰지 않는 규칙(이 파일에도 글자 그대로는 안 씀)
  assert.ok(!js.includes(SEC)&&!hr.includes(SEC));
  for(const f of ['tests/fixtures/hub6-harness.cjs','tests/hub-ui-texts-6.test.js','tests/manual/make-hub6-golden.cjs','tests/sql/pglite-hub-ui-texts-6.mjs'])assert.ok(!read(f).includes(SEC),f);
});
test('hr.html·hub-texts.js·이 시험 파일의 한글이 깨지지 않고 UTF-8로 저장돼 있다',()=>{
  const bad=Buffer.from([0xEF,0xBF,0xBD]);
  for(const f of ['hr.html','hub-texts.js','tests/hub-ui-texts-6.test.js','tests/fixtures/hub6-harness.cjs'])assert.equal(fs.readFileSync(path.join(root,f)).includes(bad),false,f+' 에 UTF-8 깨짐(교체 문자)이 있습니다.');
  assert.ok(!js.startsWith('\uFEFF'));
  for(const m of hr.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
  new vm.Script(js);
});
