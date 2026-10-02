// 직원허브 「⚙️ 허브 설정」 차례 7(마지막) 시험 — 급여·AI비용(마케팅비·사용량 현황판)·원장 보기판·진료기록·입금·홈 글, 계정·권한 위험 작업 확인창,
// 직무 분류 관리 글, 저장 상태 글, 결제 금액 단위·계약서 미리보기 창 이름·결재/계약 상태 이름, 화면 표시 건수·일수 숫자 8개와 이름 목록 7개를 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 모든 화면·메시지·알림창·확인창이 옛 화면(f95b951)과 글자 하나까지 같음(5가지 상태)
//       ②표에 값이 있으면 그 글(이스케이프 · {자리표시자}) ③계산식 숫자(세율·식대 한도·4대보험 절사·야간 시간대)·엑셀 열 이름·급여 항목 이름은 한 글자도 안 바뀜
//       ④상태·종류 이름은 이름만 바뀌고 저장되는 값(코드)·색은 그대로 ⑤기존 시험이 줄 모양을 찾는 글은 줄을 그대로 두고 고쳤을 때만 바꿔 넣음.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll}=require('./fixtures/hub7-harness.cjs');
const golden=JSON.parse(read('tests/fixtures/hub7-golden-f95b951.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const CH7=/^(home|dep|cf|aic|mkt|aiu|ob|pay|slip|acct|jg|save|payreq|empdoc)\./;
const COUNT=329+2;   // 차례 7 글 329 + 원장 보기판 넷째 판 「📥 인박스 경고」 2(ob.inbox_title·ob.inbox_desc, 2026-10-02)
/* 2026-10-02 원장 보기판에 넷째 판(📥 인박스 경고)을 더함 — 옛 화면(f95b951)과의 차이는 기본 글 카드 한 장뿐이어야 한다.
   옛 화면 대조는 그 카드(그대로·JSON 한 번·두 번 감싼 꼴)만 빼고 글자 하나까지 같은지 본다. 카드가 실제로 붙는지는 아래 따로 시험. */
const INBOX_CARD='<button type="button" class="card owner-board-card" data-owner-board="inbox" onclick="openOwnerBoard(\'inbox\')"><strong>📥 인박스 경고</strong><span>AI가 남긴 최근 경고·대기</span><small>아직 PC에서 올라오지 않음</small></button>';
const esc1=s=>JSON.stringify(s).slice(1,-1);
const INBOX_FORMS=[INBOX_CARD,esc1(INBOX_CARD),esc1(esc1(INBOX_CARD))];
const dropInbox=out=>Object.fromEntries(Object.entries(out).map(([k,v])=>[k,typeof v==='string'&&k.startsWith('ob.')?INBOX_FORMS.reduce((s,f)=>s.split(f).join(''),v):v]));
const NUM_KEYS=['home.payslip_limit','dep.list_limit','aic.history_months','aic.auto_limit','aiu.model_days','aiu.cost_months','aiu.external_days','aiu.session_limit'];
const LIST_KEYS=['list.approval_status','list.contract_status','list.pay_wage_types','list.marketing_categories','list.ai_billing_platforms','list.ai_cost_platforms','list.ai_external_names'];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block);
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubSetting,hubSettingChecked,hubSettingSetValues,hubSettingValidate,hubSettingSave,hubSettingReset,hubList,hubListValidate,hubListSave,HUB_SETTING_DEFS,HUB_LIST_DEFS,hubTextDefs,hubTextDefByKey,hubTextMatches,hubTextSetOverrides};',c);
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
const ch7Defs=()=>helpers().hubTextDefs().filter(d=>CH7.test(d.key));
const allOut=out=>Object.values(out).join('\n');
const J=x=>JSON.parse(x);
const run=(textRows,settings,o)=>renderAll(hr,Object.assign({engine:true,textRows:textRows||[],settings:settings||{}},o||{}));
const runOld=(textRows,settings,o)=>run(textRows,settings,o).then(dropInbox);

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 7 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 14개·331개(차례 7 329 + 인박스 판 2) · 명세서 서식·위험 확인창은 ⚠️ 안내로 시작',()=>{
  const defs=ch7Defs();
  assert.equal(defs.length,COUNT,'차례 7 글 키 수');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.deepEqual(clone(screens),['🏠 홈','💰 입금','🔒 진료기록','💰 AI비용 › 사용량 현황판','📒 원장 보기판','💰 AI비용 › 마케팅비','💰 AI비용 › 실제 청구액','💰 급여 › 급여대장·시급설정','💰 급여 › 명세서 화면','💰 급여 › 명세서 서식(발행할 때부터 적용)','🛡️ 계정·권한 관리 › 위험 작업 확인창','🧩 직무 분류 관리','💾 저장 상태 글(허브 맨 위)','📎 내 서류함 › 결제 금액 단위·계약서 미리보기 창']);
  const slip=defs.filter(d=>d.key.startsWith('slip.'));
  assert.equal(slip.length,27);
  for(const d of slip)assert.ok(d.where.startsWith('⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요. 이미 발행한 명세서(직원이 보는 것)는 안 바뀌고'),d.key+' 이미 발행한 명세서는 안 바뀐다는 경고');
  const acct=defs.filter(d=>d.key.startsWith('acct.'));
  assert.equal(acct.length,4);
  for(const d of acct)assert.ok(d.where.startsWith('⚠ 계정에 큰 영향을 주는 작업 직전에 뜨는 확인창이에요. 「영구」·「되돌릴 수 없음」'),d.key);
  // 앞 차례 키와 겹치지 않음
  const h=helpers();
  const earlier=h.hubTextDefs().filter(d=>!CH7.test(d.key));
  assert.equal(earlier.length+COUNT,h.hubTextDefs().length);
});
test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:hubT|h7T|hubTE|acctT|jgT)\(\s*'((?:home|dep|cf|aic|mkt|aiu|ob|pay|slip|acct|jg|save|payreq|empdoc)\.[a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(hr))){
    const v=vm.runInNewContext(m[2]);
    if(found.has(m[1]))assert.equal(found.get(m[1]),v,m[1]+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(m[1],v);
  }
  const defs=h.hubTextDefs().filter(d=>CH7.test(d.key));
  for(const d of defs){
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of found.keys())assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  assert.equal(found.size,COUNT);
});
test('숫자 8개·이름 목록 7개: 기본값이 화면 코드와 같고, 화면 표시용 숫자만(계산식 숫자는 없음) · 캐시 번호',()=>{
  const h=helpers();
  assert.equal(h.HUB_SETTING_DEFS.length,28);
  const S=k=>h.HUB_SETTING_DEFS.find(d=>d.key===k);
  const expect={'home.payslip_limit':['12',1,36,'개월'],'dep.list_limit':['300',50,1000,'건'],'aic.history_months':['6',1,24,'개월'],'aic.auto_limit':['20',5,100,'건'],'aiu.model_days':['7',3,30,'일'],'aiu.cost_months':['6',2,24,'개월'],'aiu.external_days':['14',3,60,'일'],'aiu.session_limit':['8',3,30,'건']};
  for(const k of NUM_KEYS){
    const d=S(k);assert.ok(d,k);
    assert.deepEqual(clone([d.def,d.min,d.max,d.unit,d.kind]),[...expect[k],'int'],k);
    const re=new RegExp("\\b(?:hubN|h7N)\\('"+k.replace(/\./g,'\\.')+"',(\\d+)\\)",'g');
    const uses=[...hr.matchAll(re)];
    assert.ok(uses.length>=1,k+' 가 화면에서 읽힘');
    for(const u of uses)assert.equal(u[1],d.def,k+' 화면 코드의 기본 숫자');
  }
  // 목록 기본값 = 화면 코드의 기본 목록
  const L=k=>h.HUB_LIST_DEFS.find(d=>d.key===k);
  const evalList=re=>vm.runInNewContext(hr.match(re)[1]);
  assert.deepEqual(clone(L('list.approval_status').def),clone(evalList(/function approvalStatusLabel\(c\)\{const def=(\[[^\n]*?\]);/)));
  assert.deepEqual(clone(L('list.contract_status').def),clone(evalList(/function contractStatusLabel\(c\)\{const def=(\[[^\n]*?\]);/)));
  assert.deepEqual(clone(L('list.pay_wage_types').def),clone(evalList(/function payWageTypeLabel\(c\)\{const def=(\[[^\n]*?\]);/)));
  const mk=vm.runInNewContext(hr.match(/const MARKETING_CHANNELS=(\[[^\n]*?\]);/)[1]);
  assert.deepEqual(clone(L('list.marketing_categories').def.map(i=>[i.code,i.label])),clone([...mk,['not_marketing','마케팅 아님']]));
  assert.deepEqual(clone(L('list.ai_billing_platforms').def.map(i=>i.code)),clone(vm.runInNewContext(hr.match(/const AICOST_PLATFORMS=(\[[^\n]*?\]);/)[1])));
  const obj=re=>vm.runInNewContext('('+hr.match(re)[1]+')');
  assert.deepEqual(clone(Object.fromEntries(L('list.ai_cost_platforms').def.map(i=>[i.code,i.label]))),clone(obj(/const AI_COST_LABELS=(\{[^\n]*?\});/)));
  assert.deepEqual(clone(Object.fromEntries(L('list.ai_external_names').def.map(i=>[i.code,i.label]))),clone(obj(/const AI_EXTERNAL_LABELS=(\{[^\n]*?\}),AI_EXTERNAL_COST_SINCE/)));
  for(const k of LIST_KEYS){
    const d=L(k);assert.ok(d,k);assert.equal(d.addable,false,k+' 코드와 묶여 새 항목은 못 늘림');
    assert.ok(d.where&&d.note&&d.screen);
    assert.equal(h.hubListValidate(d,d.def).ok,true,k+' 기본 목록은 저장 검사를 통과');
  }
  assert.match(hr,/hub-texts\.js\?v=2026100301/,'캐시 번호를 새 값으로 올림(차례 6에서 2026100112 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-02 인박스 판에서 → 2026100223)');
  assert.ok(!/hub-texts\.js\?v=2026100112/.test(hr));
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 모든 화면·메시지·알림창·확인창이 옛 화면(f95b951)과 글자 하나까지 같다',async()=>{
  const out=dropInbox(await renderAll(hr,{engine:false}));
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
  assert.ok(Object.keys(golden).length>=140,'대조 항목 수');
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('원장 보기판 넷째 판(📥 인박스 경고): 기본 글 카드가 판 목록 끝에 한 장씩 붙고, 옛 화면과 다른 곳은 그 카드뿐이다',async()=>{
  const out=await renderAll(hr,{engine:false});
  const panels=J(out['ob.panel']);
  assert.equal(panels.length,6);
  for(const p of panels){
    assert.equal(p.split(INBOX_CARD).length-1,1,'판 목록마다 인박스 카드 한 장');
    assert.ok(p.includes(INBOX_CARD+'</div><div id="ownerBoardViewer" hidden></div>'),'세 판 다음(목록 끝)');
  }
  for(const k of ['ob.render.owner','ob.render.owner_missing','ob.render.owner_err'])assert.equal(out[k].split(esc1(INBOX_CARD)).length-1,1,k+' 원장 화면에 한 장');
  assert.ok(!out['ob.render.nonowner'].includes('inbox'),'원장이 아니면 카드 없음');
  const changed=Object.keys(golden).filter(k=>out[k]!==golden[k]).sort();
  assert.deepEqual(changed,['ob.panel','ob.render.owner','ob.render.owner_err','ob.render.owner_missing'],'카드가 붙는 곳 말고는 그대로');
});
test('기본값만 있을 때: 엔진을 못 불러와 hr.html의 대비책(shim)만 있어도 옛 화면과 같다',async()=>{
  const out=dropInbox(await renderAll(hr,{engine:false,shim:true}));
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('기본값만 있을 때: 엔진이 있고 표가 비어 있어도 옛 화면과 같다',async()=>{
  const out=await runOld([],{});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('표를 못 읽어도(읽기 실패) 옛 화면과 같다 — 기본값으로 조용히 동작',async()=>{
  const out=await runOld(null,{},{loadFail:true,textRows:undefined});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('잘못된 값이 들어 있어도(숫자가 글자·범위 밖·소수, 목록이 깨짐·코드 빠짐·이름 빔, 글이 공백뿐) 옛 화면과 같다',async()=>{
  for(const bad of ['abc','0','-1','1.5','99999','','  ','[]','1e3']){
    const settings=Object.fromEntries(NUM_KEYS.map(k=>[k,bad]));
    const out=await runOld([],settings);
    for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k+' ← 숫자 '+JSON.stringify(bad));
  }
  const badLists=['깨짐','[]','{"a":1}','[{"code":"zzz","label":"새 코드만"}]','[{"code":"진행","label":""}]','[{"code":"monthly","label":"월급"}]','[1,2]','null'];
  for(const bad of badLists){
    const settings=Object.fromEntries(LIST_KEYS.map(k=>[k,bad]));
    const out=await runOld([],settings);
    for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k+' ← 목록 '+bad);
  }
  const blanks=ch7Defs().map(d=>({key:d.key,value:'  \n '}));
  const out=await runOld(blanks,{});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k+' ← 글이 공백뿐');
  const same=await runOld([],Object.fromEntries(NUM_KEYS.map(k=>[k,' '+({'home.payslip_limit':'12','dep.list_limit':'300','aic.history_months':'6','aic.auto_limit':'20','aiu.model_days':'7','aiu.cost_months':'6','aiu.external_days':'14','aiu.session_limit':'8'})[k]+' '])));
  for(const k of Object.keys(golden))assert.equal(same[k],golden[k],k+' 기본 숫자를 공백 섞어 적음');
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다(홈·입금·진료기록·AI비용·보기판·급여·명세서·확인창·직무 분류·상태 글 각각)',async()=>{
  const cases=[['home.greeting','home.manager'],['home.undone_alert','home.staff'],['home.inbox_open','home.manager'],['dep.warn','dep.owner_month'],['cf.m_missing','conf.submit_missing'],['aiu.model_hint','aiu.panels'],['ob.png_note','ob.open.ok_busd'],['mkt.rules_hint','mkt.panel_ok'],['aic.hint','aicost.full'],['pay.m_xls_read','pay.preview.ok'],['pay.c_archive','pay.month.archive_ok'],['slip.foot_note','slip.html'],['acct.c_block','acct.block_ok'],['jg.legend','jg.render.normal'],['jg.f_perm','jg.save.err_perm'],['save.error','status.tag'],['payreq.unit_won','payreq.card'],['empdoc.preview_title','empdoc.preview'],['mkt.cancel_tag','mkt.panel_ok'],['pay.th_srcname','pay.ledger.rows']];
  for(const [key,outKey] of cases){
    const from="'"+key+"','";
    assert.ok(hr.includes(from),'바꿀 곳을 못 찾음: '+key);
    const c=hr.split(from).join(from+'!');
    assert.notEqual(c,hr);
    assert.notEqual((await renderAll(c,{engine:false}))[outKey],golden[outKey],outKey+' ← '+key);
  }
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 고쳐 쓰는 글 331개(차례 7 329 + 인박스 판 2)가 모두 화면에서 나오고, {자리표시자}가 채워진다',async()=>{
  const defs=ch7Defs();
  const out=await run(dynRows(defs),{});
  const all=allOut(out);
  const missing=defs.filter(d=>!all.includes('«'+d.key+'»')).map(d=>d.key);
  assert.deepEqual(clone(missing),[],'값을 넣었는데 화면에 안 나오는 키');
  assert.ok(!/«[a-z0-9_.]+»[^«»\n"\\]{0,80}\{[a-z_]+\}/.test(all),'{자리표시자}가 채워지지 않고 남음');
});
test('표에 값이 있으면 그 글: 구체적인 예(홈·입금·진료기록·보기판·AI비용·급여·명세서·확인창·직무 분류·저장 상태) + HTML은 이스케이프',async()=>{
  const rows=[
    {key:'home.greeting',value:'반가워요 {name} <b>님</b>'},{key:'home.undone_alert',value:'서류 {n}개 남음!'},{key:'home.inbox_open',value:'문의 보러 가기'},{key:'home.inbox_new',value:'새 문의 {n}개'},{key:'home.inbox_err',value:'요약 못 가져옴'},{key:'home.consult_hint',value:'상담 안내 글'},{key:'home.consult_open',value:'상담 보러 가기'},{key:'home.slip_btn',value:'열기'},
    {key:'dep.title',value:'💰 입금 내역 <표>'},{key:'dep.btn_week',value:'일주일'},{key:'dep.card_est',value:'💳 카드'},
    {key:'cf.title',value:'🔒 기록'},{key:'cf.m_fail',value:'{detail} 때문에 못 저장'},
    {key:'ob.busd_title',value:'📒 장부 <판>'},{key:'ob.synced',value:'올라온 시각 {when}'},{key:'ob.not_synced',value:'아직 안 올라옴'},
    {key:'aic.title',value:'💰 AI 비용 <표>'},{key:'aic.hist_title',value:'지난 {n}달 청구액'},{key:'aic.hint',value:'"직접"은 원장 값 & 설명'},
    {key:'mkt.count',value:'{n} 건'},{key:'mkt.title',value:'📣 광고비'},{key:'aiu.model_title',value:'모델 사용량({days}일)'},{key:'aiu.cost_basis',value:'기준 {generated} / 환율 {fx}'},
    {key:'pay.title',value:'💰 월급 <관리>'},{key:'pay.tab_wage',value:'시급'},{key:'pay.m_xls_read',value:'엑셀 {n}줄 읽음'},{key:'pay.counts',value:'저장 {saved} · 보관 {archived}'},{key:'pay.c_move',value:'{from} → {to} 로 옮길까요?'},
    {key:'slip.doc_title',value:'급여 명세 <서>'},{key:'slip.unit_hours',value:'{n}h'},{key:'slip.th_name',value:'이름'},
    {key:'acct.c_block',value:'{name} 접속을 막을까요?'},{key:'acct.c_delete',value:'{name} 님 계정을 지울까요?'},{key:'acct.c_revoke',value:'{name} 승인을 취소할까요?'},
    {key:'jg.title',value:'직무 나누기'},{key:'jg.unassigned',value:'정해지지 않음 {n}명'},{key:'jg.f_perm',value:'권한이 없어요'},{key:'jg.m_ok',value:'{n}명 저장됨'},
    {key:'save.saving',value:'저장하는 중'},{key:'save.saved',value:'저장 끝'},{key:'save.auto',value:'자동으로 저장돼요'},{key:'save.error',value:'저장 안 됨'},
    {key:'payreq.unit_won',value:' 원정'},{key:'empdoc.preview_title',value:'계약서 창 <1>'}
  ];
  const out=await run(rows,{});
  // 홈(줄 모양을 기존 시험이 찾는 글도 고친 글로 바뀜)
  const hm=J(out['home.manager'])[0];
  assert.match(hm,/<h2>반가워요 이매니저 &lt;b&gt;님&lt;\/b&gt;<\/h2>/);assert.ok(!hm.includes('<b>님</b>'));
  assert.ok(hm.includes('서류 1개 남음!')&&!hm.includes('⚠ 미제출 서류 1개 — [내 서류함] 탭에서 제출하세요.'));
  assert.ok(hm.includes('onclick="go(\'inbox\')">문의 보러 가기</button>'));assert.ok(hm.includes('새 문의 2개'));
  assert.ok(hm.includes('<div class="hint">상담 안내 글</div>'));assert.ok(hm.includes('onclick="go(\'consult\')">상담 보러 가기</button>'));
  assert.ok(hm.includes('>열기</button>'));
  assert.ok(J(out['home.inbox_error'])[0].includes('요약 못 가져옴'));
  assert.match(J(out['dep.owner_month'])[0],/<h2>💰 입금 내역 &lt;표&gt;<\/h2>/);assert.ok(J(out['dep.owner_month'])[0].includes('>일주일</button>'));assert.ok(J(out['dep.owner_month'])[0].includes('💳 카드 <span class="sub">카드사&lt;x&gt;</span>'));
  assert.match(J(out['conf.owner'])[0],/<h2>🔒 기록<\/h2>/);assert.match(J(out['conf.submit_fail'])[0].join('|'),/권한<없음> 때문에 못 저장/);
  assert.ok(out['ob.panel'].includes('📒 장부 &lt;판&gt;'));assert.ok(!out['ob.panel'].includes('📒 장부 <판>'));
  assert.ok(J(out['ob.open.ok_busd'])[0][1].includes('올라온 시각 2026.9.30 오전 10시 2분'));
  assert.ok(J(out['ob.open.err'])[0].join('').includes('판을 불러오지 못했습니다: 판&lt;오류&gt;'),'안 고친 글은 그대로');
  assert.ok(J(out['ob.open.ok_pin_nosynced'])[0][1].includes('올라온 시각 확인되지 않음'));
  // AI비용
  const ai=J(out['aicost.full'])[0];
  assert.match(ai,/<h2>💰 AI 비용 &lt;표&gt; <span class="sub">\(원장 전용\)<\/span><\/h2>/);assert.ok(ai.includes('지난 6달 청구액'));
  assert.ok(ai.includes('<div class="hint">"직접"은 원장 값 &amp; 설명</div>'),'따옴표는 그대로 · &는 이스케이프');
  assert.ok(ai.includes('📣 광고비')&&ai.includes('모델 사용량(7일)'));assert.ok(/\d+ 건<\/span>/.test(ai));
  assert.match(ai,/기준 2026\.10\.1 오전 10시 \/ 환율 1,376/);
  // 급여·명세서
  assert.ok(out['pay.top.ledger'].includes('💰 월급 &lt;관리&gt;'));assert.ok(out['pay.top.ledger'].includes('onclick="setPayView(\'wage\')">시급</button>'));
  assert.ok(J(out['pay.preview.ok'])[1]==='엑셀 2줄 읽음 열 매핑도 저장했습니다.');
  assert.ok(J(out['pay.ledger.rows'])[0].includes('저장 1 · 보관 1'));
  assert.ok(J(out['pay.month.move_ok'])[1].includes('confirm:2026-10 → 2026-11 로 옮길까요?'));
  const slip=J(out['slip.html'])[0];
  assert.ok(slip.includes('급여 명세 &lt;서&gt;')&&!slip.includes('급 여 명 세 서'));assert.ok(slip.includes('<th style="border:1px solid #111;padding:6px;background:#f4f8f7;width:16%">이름</th>'));
  assert.ok(slip.includes('1.5h')||slip.includes('25h'),'시간 단위 글');
  // 위험 확인창
  assert.ok(J(out['acct.block_ok'])[0].includes('confirm:퇴사직원 접속을 막을까요?'));
  assert.ok(J(out['acct.delete_ok'])[0].includes('confirm:퇴사직원 님 계정을 지울까요?'));
  assert.ok(J(out['acct.revoke_ok'])[0].includes('confirm:퇴사직원 승인을 취소할까요?'));
  // 직무 분류 · 저장 상태
  assert.ok(out['jg.render.unassigned'].includes('<h3 id=\\"jobGroupTitle\\">직무 나누기</h3>')||out['jg.render.unassigned'].includes('직무 나누기'));
  assert.ok(out['jg.render.unassigned'].includes('정해지지 않음'));
  assert.ok(J(out['jg.save.err_perm'])[0].includes('#jobGroupMessage|t|권한이 없어요 · 성공 0명 / 실패 1명 · 실패 ID p1'));
  assert.ok(J(out['jg.save.ok'])[0].includes('#jobGroupMessage|t|1명 저장됨'));
  assert.deepEqual(J(out['status.tag']),['저장하는 중','저장 끝','저장 안 됨','자동으로 저장돼요','자동으로 저장돼요']);
  // 결제 금액 단위·계약서 미리보기 창
  assert.ok(J(out['payreq.card'])[0].includes('1,234,567 원정</td>'));
  assert.ok(J(out['empdoc.preview'])[0].includes('title="계약서 창 &lt;1&gt;"')&&!J(out['empdoc.preview'])[0].includes('title="근로계약서 미리보기"'));
});
test('표에 값이 있으면 그 글: 계약서 미리보기·결재·상태 글처럼 기존 시험이 줄 모양을 찾는 곳은 원문 줄을 그대로 두고 고쳤을 때만 바꿔 넣는다',()=>{
  for(const line of [
    "<div class=\"hint\" style=\"color:var(--gold)\">⚠ 미제출 서류 ${undone.length}개 — [내 서류함] 탭에서 제출하세요.</div>",
    "onclick=\"go('inbox')\">문의함 열기</button>",
    "catch{inboxError='문의함 요약을 불러오지 못했습니다.'",
    "NEW(미처리) 문의 ${newCount}건",
    ".limit(3)",
    "<h2>🔒 진료기록</h2>",
    "class=\"hint\">매니저·실장·원장만 상담 기록을 입력·조회·수정합니다.</div>",
    "row.event_kind==='cancellation'?' · 취소'",
    "details(hubT('mkt.d_not_marketing','마케팅 아님'),noMarketing)",
    "<iframe title=\"근로계약서 미리보기\" sandbox=\"\"",
    "aria-label=\"${esc(person.name)} 직무 분류 대상\"",
    "aria-label=\"새 직무 분류\""
  ])assert.ok(hr.includes(line),'기존 시험이 찾는 줄 모양 그대로: '+line);
  assert.ok(/<th style="\$\{th\}">항목<\/th><th style="\$\{th\};text-align:right">금액<\/th><th style="\$\{th\}">산출식<\/th>/.test(hr),'명세서 지급·공제 표 머리 세 칸은 기존 시험이 줄 모양을 찾아 그대로');
});

/* ───────────── 4. 숫자 반영 ───────────── */
test('숫자: 홈 명세서 개월 수·입금 목록 건수는 조회 건수로 반영되고 못 읽으면 12·300',async()=>{
  const lim=async(settings)=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings:settings||{},probe:true});
    const r=await P.asRole('owner');
    await r.api.renderHome({innerHTML:''});r.api.set('DEP_RANGE','month');r.ctx.TAB='deposit';await r.api.renderDeposit({innerHTML:''});
    return clone(r.ctx.sb.limits);
  };
  const base=await lim({});
  assert.deepEqual(base.filter(l=>l[0]==='payslips'),[['payslips',12]]);assert.deepEqual(base.filter(l=>l[0]==='deposits'),[['deposits',300]]);
  const set=await lim({'home.payslip_limit':'5','dep.list_limit':'50'});
  assert.deepEqual(set.filter(l=>l[0]==='payslips'),[['payslips',5]]);assert.deepEqual(set.filter(l=>l[0]==='deposits'),[['deposits',50]]);
  const bad=await lim({'home.payslip_limit':'0','dep.list_limit':'5000'});
  assert.deepEqual(bad.filter(l=>l[0]==='payslips'),[['payslips',12]]);assert.deepEqual(bad.filter(l=>l[0]==='deposits'),[['deposits',300]]);
  assert.deepEqual(base.filter(l=>l[0]==='consultation_inbox'),[['consultation_inbox',3]],'홈 최근 문의 3건은 기존 시험이 줄 모양을 찾아 그대로(옮기지 않음)');
});
test('숫자: AI비용 화면의 개월 수·건수·일수·대화 수가 반영되고(제목의 숫자도 같이), 청구액·환산 금액은 그대로',async()=>{
  const BILL=[{ym:'2026-10',platform:'Claude',amount_krw:30000,note:null},{ym:'2026-09',platform:'Claude',amount_krw:20000,note:null},{ym:'2026-08',platform:'Claude',amount_krw:10000,note:null},{ym:'2026-07',platform:'Claude',amount_krw:5000,note:null}];
  const EVENTS=Array.from({length:8},(_,i)=>({platform:'Claude',amount_krw:1000*(i+1),source:'m',note:'n'+i,raw_text:'원문'+i,received_at:'2026-10-01T0'+i+':00:00Z'}));
  const aic=async settings=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings:settings||{},probe:true});
    const r=await P.asRole('owner',null,{tables:{ai_billing:{list:BILL},ai_billing_events:{list:EVENTS}}});
    const m={innerHTML:''};await r.api.renderAicost(m);await P.flush();return m.innerHTML;
  };
  const histPart=h=>h.slice(h.indexOf('실제 청구액</h2>'),h.indexOf('📩 자동감지'));
  const autoPart=h=>h.slice(h.indexOf('📩 자동감지'));
  const count=(s,re)=>(s.match(re)||[]).length;
  const base=await aic({});
  assert.equal(count(histPart(base),/<span>\d{4}-\d\d<\/span><b>₩/g),4,'기본: 청구액 달 4개(최대 6개월)');
  assert.ok(base.includes('최근 6개월 실제 청구액')&&base.includes('(최근 20건, 문자 웹훅)'));
  assert.equal(count(autoPart(base),/<tr><td>/g),8,'자동감지 내역 기본: 여덟 줄');
  const few=await aic({'aic.history_months':'2','aic.auto_limit':'5','aiu.model_days':'3'});
  assert.ok(few.includes('최근 2개월 실제 청구액')&&few.includes('(최근 5건, 문자 웹훅)')&&few.includes('모델별 사용량(최근 3일)')&&few.includes('3일 합계'));
  assert.equal(count(histPart(few),/<span>\d{4}-\d\d<\/span><b>₩/g),2);
  assert.equal(count(autoPart(few),/<tr><td>/g),5);
  assert.ok(few.includes('기간 2026-09-29 ~ 2026-10-01'));
  // 금액은 숫자 설정과 무관
  const total=s=>s.match(/이번 달 실제 청구액[^]*?₩([\d,]+)/)[1];
  assert.equal(total(few),total(base));
  const nums=s=>[...histPart(s).matchAll(/<span>(\d{4}-\d\d)<\/span><b>₩([\d,]+)/g)].map(m=>m[1]+'='+m[2]);
  assert.deepEqual(nums(few),nums(base).slice(0,2),'앞 두 달의 금액은 그대로');
  const aiu=async settings=>J((await run([],settings))['aiu.panels'])[0];
  const first=await aiu({}),firstFew=await aiu({'aiu.cost_months':'2','aiu.external_days':'3','aiu.session_limit':'3'});
  assert.equal(count(first,/data-ai-cost-month=/g),3);assert.equal(count(firstFew,/data-ai-cost-month=/g),2);
  assert.ok(count(first,/data-ai-external-day="2026-09-10"/g)>0,'기본 14일: 네 날짜 모두');
  assert.ok(count(firstFew,/data-ai-external-day="2026-10-01"/g)>0&&count(firstFew,/data-ai-external-day="2026-09-29"/g)>0&&count(firstFew,/data-ai-external-day="2026-09-20"/g)>0&&count(firstFew,/data-ai-external-day="2026-09-10"/g)===0,'날짜별 표 3일치(가장 오래된 날은 빠짐)');
  assert.ok(firstFew.includes('날짜별 표는 최근 3일')&&first.includes('날짜별 표는 최근 14일'));
  assert.equal(count(first,/data-ai-session="/g),5);assert.equal(count(firstFew,/data-ai-session="/g),3);
  assert.ok(firstFew.includes('₩')&&firstFew.includes('1,376'),'환산 금액·환율은 그대로');
  // 잘못된 값은 기본
  assert.equal(await aic({'aic.history_months':'25','aic.auto_limit':'3','aiu.model_days':'31'}),await aic({}));
});

/* ───────────── 5. 이름 목록: 이름만 바뀌고 코드는 그대로 ───────────── */
test('상태·종류 이름 목록: 결재 문서 상태 · 계약 상태는 이름만 바뀌고 색(코드)은 그대로, 낯선 값은 그대로 보임',async()=>{
  const lst=(k,items)=>({[k]:JSON.stringify(items)});
  const out=await run([],{...lst('list.approval_status',[{code:'진행',label:'결재 중'},{code:'완결',label:'결재 끝'},{code:'반려',label:'돌려보냄'},{code:'취소',label:'없던 일'}]),...lst('list.contract_status',[{code:'발송요청',label:'원장 확인 전'},{code:'대기',label:'서명 기다림'},{code:'서명완료',label:'서명 끝'},{code:'취소',label:'취소됨!'},{code:'반려됨',label:'돌려보냄!'}])});
  const cards=J(out['appr.doccard']);
  assert.ok(cards[0].includes('<span class="b wait">결재 중</span>'));assert.ok(cards[1].includes('<span class="b ok">결재 끝</span>'));assert.ok(cards[2].includes('<span class="b no">돌려보냄</span>'));assert.ok(cards[3].includes('<span class="b no">없던 일</span>'));
  assert.ok(cards[4].includes('<span class="b wait">보류</span>'),'목록에 없는 값은 저장된 글 그대로');
  assert.deepEqual(J(out['contract.status']),['원장 확인 전','서명 기다림','서명 끝','돌려보냄!','취소됨!','기타값','','']);
  // 코드를 직접 비교하는 곳은 이름이 바뀌어도 그대로
  assert.ok(/d\.status==='완결'\?'ok':\(\['반려','취소'\]\.includes\(d\.status\)\?'no':'wait'\)/.test(hr));
  assert.ok(hr.includes("r.status==='서명완료'")||hr.includes("signed=r.status==='서명완료'"));
  assert.ok(hr.includes("function contractStatusClass(s){return s==='서명완료'?'ok':(s==='취소'?'no':'wait');}"));
});
test('상태·종류 이름 목록: 급여형태·마케팅 분류·AI 플랫폼 이름은 이름만 바뀌고 저장되는 값(코드)은 그대로',async()=>{
  const lst=(k,items)=>({[k]:JSON.stringify(items)});
  const settings={...lst('list.pay_wage_types',[{code:'monthly',label:'월 단위'},{code:'hourly',label:'시간 단위'}]),
    ...lst('list.marketing_categories',[{code:'daangn',label:'당근마켓'},{code:'kakao',label:'카카오톡'},{code:'google',label:'구글광고'},{code:'naver',label:'네이버광고'},{code:'meta',label:'메타광고'},{code:'not_marketing',label:'광고 아님'}]),
    ...lst('list.ai_billing_platforms',[{code:'Claude',label:'클로드'},{code:'Codex(OpenAI)',label:'코덱스'},{code:'Kimi',label:'키미'},{code:'DeepSeek',label:'딥시크'},{code:'StepFun',label:'스텝펀'},{code:'기타',label:'그 밖'}]),
    ...lst('list.ai_cost_platforms',[{code:'claude',label:'클로드 코드'},{code:'codex',label:'코덱스'},{code:'kimi',label:'키미'},{code:'openclaw',label:'오픈클로'}]),
    ...lst('list.ai_external_names',[{code:'deepseek',label:'딥씨크'},{code:'step5',label:'스텝 5'},{code:'kimi',label:'키미 AI'},{code:'luna',label:'루나 AI'},{code:'?',label:'모르는 이름'}])};
  const out=await run([],settings);
  const wage=J(out['pay.wage_ok'])[0];
  assert.ok(wage.includes('<option value="monthly" >월 단위</option>')||wage.includes('<option value="monthly" '),'값은 코드');
  assert.ok(/<option value="monthly" [^>]*>월 단위<\/option><option value="hourly" selected>시간 단위<\/option>/.test(wage),'코드(monthly·hourly)는 그대로, 이름만 바뀜');
  const mk=out['mkt.panel_ok'];
  assert.ok(mk.includes('<option value="google" >구글광고</option>')||/<option value="google"[^>]*>구글광고<\/option>/.test(mk));
  assert.ok(/<option value="not_marketing"[^>]*>광고 아님<\/option>/.test(mk));assert.ok(mk.includes('당근마켓 · '),'분류별 줄 이름');
  assert.ok(!/<option value="google"[^>]*>구글<\/option>/.test(mk));
  const ai=J(out['aicost.full'])[0];
  assert.ok(ai.includes('<tr><td>클로드</td>')&&ai.includes('<tr><td>코덱스</td>')&&ai.includes('<tr><td>그 밖</td>'));
  assert.ok(J(out['aicost.act.aicost_ok'])[2].some(w=>w[1]==='upsert'&&w[2][0].platform==='Codex(OpenAI)'),'저장되는 플랫폼 값은 코드 그대로');
  const aiu=J(out['aiu.panels'])[0];
  assert.ok(aiu.includes('<td>클로드 코드</td>')&&aiu.includes('<td>코덱스</td>')&&aiu.includes('<td>mystery</td>'),'목록에 없는 플랫폼은 올라온 이름 그대로');
  assert.ok(aiu.includes('>딥씨크<')&&aiu.includes('>루나 AI<')&&aiu.includes('>새로운<'));
  // 저장되는 청구 줄은 코드 이름으로 매칭(이름이 바뀌어도 자동감지 합산이 어긋나지 않음)
  const base=J((await run([],{}))['aicost.full'])[0];
  const pick=s=>s.match(/<td><b style="color:var\(--mint\)">₩[\d,]+<\/b><\/td>/g);
  assert.deepEqual(pick(ai),pick(base));
});

/* ───────────── 6. 계산·원본 보존 ───────────── */
test('급여 계산·산출식·엑셀 열 이름은 한 글자도 안 바뀜: 계산 구간·항목표·열 이름표의 해시가 옛 화면(f95b951)과 같고, 글을 모두 고쳐도 금액은 그대로',async()=>{
  const blk=hr.match(/\/\* payroll-payslip:test-start \*\/[\s\S]*?\/\* payroll-payslip:test-end \*\//)[0];
  assert.equal(sha(blk),'09d049e66207a8f41c02c36b80cc589eb53e215e75b7e4f482a5912d11ffe1af','세율·절사·검산·근태 집계 구간');
  assert.equal(sha(hr.match(/const PAYSLIP_PAY_ITEMS=\[[\s\S]*?\];\nconst PAYSLIP_DEDUCT_ITEMS=\[[\s\S]*?\];/)[0]),'884dc86498ef28de52a0e956e630956570c3433eda5aafa3a2f30ac529c568db','급여·공제 항목 이름과 산출식 설명');
  assert.equal(sha(hr.match(/const PAY_ALIASES=\[[\s\S]*?\]\.sort\(\(a,b\)=>b\[0\]\.length-a\[0\]\.length\);/)[0]),'6c4a0fb7fe1e80857737c7a48dc410755da9ec8e65eb855593db764f731dce54','엑셀 열 이름 매핑');
  assert.ok(!/hubT|h7T|hubN|h7N/.test(blk),'계산 구간에는 허브 설정 읽기가 없음');
  assert.ok(hr.includes('if(!/\\.xlsx?$/i.test(file.name)||file.size<1||file.size>20971520)'),'원본 20MB 제한은 코드에 그대로');
  assert.ok(hr.includes("const AI_EXTERNAL_LABELS={")&&hr.includes("AI_EXTERNAL_COST_SINCE='2026-09-30'")&&hr.includes('.limit(1500)'),'마케팅 집계 입력 건수·외부 AI 금액 기록 시작일은 코드에 그대로');
  // 글을 모두 고쳐도 명세서·대장 금액은 그대로
  const base=await run([],{}),over=await run(dynRows(ch7Defs()),{});
  const money=s=>[...String(s).matchAll(/\d{1,3}(?:,\d{3})+/g)].map(m=>m[0]);
  for(const k of ['slip.html','pay.slip.ok','pay.slip.issued','pay.ledger.rows','aicost.full']){
    const a=new Set(money(base[k])),b=new Set(money(over[k]));
    for(const x of a)assert.ok(b.has(x),k+' 금액 '+x+' 가 글을 고친 뒤에도 그대로 나와야 함');
  }
  for(const x of ['3,000,000','200,000','3,380,000','2,986,440','393,560','135,000','100,000'])assert.ok(over['slip.html'].includes(x),'명세서 금액 '+x);
  assert.ok(over['slip.html'].includes('3.595%'),'산출식 설명(안 옮김)은 그대로');
  // 검산 표시 숫자도 그대로
  assert.deepEqual(J(base['slip.badges']).map(s=>money(s)),J(over['slip.badges']).map(s=>money(s)));
});
test('저장 때 쓰이는 값은 그대로: 급여대장 저장 payload·원본 보관 경로·월 옮기기 호출·계정 삭제 호출은 글을 모두 고쳐도 같다',async()=>{
  const base=await run([],{}),over=await run(dynRows(ch7Defs()),{});
  for(const k of ['pay.saverows.ok','pay.saverows.ok_src','pay.saverows.dberr','pay.month.move_ok','pay.month.archive_ok','pay.month.restore_ok','pay.savewage.ok','pay.issue.ok','aicost.act.aicost_ok','aicost.act.budget_ok','conf.submit_ok']){
    const norm=s=>J(s).filter(x=>Array.isArray(x)&&x.length&&Array.isArray(x[0])).map(x=>JSON.stringify(x));
    const a=J(base[k]),b=J(over[k]);
    // 저장 기록(rec)과 호출 기록(rpc)만 비교: 문자 목록(log·message)은 글이 바뀌므로 제외
    const pickWrites=arr=>arr.filter(x=>Array.isArray(x)&&x.length>0&&Array.isArray(x[0])&&typeof x[0][0]==='string'&&/^[a-z_]+$/.test(x[0][0])).map(x=>JSON.stringify(x));
    assert.deepEqual(pickWrites(b),pickWrites(a),k+' 저장·호출 기록');
  }
  // 직무 분류 저장·계정 삭제: 서버로 가는 값
  const calls=s=>J(s).slice(2);
  assert.deepEqual(calls(over['acct.delete_ok']),calls(base['acct.delete_ok']));
  assert.deepEqual(calls(over['acct.block_ok']),calls(base['acct.block_ok']));
  assert.deepEqual(calls(over['acct.revoke_ok']),calls(base['acct.revoke_ok']));
  for(const k of ['jg.save.ok','jg.save.err_perm'])assert.equal(J(over[k])[2].join(','),J(base[k])[2].join(','),k+' 저장 상태 흐름');
  assert.ok(base['jg.save.ok']!==undefined);
});
test('위험 작업 확인창: 글을 고쳐도 계정 영구 삭제의 이름 입력 검사는 실제 이름과 비교한다(바뀐 안내 글이 아니라)',async()=>{
  const rows=[{key:'acct.p_delete',value:'지우려면 {name} 이라고 쳐요'},{key:'acct.c_delete',value:'정말 지워요? {name}'}];
  const P=await renderAll(hr,{engine:true,textRows:rows,settings:{},probe:true});
  const prompts=[];
  for(const [typed,expectInvoke] of [['퇴사직원',true],['지우려면 퇴사직원 이라고 쳐요',false],['다른이름',false]]){
    const d=P.makeDom();const r=await P.asRole('owner',{$:d.$});
    r.ctx.__confirm=true;r.ctx.__prompt=typed;
    r.ctx.PROFILES.find(p=>p.user_id==='u6').account_access_status='차단';
    await r.api.hardDeleteAccountPreserveRecords('u6');await P.flush();
    prompts.push(r.log.filter(x=>x.startsWith('prompt:')||x.startsWith('confirm:')));
    assert.equal(r.ctx.sb.fn.length,expectInvoke?1:0,JSON.stringify(typed));
  }
  assert.deepEqual(prompts[0],['confirm:정말 지워요? 퇴사직원','prompt:지우려면 퇴사직원 이라고 쳐요']);
});

/* ───────────── 7. 허브 설정 화면 ───────────── */
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
test('화면: 글 고치기에 새 묶음 14개(331개 — 차례 7 329 + 인박스 판 2)가 접혀 나오고, 검색칸은 새 글의 화면 낱말·글·키로도 찾고 맞는 줄이 없는 묶음은 숨긴다',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  const names=[...sec.matchAll(/<details class="hub-grp" data-hub-group="([^"]*)"/g)].map(m=>m[1]);
  const h=helpers(),defs=h.hubTextDefs();
  const screens7=[...new Set(defs.filter(d=>CH7.test(d.key)).map(d=>d.screen))];
  assert.equal(names.length,67,'기존 65묶음 + ⏰ 시간 표시 + P7 설정 안내');
  for(const s of screens7)assert.ok(sec.includes(s.replace(/&/g,'&amp;')),'묶음 이름이 화면에 있음: '+s);
  assert.match(sec,/이름표: pay\.m_xls_read/);assert.match(sec,/이름표: slip\.doc_title/);assert.match(sec,/이름표: acct\.c_delete/);
  assert.match(sec,/⚠ 명세서를 발행할 때 이 글이 본문에 박혀서 저장돼요/);
  // 검색칸·접기: 화면 전체 묶음을 그대로 흉내 내 걸러 봄
  const groups=[];
  const screenOrder=[...new Set(defs.map(d=>d.screen))];
  for(const sc of screenOrder){
    const rows=defs.map((d,i)=>d.screen===sc?{idx:i,hidden:false,getAttribute(){return String(i);}}:null).filter(Boolean);
    groups.push({name:sc,hidden:false,open:false,rows,querySelectorAll(){return this.rows;}});
  }
  assert.equal(groups.length,67);
  const fsec={querySelectorAll(sel){return sel==='[data-hub-group]'?groups:[];}};
  const visible=()=>groups.filter(g=>!g.hidden).map(g=>g.name);
  const shown=()=>groups.reduce((n,g)=>n+g.rows.filter(r=>!r.hidden).length,0);
  const filter=t.ctx.window.HubUi.applyTextFilter;
  filter(fsec,'마케팅');
  assert.ok(visible().includes('💰 AI비용 › 마케팅비')&&visible().length<=4,'마케팅 낱말은 몇 묶음에만: '+visible().join(' / '));
  assert.ok(groups.filter(g=>!g.hidden).every(g=>g.open===true),'검색어가 있으면 맞는 묶음은 펼침');
  filter(fsec,'급여대장 저장');
  assert.ok(visible().includes('💰 급여 › 급여대장·시급설정')&&visible().every(n=>['💰 급여 › 급여대장·시급설정','💰 급여 › 명세서 화면'].includes(n)),'낱말을 모두 포함한 글이 있는 묶음만: '+visible().join(' / '));
  filter(fsec,'acct.c_delete');assert.deepEqual(visible(),['🛡️ 계정·권한 관리 › 위험 작업 확인창'],'이름표(키)로도 찾음');
  filter(fsec,'영구히 삭제합니다');assert.deepEqual(visible(),['🛡️ 계정·권한 관리 › 위험 작업 확인창'],'기본 글로도 찾음');
  filter(fsec,'zzzz없는낱말');assert.equal(visible().length,0);assert.equal(shown(),0);
  filter(fsec,'');assert.equal(visible().length,67);assert.equal(shown(),defs.length,'검색어를 지우면 전부 보임');
  filter(fsec,'원본 보관 실패');assert.ok(visible().includes('💰 급여 › 급여대장·시급설정'));
  filter(fsec,'');
  // 고친 글은 지금 글로도 찾아진다
  const t2=ui({texts:[{key:'pay.title',value:'💰 월급 관리판'}]});
  await t2.render(OWNER);
  const cur=h.hubTextDefs().filter(d=>h.hubTextMatches(d,'월급 관리판',d.key==='pay.title'?'💰 월급 관리판':null)).map(d=>d.key);
  assert.deepEqual(clone(cur),['pay.title']);
  assert.match(t2.section.innerHTML,/고친 것 1개/);
});
test('화면: 🔢 숫자·기준에 새 숫자 8개(27개)가 있고 잘못된 값은 DB 호출 없이 거절, 저장·되돌리기',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,28);
  for(const s of ['🏠 홈·입금 기준','💰 AI비용 기준'])assert.ok(sec.includes(s),s);
  for(const k of NUM_KEYS)assert.ok(sec.includes('이름표: '+k),k);
  const idx=k=>t.ctx.window&&helpers().HUB_SETTING_DEFS.findIndex(d=>d.key===k);
  const i=idx('aic.history_months');
  assert.equal(i,21);
  const before=t.state.calls.length;
  for(const bad of ['','abc','0','25','1.5','-3']){t.el('#hubSetIn_'+i).value=bad;await t.click('[hub-set-save]='+i);assert.match(t.el('#hubSetMsg_'+i).textContent,/저장하지 못했어요/,bad);}
  assert.equal(t.state.calls.length,before,'잘못된 값은 DB를 부르지 않음');
  t.el('#hubSetIn_'+i).value='3';await t.click('[hub-set-save]='+i);
  const up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.deepEqual(clone(up.map(u=>u.payload)),[{key:'aic.history_months',value:'3'}]);
  assert.match(t.el('#hubSetBadge_'+i).innerHTML,/고침/);
  await t.click('[hub-set-reset]='+i);
  assert.equal(t.state.settings.find(r=>r.key==='aic.history_months').value,'6','되돌리기는 기본값을 다시 적음');
  assert.ok(!/고침/.test(t.el('#hubSetBadge_'+i).innerHTML));
});
test('화면: 📋 목록에 새 이름 목록 7개가 있고, 코드는 회색(못 고침)·새 항목 추가 단추는 없음 · 이름만 고쳐 저장',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=lists');
  const sec=t.section.innerHTML;
  for(const k of LIST_KEYS)assert.ok(sec.includes('이름표: '+k),k);
  assert.equal((sec.match(/<span class="hub-code">/g)||[]).length,4+6+3+4+4+7+6+3+8+7+6+5+32);
  const h=helpers(),di=h.HUB_LIST_DEFS.findIndex(d=>d.key==='list.approval_status');
  assert.ok(di>=0);
  assert.ok(!sec.includes('data-hub-list-add="'+di+'"'),'새 항목 추가 단추 없음');
  ['결재 중','결재 끝','돌려보냄','없던 일'].forEach((v,ri)=>{t.el('#hubLstLbl_'+di+'_'+ri).value=v;});
  await t.click('[hub-list-save]='+di);
  const row=t.state.settings.find(r=>r.key==='list.approval_status');
  assert.deepEqual(JSON.parse(row.value),[{code:'진행',label:'결재 중'},{code:'완결',label:'결재 끝'},{code:'반려',label:'돌려보냄'},{code:'취소',label:'없던 일'}]);
  assert.equal(t.el('#hubLstMsg_'+di).textContent,'저장했어요.');
  // 코드는 못 바꿈: 이름이 같은 항목 두 개·빈 이름은 거절
  ['같음','같음','x','y'].forEach((v,ri)=>{t.el('#hubLstLbl_'+di+'_'+ri).value=v;});
  await t.click('[hub-list-save]='+di);
  assert.match(t.el('#hubLstMsg_'+di).textContent,/저장하지 못했어요/);
  await t.click('[hub-list-reset]='+di);
  assert.deepEqual(JSON.parse(t.state.settings.find(r=>r.key==='list.approval_status').value).map(i=>i.label),['진행','완결','반려','취소']);
});

/* ───────────── 8. 안 옮긴 것 · SQL · 글자 ───────────── */
test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장) · 새 키는 db/·Edge에 같은 값이 없다',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_7.sql')),false);
  const files=[];
  for(const f of fs.readdirSync(path.join(root,'db')))if(f.endsWith('.sql'))files.push('db/'+f);
  const walk=p=>{for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){const q=p+'/'+e.name;if(e.isDirectory())walk(q);else if(/\.(ts|sql)$/.test(e.name))files.push(q);}};
  walk('supabase/functions');
  for(const f of files){const t=read(f);for(const k of [...NUM_KEYS,...LIST_KEYS])assert.ok(!t.includes(k),f+' 에 '+k);}
  const SEC=String.fromCharCode(0xA7); // 섹션 기호는 어디에도 쓰지 않는 규칙(이 파일에도 글자 그대로는 안 씀)
  assert.ok(!js.includes(SEC)&&!hr.includes(SEC));
  for(const f of ['tests/fixtures/hub7-harness.cjs','tests/hub-ui-texts-7.test.js','tests/manual/make-hub7-golden.cjs','tests/sql/pglite-hub-ui-texts-7.mjs'])assert.ok(!read(f).includes(SEC),f);
});
test('안 옮긴 것: 엑셀 열 이름·급여 항목 이름·산출식 설명·계산 상수·원본 제한·마케팅 집계 건수·로그인 전 화면 글은 코드에 그대로',()=>{
  assert.ok(hr.includes("const PAYSLIP_RATES_2026={health:0.03595,healthMin:280390,healthMax:127725730,ltc:0.131405,employment:0.009,localTax:0.1,mealNontax:200000};"));
  assert.ok(hr.includes("['base_pay','기본급','월 기본급(일할계산 시 계약월액÷그달일수×근무일수)']"));
  assert.ok(hr.includes("['health_ins','건강보험','과세대상 지급액 × 3.595%']"));
  assert.ok(hr.includes("['포괄휴일연장수당','fixed_holiday_ot']"));
  assert.ok(hr.includes('const PAYSLIP_FIELD_LABELS={health_ins:'));
  assert.ok(hr.includes("overlapMinutes(ci,co,22*60,24*60)+overlapMinutes(ci,co,0,6*60)"));
  assert.ok(hr.includes('.limit(1500)'));assert.ok(hr.includes("const AICOST_PLATFORMS=['Claude','Codex(OpenAI)','Kimi','DeepSeek','StepFun','기타'];"));
  assert.ok(!hr.includes("hubT('login."),'로그인 전 화면 글은 이번에도 안 옮김');
  assert.ok(!js.includes('push-dispatcher'),'푸시 문구(Edge)는 이번에도 안 옮김');
});
test('hr.html·hub-texts.js·이 시험 파일의 한글이 깨지지 않고 UTF-8로 저장돼 있다',()=>{
  const bad=Buffer.from([0xEF,0xBF,0xBD]);
  for(const f of ['hr.html','hub-texts.js','tests/hub-ui-texts-7.test.js','tests/fixtures/hub7-harness.cjs'])assert.ok(!fs.readFileSync(path.join(root,f)).includes(bad),f+' 에 깨진 글자(U+FFFD)');
  assert.ok(!js.startsWith('\uFEFF'));
  assert.ok(hr.includes('급여대장')&&js.includes('급여대장 저장'));
});
