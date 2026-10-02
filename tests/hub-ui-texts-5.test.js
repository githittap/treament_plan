// 직원허브 「⚙️ 허브 설정」 차례 5 시험 — 문의함 · 상담일지 글·목록·숫자를 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 두 화면이 옛 화면(8829a7a)과 글자 하나까지 같음 ②표에 값이 있으면 그 글 ③표 읽기 실패·잘못된 값이면 기본값
//       ④문의 출처·문의 상태·상담 구분·상담 상태는 코드 고정(이름만 고침 · 선택칸 option 값은 코드 · 흐름은 코드로 동작) ⑤숫자 4개는 범위 검사 + 잘못되면 기본값
//       ⑥DB에도 같은 값이 있는 것(광고 알림 기준 금액)·기존 시험이 줄 모양을 찾는 것(불러오는 건수 150)은 안 옮김.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll}=require('./fixtures/hub5-harness.cjs');
const golden=JSON.parse(read('tests/fixtures/hub5-golden-8829a7a.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const CH5=/^(inbox|cj)\./;
const DYN_KEYS={'inbox.f_all_source':'전체 출처','inbox.f_all_status':'전체 상태'}; // inboxCardFill이 option 글을 보고 키를 고르는 두 항목
const COUNT=168;

function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block);
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubSetting,hubSettingChecked,hubSettingSetValues,hubSettingValidate,hubSettingSave,hubSettingReset,hubList,hubListValidate,hubListSave,HUB_LIST_DEFS,HUB_SETTING_DEFS,hubTextDefs,hubTextDefByKey,hubTextMatches,hubTextSetOverrides};',c);
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
const STATUS_SET=[{code:'new',label:'새 문의'},{code:'in_progress',label:'진행중'},{code:'recall_1',label:'1차 연락'},{code:'recall_2',label:'리콜 2차'},{code:'recall_3',label:'리콜 3차'},{code:'closed',label:'끝남'},{code:'converted',label:'상담일지 전환'}];
const SOURCE_SET=[{code:'daangn',label:'당근마켓'},{code:'kakao',label:'카카오'},{code:'naver_email',label:'네이버메일'},{code:'naver_talktalk',label:'네이버 톡톡'},{code:'homepage',label:'홈페이지'},{code:'phone',label:'전화 문의'},{code:'manual',label:'수기'},{code:'other',label:'기타'}];
const KIND_SET=[{code:'교정',label:'교정 상담'},{code:'확정',label:'확정'},{code:'미확정 및 부분확정',label:'미확정 및 부분확정'},{code:'홈페이지',label:'홈페이지'},{code:'카카오,네이버예약,당근',label:'카카오,네이버예약,당근'},{code:'원본',label:'원본'}];
const CSTATUS_SET=[{code:'대기',label:'접수'},{code:'미확정',label:'미확정'},{code:'부분확정',label:'부분확정'},{code:'확정',label:'완료'},{code:'종결',label:'종결'}];
const RENAMED={'list.inquiry_status':JSON.stringify(STATUS_SET),'list.inquiry_sources':JSON.stringify(SOURCE_SET),'list.consult_kinds':JSON.stringify(KIND_SET),'list.consult_status':JSON.stringify(CSTATUS_SET)};
const NUM_KEYS=['inbox.group_window_min','inbox.alert_limit','consult.page_size','consult.action_limit'];

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 5 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 9개(문의함 6 · 상담일지 3)·168개',()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH5.test(d.key));
  assert.equal(defs.length,COUNT,'차례 5 글 키 수');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.equal(screens.length,9);
  assert.equal(screens.filter(s=>s.startsWith('📥 문의함')).length,6);
  assert.equal(screens.filter(s=>s.startsWith('🗂 상담일지')).length,3);
});

test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:hubT|hubText|hubTextHtml|T|cjT|inboxT)\(\s*'([a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(hr))){
    const key=m[1];if(!CH5.test(key))continue;
    const v=vm.runInNewContext(m[2]);
    if(found.has(key))assert.equal(found.get(key),v,key+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(key,v);
  }
  // 표 머리 도우미 th('키','글')
  for(const sm of hr.matchAll(/\bth\('((?:inbox|cj)\.[a-z0-9_.]+)','([^']*)'\)/g)){if(found.has(sm[1]))assert.equal(found.get(sm[1]),sm[2]);found.set(sm[1],sm[2]);}
  // 요소에 data-hubk="키"를 달아 둔 글(상담일지 안내): 요소 안의 글이 기본 글
  const marks=new Map();
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="([a-z0-9_.]+)"[^>]*>([^<]*)</g)){if(!CH5.test(sm[1]))continue;marks.set(sm[1],sm[2]);}
  assert.deepEqual([...marks.keys()],['cj.hint'],'표지를 단 글은 상담일지 안내 하나(기존 시험이 class="hint">매니저… 줄을 찾음)');
  const defs=h.hubTextDefs().filter(d=>CH5.test(d.key));
  for(const d of defs){
    if(marks.has(d.key)){assert.equal(marks.get(d.key),d.def,d.key+' 표지 글이 기본값과 다름');continue;}
    if(DYN_KEYS[d.key]){ // 선택칸 맨 위 항목: 옛 option 줄 그대로 두고 inboxCardFill이 바꿔 넣음
      assert.equal(d.def,DYN_KEYS[d.key]);
      assert.ok(hr.includes('>'+d.def+'</option>'),d.key+' 옛 option 줄이 그대로 있음');
      continue;
    }
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of [...found.keys(),...marks.keys()])assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  assert.match(hr,/inboxT\(t==='전체 출처'\?'inbox\.f_all_source':'inbox\.f_all_status',t\)/);
});

test('숫자·목록 기본값: 숫자 4개와 문의 출처·문의 상태·상담 구분·상담 상태 목록이 hr.html·DB와 같다 · 캐시 번호',()=>{
  const h=helpers(),S=k=>h.HUB_SETTING_DEFS.find(d=>d.key===k),L=k=>h.HUB_LIST_DEFS.find(d=>d.key===k);
  assert.deepEqual(clone(h.HUB_SETTING_DEFS.slice(14,18).map(d=>[d.key,d.def,d.kind,d.min,d.max])),[['inbox.group_window_min','30','int',5,180],['inbox.alert_limit','20','int',5,100],['consult.page_size','20','int',10,100],['consult.action_limit','100','int',20,300]]);
  assert.equal(h.HUB_SETTING_DEFS.length,33);
  assert.match(hr,/hubSettingChecked\('inbox\.group_window_min',30\)/);
  assert.match(hr,/limit\(hubN\('inbox\.alert_limit',20\)\)/);
  assert.match(hr,/CONSULTATION_PAGE_SIZE=hubN\('consult\.page_size',20\)/);
  assert.match(hr,/const limit=hubN\('consult\.action_limit',100\)/);
  // 목록 4개: 코드는 DB가 허락하는 값 그대로, 새 항목 못 늘림
  const src=clone(L('list.inquiry_sources').def),st=clone(L('list.inquiry_status').def),kd=clone(L('list.consult_kinds').def),cs=clone(L('list.consult_status').def);
  assert.deepEqual(src.map(i=>i.code),['daangn','kakao','naver_email','naver_talktalk','homepage','phone','manual','other']);
  assert.deepEqual(st.map(i=>i.code),['new','in_progress','recall_1','recall_2','recall_3','closed','converted']);
  assert.deepEqual(kd.map(i=>i.code),clone(vm.runInNewContext(hr.match(/const CONSULTATION_SHEETS=(\[[^\n]*?\]);/)[1])));
  assert.deepEqual(cs.map(i=>i.code),clone(vm.runInNewContext(hr.match(/const CONSULTATION_STATUSES=(\[[^\n]*?\]);/)[1])));
  assert.ok(kd.every(i=>i.code===i.label)&&cs.every(i=>i.code===i.label));
  for(const k of ['list.inquiry_sources','list.inquiry_status','list.consult_kinds','list.consult_status'])assert.equal(L(k).addable,false,k);
  // hr.html 안의 옛 이름과 같음(화면은 이 이름을 기본으로 보임)
  const inboxBlock=hr.match(/function inboxSourceItems\(\)\{const def=(\[[^\n]*?\]);/)[1];
  assert.deepEqual(clone(vm.runInNewContext(inboxBlock)),src);
  const stDef=hr.match(/const INBOX_STATUS_DEFAULTS=(\[[^\n]*?\]);/)[1];
  assert.deepEqual(clone(vm.runInNewContext(stDef)),st);
  assert.match(hr,/hubList\('list\.inquiry_sources',def\)/);assert.match(hr,/hubList\('list\.inquiry_status',def\)/);assert.match(hr,/hubList\('list\.consult_kinds',def\)/);assert.match(hr,/hubList\('list\.consult_status',def\)/);
  // DB 제약이 코드를 쥐고 있음
  assert.match(read('db/consultation_inbox_navertalk_source_draft.sql'),/'daangn','kakao','naver_email','homepage','phone','manual','other','naver_talktalk'/);
  assert.match(read('db/consultation_inbox_followup_draft.sql'),/status in \('new','in_progress','recall_1','recall_2','recall_3','closed','converted'\)/);
  assert.match(read('db/consultation_journal_draft.sql'),/source_sheet in \('교정', '확정', '미확정 및 부분확정', '홈페이지', '카카오,네이버예약,당근', '원본'\)/);
  assert.match(read('db/consultation_journal_draft.sql'),/status in \('대기', '미확정', '부분확정', '확정', '종결'\)/);
  assert.match(hr,/hub-texts\.js\?v=2026100302/,'캐시 번호를 새 값으로 올림(차례 5에서 2026100110 → 2026100111, 차례 6에서 → 2026100112, 차례 7에서 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-03 첫 화면에서 → 2026100301, 10-03 근태·문의 개선에서 → 2026100302)');
  assert.ok(!/hub-texts\.js\?v=2026100110/.test(hr));
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 두 화면이 옛 화면(8829a7a)과 글자 하나까지 같다',async()=>{
  const out=await renderAll(hr,{engine:false});
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
  assert.ok(Object.keys(golden).length>=110,'대조 항목 수');
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
test('숫자·목록 값이 모양이 틀려도(깨진 JSON·범위 밖·글자·낯선 코드·이름 그대로) 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_status':'not json','list.inquiry_sources':'[{"code":"x"}]','list.consult_kinds':'[]','list.consult_status':'{"a":1}','inbox.group_window_min':'abc','inbox.alert_limit':'9999','consult.page_size':'1','consult.action_limit':''}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
  const same=[{code:'new',label:'NEW(미처리)'},{code:'낯선',label:'낯선'}];
  const out2=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_status':JSON.stringify(same),'list.inquiry_sources':JSON.stringify([{code:'daangn',label:'당근'},{code:'zzz',label:'아무'}]),'list.consult_kinds':JSON.stringify([{code:'교정',label:'교정'},{code:'옛구분',label:'바뀐 구분'}]),'list.consult_status':JSON.stringify([{code:'대기',label:'대기'},{code:'옛상태',label:'바뀐 상태'}])}});
  for(const k of Object.keys(golden))assert.equal(out2[k],golden[k],k+' 이름이 같거나 낯선 코드만 있으면 옛 화면과 같음');
});
test('표에 글이 비어 있거나 공백뿐이면 무시하고 기본 글',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[{key:'inbox.title',value:'   '},{key:'cj.title',value:''},{key:'cj.hint',value:'\n'},{key:'inbox.sum_new',value:' '}],settings:{}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다(문의함·상담일지 각각)',async()=>{
  const cases=[
    ["inboxT('inbox.title','📥 통합 문의함')","inboxT('inbox.title','📥 통합 문의함!')",'inbox.render.staff'],
    ["inboxT('inbox.sum_recall','리콜')","inboxT('inbox.sum_recall','리콜 ')",'pure.summary'],
    ["T('inbox.kb_check','확인 필요')","T('inbox.kb_check','확인필요')",'pure.booking_detail.manager'],
    ["inboxT('inbox.m_manual_ok','문의로 접수했습니다.')","inboxT('inbox.m_manual_ok','문의로 접수했습니다')",'inbox.manual.ok'],
    ["inboxT('inbox.err_replies','답변 이력 불러오기 실패: {msg}'","inboxT('inbox.err_replies','답변 이력 가져오기 실패: {msg}'",'inbox.select.replies_error'],
    ["cjT('cj.m_required','환자명, 상담일, 상담 내용은 필수입니다.')","cjT('cj.m_required','환자명, 상담일, 상담 내용은 필수입니다')",'cj.save.no_name'],
    ["cjT('cj.q_empty','오늘 또는 기한이 지난 다음 조치가 없습니다.')","cjT('cj.q_empty','오늘 또는 기한 지난 다음 조치가 없습니다.')",'cj.queue.empty'],
    ["cjT('cj.th_amount','제시 비용')","cjT('cj.th_amount','제시비용')",'cj.list.rows'],
    ['볼 수 있습니다. 원본 엑셀 행은 가져오지 않으며','볼 수 있습니다 원본 엑셀 행은 가져오지 않으며','cj.render.manager'],
    ['<label>지시/혹은 기타사항</label><textarea id="cjInstruction"','<label>지시/기타사항</label><textarea id="cjInstruction"','cj.render.manager'],
    [">전체 출처</option>",">전체 출처 </option>",'inbox.card.manager']
  ];
  for(const [from,to,key] of cases){
    const c=hr.replace(from,to);
    assert.notEqual(c,hr,'바꿀 곳을 못 찾음: '+from);
    assert.notEqual((await renderAll(c,{engine:false}))[key],golden[key],key+' ← '+from);
  }
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 고쳐 쓰는 글이 모두 화면(제목·단추·표 머리·알림창·확인창·메시지)에 나온다',async()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH5.test(d.key));
  const out=await renderAll(hr,{engine:true,textRows:dynRows(defs),settings:{}});
  const all=Object.values(out).join('\n');
  const missing=defs.filter(d=>!all.includes('«'+d.key+'»')).map(d=>d.key);
  assert.equal(missing.length,0,'값을 넣었는데 화면에 안 나오는 키: '+missing.join(', '));
  assert.ok(!/«[a-z0-9_.]+»[^"\\]*\{[a-z_]+\}/.test(all.replace(/\\"/g,'"')),'{자리표시자}가 채워지지 않고 남음');
});
test('표에 값이 있으면 그 글: 구체적인 예(문의함 제목·건수 줄·전체 출처·상담일지 안내·두 라벨·알림창) + HTML은 이스케이프',async()=>{
  const rows=[{key:'inbox.title',value:'📥 우리 문의 <진짜>'},{key:'inbox.sum_new',value:'새것'},{key:'inbox.sum_recall',value:'다시연락'},{key:'inbox.f_all_source',value:'모든 출처'},{key:'inbox.f_all_status',value:'모든 상태'},
    {key:'inbox.m_convert_fail',value:'{msg} 때문에 전환이 안 돼요'},{key:'inbox.btn_detail',value:'열기'},{key:'inbox.m_assignee',value:'맡은 사람 {name}'},{key:'inbox.group_count',value:'[{n}번]'},
    {key:'cj.title',value:'<b>상담</b>'},{key:'cj.hint',value:'상담일지 안내를 고쳤어요 <끝>'},{key:'cj.f_instruction',value:'지시사항'},{key:'cj.f_special',value:'참고'},{key:'cj.q_limit_hint',value:'{n}건까지만 보여요'},{key:'cj.page_info',value:'총 {total}건 / {page}쪽'},{key:'cj.m_save_fail',value:'{msg} 때문에 못 저장'}];
  const out=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.match(out['inbox.render.manager'],/<h2 style="margin:0">📥 우리 문의 &lt;진짜&gt;<\/h2>/);
  assert.ok(!out['inbox.render.manager'].includes('<진짜>'));
  assert.match(out['inbox.render.manager'],/<strong>새것 \d+ · 진행중 \d+ · 다시연락 \d+ · 처리됨 \d+ · 전환 \d+<\/strong>/);
  assert.match(out['inbox.render.manager'],/<option value="" selected>모든 출처<\/option>/);
  assert.match(out['inbox.render.manager'],/<option value="" selected>모든 상태<\/option>/);
  assert.match(out['inbox.render.manager'],/data-inbox-ids="a1">열기<\/button>/);
  assert.match(out['inbox.render.manager'],/ · 맡은 사람 -<\/div>/);
  assert.match(out['inbox.render.manager'],/민지 · - \[2번\]/);
  assert.match(out['inbox.convert.rpc_fail'],/alert:전환<실패> 때문에 전환이 안 돼요/);
  const cj=JSON.parse(out['cj.render.manager'])[0];
  assert.match(cj,/<h2>&lt;b&gt;상담&lt;\/b&gt;<\/h2>/);
  assert.match(cj,/<div class="hint">상담일지 안내를 고쳤어요 &lt;끝&gt;<\/div>/);
  assert.ok(!cj.includes('data-hubk'),'표지는 화면에 남지 않음');
  assert.match(cj,/<label>지시사항<\/label><textarea id="cjInstruction" maxlength="1000"><\/textarea>/);
  assert.match(cj,/<label>참고<\/label><textarea id="cjSpecial" maxlength="1000"><\/textarea>/);
  assert.match(out['cj.render.queue_100'],/100건까지만 보여요/);
  assert.match(out['cj.render.manager'],/총 45건 \/ 1쪽/);
  assert.match(out['cj.save.create_fail'],/저장<실패> 때문에 못 저장/);
  // 바꾸지 않은 칸은 그대로
  assert.match(out['inbox.render.manager'],/<option value="" selected>모든 상태<\/option>/);
  assert.match(cj,/<label>환자명 \*<\/label>/);
});
test('표에 값이 있으면 그 글: 한 번 고친 글은 다시 기본값으로(되돌리기) — 엔진을 다시 불러도 같은 결과',async()=>{
  const rows=[{key:'inbox.title',value:'X'}];
  const a=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.match(a['inbox.render.staff'],/<h2 style="margin:0">X<\/h2>/);
  const b=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  assert.equal(b['inbox.render.staff'],golden['inbox.render.staff']);
});

/* ───────────── 4. 숫자 4개 ───────────── */
test('숫자 읽기(hubSettingChecked): 기본값 · 표 값 · 범위 밖·글자·빈 값이면 기본값',()=>{
  const h=helpers();
  const t=(k,v,def)=>{h.hubSettingSetValues(v===undefined?{}:{[k]:v});return h.hubSettingChecked(k,def);};
  assert.equal(t('inbox.group_window_min',undefined,30),30);assert.equal(t('inbox.group_window_min','45',30),45);assert.equal(t('inbox.group_window_min','5',30),5);assert.equal(t('inbox.group_window_min','180',30),180);
  for(const bad of ['4','181','abc','','  ','1.5','-1','２'])assert.equal(t('inbox.group_window_min',bad,30),30,'잘못된 값 → 기본값: '+JSON.stringify(bad));
  assert.equal(t('inbox.alert_limit','5',20),5);assert.equal(t('inbox.alert_limit','100',20),100);for(const bad of ['4','101','x'])assert.equal(t('inbox.alert_limit',bad,20),20);
  assert.equal(t('consult.page_size','10',20),10);assert.equal(t('consult.page_size','100',20),100);for(const bad of ['9','101','x'])assert.equal(t('consult.page_size',bad,20),20);
  assert.equal(t('consult.action_limit','20',100),20);assert.equal(t('consult.action_limit','300',100),300);for(const bad of ['19','301','x'])assert.equal(t('consult.action_limit',bad,100),100);
});
test('같은 사람의 문의를 한 묶음으로 보는 간격: 설정을 따르고 잘못된 값이면 30분',async()=>{
  const rows=[{id:'x1',source:'kakao',sender_name:'민지',received_at:'2026-09-30T00:00:00Z',status:'new'},{id:'x2',source:'kakao',sender_name:'민지',received_at:'2026-09-30T00:40:00Z',status:'new'},{id:'x3',source:'kakao',sender_name:'민지',received_at:'2026-09-30T01:30:00Z',status:'new'}];
  const ids=async settings=>{const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});const r=await P.asRole('manager');return clone(r.api.inboxGroupRows(rows).map(g=>g.ids.slice().sort()));};
  assert.deepEqual(await ids({}),[['x3'],['x2'],['x1']],'기본 30분: 40분 떨어진 문의는 따로');
  assert.deepEqual(await ids({'inbox.group_window_min':'45'}),[['x3'],['x1','x2']],'45분이면 앞의 둘이 한 묶음');
  assert.deepEqual(await ids({'inbox.group_window_min':'120'}),[['x1','x2','x3']]);
  for(const bad of ['4','181','abc',''])assert.deepEqual(await ids({'inbox.group_window_min':bad}),[['x3'],['x2'],['x1']],'잘못된 값 → 30분: '+bad);
});
function recSbFor(P,rec){
  const {tablesFor}=require('./fixtures/hub5-harness.cjs');
  const mk=(spec,t)=>{const c=P.chain(spec);const w=new Proxy(c,{get(tg,k){const v=tg[k];if(k==='then')return v;return (...a)=>{if(k==='limit'||k==='range')rec.push([t,k,a]);const r=v(...a);return r===c?w:r;};}});return w;};
  return {from:t=>mk(tablesFor(t)||{list:[],single:null},t),rpc:async()=>({error:null})};
}
test('목록 건수: 광고 알림 카드·상담일지 목록 쪽 크기·「오늘·기한 지남」 건수가 설정을 따르고 잘못된 값이면 기본(20·20·100)',async()=>{
  const run=async(settings,role,fn)=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});const rec=[];
    const r=await P.asRole(role,{sb:recSbFor(P,rec)});await fn(r);return rec;
  };
  let rec=await run({},'manager',r=>r.api.renderInbox({innerHTML:''}));
  assert.deepEqual(rec.filter(x=>x[0]==='ai_billing_events'&&x[1]==='limit').map(x=>x[2][0]),[20]);
  assert.deepEqual(rec.filter(x=>x[0]==='consultation_inbox'&&x[1]==='limit').map(x=>x[2][0]),[150],'불러오는 건수 150은 기존 시험이 줄 모양을 찾아 안 옮김');
  rec=await run({'inbox.alert_limit':'7'},'manager',r=>r.api.renderInbox({innerHTML:''}));
  assert.deepEqual(rec.filter(x=>x[0]==='ai_billing_events'&&x[1]==='limit').map(x=>x[2][0]),[7]);
  rec=await run({'inbox.alert_limit':'1000'},'manager',r=>r.api.renderInbox({innerHTML:''}));
  assert.deepEqual(rec.filter(x=>x[0]==='ai_billing_events'&&x[1]==='limit').map(x=>x[2][0]),[20]);
  const cj=async(settings)=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});const rec2=[];const d=P.makeDom();
    const r=await P.asRole('manager',{sb:recSbFor(P,rec2),$:d.$});await r.api.renderConsultationJournal(d.$('#main'));
    return {limit:rec2.filter(x=>x[1]==='limit').map(x=>x[2][0]),range:rec2.filter(x=>x[1]==='range').map(x=>x[2]),size:r.api.getState('CONSULTATION_PAGE_SIZE'),pages:d.$('#cjPages').innerHTML};
  };
  let c=await cj({});assert.deepEqual(clone(c.limit),[100]);assert.deepEqual(clone(c.range),[[0,19]]);assert.equal(c.size,20);
  c=await cj({'consult.page_size':'40','consult.action_limit':'150'});assert.deepEqual(clone(c.limit),[150]);assert.deepEqual(clone(c.range),[[0,39]]);assert.equal(c.size,40);
  assert.match(c.pages,/45건 · 1쪽/);assert.match(c.pages,/consultationChangePage\(1\)"/,'45건이면 40개짜리 쪽에서 다음 쪽이 열림');assert.ok(!/disabled onclick="consultationChangePage\(1\)"/.test(c.pages));
  c=await cj({'consult.page_size':'50'});assert.match(c.pages,/disabled onclick="consultationChangePage\(1\)"/,'50개짜리 한 쪽이면 다음 쪽이 막힘(45건)');
  c=await cj({'consult.page_size':'1','consult.action_limit':'9999'});assert.deepEqual(clone(c.limit),[100]);assert.deepEqual(clone(c.range),[[0,19]]);assert.equal(c.size,20);
  // 「오늘·기한 지남」이 꽉 찼을 때 안내 글의 건수는 설정한 건수
  const P=await renderAll(hr,{engine:true,textRows:[],settings:{'consult.action_limit':'20'},probe:true});
  const {JOURNALS}=require('./fixtures/hub5-harness.cjs');
  const many=[];for(let i=0;i<30;i++)many.push(Object.assign({},JOURNALS[0],{id:'0000000'+(i%10)+'-0000-4000-8000-0000000000'+String(i).padStart(2,'0'),next_action:'조치'+i}));
  const d=P.makeDom();const r=await P.asRole('manager',{$:d.$},{tables:{consultation_journals:{list:many.slice(0,20)}}});
  await r.api.consultationRenderActionQueue();
  assert.match(d.$('#cjActionQueue').innerHTML,/최대 20건 표시 중임/);
  const d2=P.makeDom();const r2=await P.asRole('manager',{$:d2.$},{tables:{consultation_journals:{list:many.slice(0,19)}}});await r2.api.consultationRenderActionQueue();
  assert.ok(!d2.$('#cjActionQueue').innerHTML.includes('표시 중임'));
});

/* ───────────── 5. 문의 출처 · 문의 상태 이름 ───────────── */
test('문의 상태 이름: 보이는 이름만 바뀌고 저장되는 값(코드)·색·흐름은 그대로 — 선택칸 option 값은 코드, 이름을 안 고친 칸은 옛 글 그대로',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_status':RENAMED['list.inquiry_status']}});
  // (1) 목록 맨 위 상태 고르는 칸: 값은 코드, 글은 이름을 고친 칸만 새 이름
  const card=out['inbox.card.manager'];
  assert.match(card,/<option value="new" >새 문의<\/option>/);
  assert.match(card,/<option value="in_progress" >진행중<\/option>/);
  assert.match(card,/<option value="recall_1" >1차 연락<\/option>/);
  assert.match(card,/<option value="recall_2" >리콜 2차<\/option>/);
  assert.match(card,/<option value="converted" >상담일지 전환<\/option>/);
  assert.match(card,/<option value="closed" selected>끝남<\/option>/,'필터는 코드로 고른 칸이 선택됨');
  assert.ok(!card.includes('>NEW(미처리)</option>'),'이름을 고친 칸은 옛 글이 남지 않음');
  // (2) 목록의 배지: 새 이름 · 색(className)은 코드로
  const list=out['inbox.render.manager'];
  assert.match(list,/<span class="b wait">1차 연락<\/span>/,'a4=recall_1');
  assert.match(list,/<span class="b no">새 문의<\/span>/,'a1=new');
  assert.match(list,/<span class="b mid">끝남<\/span>/,'a8=closed');
  assert.match(list,/<span class="b ok">상담일지 전환<\/span>/,'a6=converted(이름 그대로)');
  assert.match(list,/<span class="b mid">weird<\/span>/,'모르는 상태는 코드 그대로');
  // (3) 상세의 상태 바꾸는 칸: 값=코드. 이름을 고친 칸은 새 이름, 안 고친 칸은 그 칸의 옛 글(확인 중·완료 등)
  const det=out['inbox.select.single.owner_recall'];
  assert.match(det,/<option value="new" >새 문의<\/option>/);
  assert.match(det,/<option value="in_progress" >확인 중<\/option>/,'이름을 안 고친 칸은 옛 글');
  assert.match(det,/<option value="recall_1" selected>1차 연락<\/option>/);
  assert.match(det,/<option value="recall_2" >리콜 2차<\/option>/);
  assert.match(det,/<option value="closed" >끝남<\/option>/);
  assert.ok(!/value="converted"/.test(det),'전환됨은 이미 전환된 묶음에만 나옴(코드 비교)');
  // (4) 카카오 예약 상세 맨 위 줄
  assert.match(out['inbox.select.booking.manager'],/📅 카카오 예약 · 새 문의/);
  // (5) 흐름은 코드로: 상태 저장·전환·건수·묶음 상태가 옛 화면과 똑같음
  for(const k of ['inbox.save.ok','inbox.save.unassigned','inbox.save.fail','inbox.convert.ok_two','inbox.convert.ok_one','inbox.convert.rpc_fail','inbox.convert.close_fail','inbox.convert.none','inbox.dentweb.set_ok','inbox.reply.ok','pure.group_counts','pure.group_rows','pure.summary','pure.group_summary','inbox.manual.ok'])assert.equal(out[k],golden[k],k);
  // (6) 이름이 바뀌어도 「처리 대상」 판정(전환됨·상담일지에 묶인 줄 제외)은 코드로
  const P=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_status':RENAMED['list.inquiry_status']},probe:true});
  const r=await P.asRole('manager');
  assert.deepEqual(clone(r.api.inboxStatusInfo('converted')),{label:'상담일지 전환',className:'ok'});
  assert.deepEqual(clone(r.api.inboxStatusInfo('new')),{label:'새 문의',className:'no'});
  assert.deepEqual(clone(r.api.inboxStatusInfo('zzz')),{label:'zzz',className:'mid'});
  assert.deepEqual(clone(r.api.inboxStatusInfo(undefined)),{label:'-',className:'mid'});
  // (7) 낯선 코드는 나오지 않음
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_status':JSON.stringify(STATUS_SET.concat([{code:'해고',label:'해고'}]))},probe:true});
  const re=await evil.asRole('manager');
  assert.deepEqual(clone(re.api2.inboxStatusItems().map(i=>i.code)),['new','in_progress','recall_1','recall_2','recall_3','closed','converted']);
});
test('문의 상태 선택칸 항목이 화면 코드에서 이름(보이는 글)이 아니라 코드로 비교됨 — 이름을 고쳐도 필터·흐름이 안 깨진다',()=>{
  const region=hr.slice(hr.indexOf('/* ── 상담일지:'),hr.indexOf('/* ── 근로계약서 ── */'));
  assert.ok(region.length>10000);
  // 상태·구분을 보이는 글로 비교하는 곳이 없음(코드 비교만)
  assert.ok(!/status\s*===\s*['"](NEW\(미처리\)|진행중|확인 중|완료|전환됨|신규|상담일지 전환)['"]/.test(region));
  assert.ok(!/\.label\s*===\s*['"]/.test(region.replace(/hit\.label!==base\.label/g,'')));
  assert.match(region,/row\.status==='확정'\?'ok':row\.status==='종결'\?'wait':'no'/);
  assert.match(region,/INBOX_FILTER\.status==='new'/);
  // 서버로 가는 값은 선택칸의 value(코드)
  assert.match(region,/update\(\{status:\$\('#inboxStatus'\)\.value,assigned_to:assigned\}\)/);
  assert.match(region,/if\(INBOX_FILTER\.source\)q=q\.eq\('source',INBOX_FILTER\.source\);if\(INBOX_FILTER\.status\)q=q\.eq\('status',INBOX_FILTER\.status\);/);
});
test('문의 출처 이름: 보이는 이름만 바뀌고 저장되는 값(코드)은 그대로 — 필터·목록·상세·수기 접수 선택칸',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_sources':RENAMED['list.inquiry_sources']}});
  const card=out['inbox.card.manager'];
  assert.match(card,/<option value="daangn" >당근마켓<\/option>/);
  assert.match(card,/<option value="kakao" >카카오<\/option>/);
  assert.match(card,/<option value="phone" selected>전화 문의<\/option>/);
  assert.match(card,/<select id="inboxSource"><option value="phone">전화 문의<\/option><option value="manual">수기<\/option><option value="other">기타<\/option><\/select>/);
  assert.match(out['inbox.render.manager'],/<td>당근마켓<\/td>/);
  assert.match(out['inbox.select.single.staff'],/당근마켓 · 지민/);
  assert.equal(JSON.parse(out['pure.source_label'])[0],'당근마켓');
  assert.equal(JSON.parse(out['pure.source_label'])[5],'전화 문의');
  assert.equal(JSON.parse(out['pure.source_label'])[8],'기타','모르는 출처는 「기타」(출처 other의 이름)');
  // 접수는 코드로 저장
  const P=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_sources':RENAMED['list.inquiry_sources']},probe:true});
  const d=P.makeDom();d.$('#inboxSource').value='phone';d.$('#inboxName').value='홍';d.$('#inboxMessage').value='내용';
  const r=await P.asRole('manager',{$:d.$});await r.api.inboxManualCreate();
  assert.deepEqual(clone(r.ctx.sb.writes.map(w=>[w[0],w[1],w[2][0].source])),[['consultation_inbox','insert','phone']]);
  // 「기타」 이름도 바뀌면 모르는 출처가 그 이름으로 나옴
  const o2=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_sources':JSON.stringify(SOURCE_SET.map(i=>i.code==='other'?{code:'other',label:'그 밖'}:i))},probe:true});
  const r2=await o2.asRole('manager');
  assert.equal(r2.api.inboxSourceLabel('zzz'),'그 밖');
  // 낯선 코드는 나오지 않음
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'list.inquiry_sources':JSON.stringify(SOURCE_SET.concat([{code:'fax',label:'팩스'}]))},probe:true});
  const re=await evil.asRole('manager');
  assert.deepEqual(clone(re.api2.inboxSourceItems().map(i=>i.code)),['daangn','kakao','naver_email','naver_talktalk','homepage','phone','manual','other']);
  assert.equal(re.api.inboxSourceLabel('fax'),'기타');
});

/* ───────────── 6. 상담 구분 · 상담 상태 이름 ───────────── */
test('상담 구분·상태 이름: 보이는 이름만 바뀌고 저장되는 값(코드)·색은 그대로 — 선택칸 option 값은 코드, 저장은 코드로',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.consult_kinds':RENAMED['list.consult_kinds'],'list.consult_status':RENAMED['list.consult_status']}});
  const html=JSON.parse(out['cj.render.manager'])[0];
  assert.match(html,/<select id="cjFilterSheet"><option value="">전체 상담 구분<\/option><option value="교정" >교정 상담<\/option><option value="확정" >확정<\/option>/);
  assert.match(html,/<select id="cjFilterStatus"><option value="">전체 상태<\/option><option value="대기" >접수<\/option><option value="미확정" >미확정<\/option><option value="부분확정" >부분확정<\/option><option value="확정" >완료<\/option><option value="종결" >종결<\/option>/);
  assert.match(html,/<select id="cjSheet"><option value="교정" selected>교정 상담<\/option>/);
  assert.match(html,/<select id="cjStatus"><option value="대기" selected>접수<\/option>/);
  // 목록 표: 새 이름 · 색은 코드로 · 모르는 값은 그대로
  const rows=out['cj.list.rows'];
  assert.match(rows,/<td>교정 상담<\/td><td><span class="b no">접수<\/span><\/td>/);
  assert.match(rows,/<td>홈페이지<\/td><td><span class="b ok">완료<\/span><\/td>/,'확정=초록(코드)');
  assert.match(rows,/<td>카카오,네이버예약,당근<\/td><td><span class="b wait">종결<\/span><\/td>/);
  assert.match(rows,/<td>옛구분<\/td><td><span class="b no">옛상태<\/span><\/td>/);
  // 필터 선택 상태는 코드로 유지
  const f=await renderAll(hr,{engine:true,textRows:[],settings:{'list.consult_kinds':RENAMED['list.consult_kinds'],'list.consult_status':RENAMED['list.consult_status']}});
  assert.match(JSON.parse(f['cj.render.filtered'])[0],/<option value="확정" selected>완료<\/option>/);
  assert.match(JSON.parse(f['cj.render.filtered'])[0],/<option value="홈페이지" selected>홈페이지<\/option>/);
  // 저장·수정·검증은 옛 화면과 똑같음(서버로 가는 값=코드)
  for(const k of Object.keys(golden).filter(k=>/^cj\.(save|edit|queue|reset)/.test(k)&&k!=='cj.edit.ok'&&k!=='cj.reset'))assert.equal(out[k],golden[k],k);
  // 이름(보이는 글)을 코드처럼 보내면 거절
  const P=await renderAll(hr,{engine:true,textRows:[],settings:{'list.consult_status':RENAMED['list.consult_status'],'list.consult_kinds':RENAMED['list.consult_kinds']},probe:true});
  const run=async vals=>{const d=P.makeDom();Object.entries(Object.assign({'#cjName':'홍','#cjDate':'2026-10-01','#cjNote':'메모','#cjSheet':'확정','#cjStatus':'대기'},vals)).forEach(([k,v])=>{d.$(k).value=v;});const r=await P.asRole('manager',{$:d.$});await r.api.saveConsultationJournal();return {msg:d.$('#cjMsg').textContent,writes:clone(r.ctx.sb.writes)};};
  let x=await run({'#cjStatus':'접수'});assert.equal(x.msg,'허용되지 않은 상담 구분 또는 상태입니다.');assert.equal(x.writes.length,0);
  x=await run({'#cjSheet':'교정 상담'});assert.equal(x.msg,'허용되지 않은 상담 구분 또는 상태입니다.');assert.equal(x.writes.length,0);
  x=await run({'#cjStatus':'확정','#cjSheet':'교정'});assert.equal(x.msg,'');assert.equal(x.writes[0][2][0].status,'확정');assert.equal(x.writes[0][2][0].source_sheet,'교정');
  // 기본 이름이면 option 줄은 옛 HTML 그대로
  const def=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  assert.match(JSON.parse(def['cj.render.manager'])[0],/<select id="cjSheet"><option value="교정" selected>교정<\/option>/);
  // 낯선 코드는 선택칸에 안 나옴
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'list.consult_kinds':JSON.stringify(KIND_SET.concat([{code:'신규구분',label:'신규구분'}])),'list.consult_status':JSON.stringify(CSTATUS_SET.concat([{code:'신규상태',label:'신규상태'}]))},probe:true});
  const re=await evil.asRole('manager');
  assert.deepEqual(clone(re.api2.consultationKindItems().map(i=>i.code)),KIND_SET.map(i=>i.code));
  assert.deepEqual(clone(re.api2.consultationStatusItems().map(i=>i.code)),CSTATUS_SET.map(i=>i.code));
  assert.equal(re.api2.consultationKindLabel('낯선'),'낯선');assert.equal(re.api2.consultationStatusLabel(''),'');
});
test('목록 저장 검사: 4개 목록은 새 항목을 못 늘리고 기본 코드는 못 지우며 이름만 고침',()=>{
  const h=helpers();
  for(const key of ['list.inquiry_sources','list.inquiry_status','list.consult_kinds','list.consult_status']){
    const def=h.HUB_LIST_DEFS.find(d=>d.key===key);
    const renamed=clone(def.def).map((i,n)=>({code:i.code,label:'이름'+n}));
    assert.equal(h.hubListValidate(def,renamed).ok,true,key+' 이름만 바꾸기 OK');
    assert.equal(h.hubListValidate(def,renamed.concat([{code:'새코드',label:'새이름'}])).ok,false,key+' 새 항목 거절');
    assert.equal(h.hubListValidate(def,renamed.slice(1)).ok,false,key+' 기본 코드 지우기 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:'바뀐코드',label:i.label}:i)).ok,false,key+' 코드 바꾸기(=지우고 새로 넣기) 거절');
    assert.equal(h.hubListValidate(def,renamed.map(i=>({code:i.code,label:'같은'}))).ok,false,key+' 이름 중복 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:i.code,label:'a'.repeat(21)}:i)).ok,false,key+' 21자 이름 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:i.code,label:'<b>'}:i)).ok,false,key+' 꺾쇠 거절');
    // 기본 이름 그대로 저장도 OK(되돌리기와 같은 모양)
    assert.equal(h.hubListValidate(def,clone(def.def)).ok,true,key+' 기본 이름 그대로 OK');
  }
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
test('화면: 글 고치기에 문의함 6 · 상담일지 3 묶음이 접혀 나오고 검색으로 찾을 수 있으며, 저장하면 hub_ui_texts에 upsert',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  for(const name of ['📥 문의함 › 문의함 화면','📥 문의함 › 문의 목록·상태 글','📥 문의함 › 문의 상세·답변','📥 문의함 › 카카오 예약','📥 문의함 › 빠른 수기 접수','📥 문의함 › 네이버 광고 알림','🗂 상담일지 › 목록·검색','🗂 상담일지 › 기록 입력·수정','🗂 상담일지 › 오늘·기한 지남'])
    assert.ok(sec.includes('data-hub-group="'+name+'"'),name);
  assert.match(sec,/이름표: inbox\.title/);assert.match(sec,/이름표: cj\.q_limit_hint/);
  const idx=Number(sec.match(/data-hub-text-row="(\d+)">(?:(?!data-hub-text-row)[^])*?이름표: inbox\.btn_filter/)[1]);
  t.el('#hubTxtIn_'+idx).value='걸러내기';
  await t.click('[hub-text-save]='+idx);
  const up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.equal(up.length,1);assert.deepEqual(clone(up[0].payload),{key:'inbox.btn_filter',value:'걸러내기'});
  assert.equal(t.el('#hubTxtMsg_'+idx).textContent,'저장했어요.');
  await t.click('[hub-text-reset]='+idx);
  assert.equal(t.state.texts.length,0);
  const h=helpers(),hits=q=>h.hubTextDefs().filter(d=>h.hubTextMatches(d,q,null)).map(d=>d.key);
  assert.ok(hits('덴트웹').includes('inbox.kb_entered')&&hits('덴트웹').includes('inbox.confirm_undo_dentweb'));
  assert.ok(hits('상태·담당').includes('inbox.btn_save'));
  assert.ok(hits('기한 지남').includes('cj.q_overdue'));
  assert.ok(hits('상담 구분').includes('cj.f_kind'));
});
test('화면: 🔢 숫자·기준 — 문의함·상담일지 숫자 4개가 더 있고 잘못된 값은 DB 호출 없이 거절, 저장·되돌리기',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,33);
  assert.ok(sec.includes('📥 문의함 기준')&&sec.includes('🗂 상담일지 기준'));
  assert.match(sec,/id="hubSetIn_14" type="number" inputmode="numeric" min="5" max="180" value="30"/);
  assert.match(sec,/id="hubSetIn_15" type="number" inputmode="numeric" min="5" max="100" value="20"/);
  assert.match(sec,/id="hubSetIn_16" type="number" inputmode="numeric" min="10" max="100" value="20"/);
  assert.match(sec,/id="hubSetIn_17" type="number" inputmode="numeric" min="20" max="300" value="100"/);
  const before=t.state.calls.length;
  for(const [i,bad] of [[14,'4'],[14,'181'],[14,'abc'],[14,''],[15,'4'],[15,'101'],[16,'9'],[16,'101'],[16,'1.5'],[17,'19'],[17,'301']]){
    t.el('#hubSetIn_'+i).value=bad;await t.click('[hub-set-save]='+i);
    assert.match(t.el('#hubSetMsg_'+i).textContent,/저장하지 못했어요/,i+' '+bad);
  }
  assert.equal(t.state.calls.length,before,'잘못된 값은 DB를 부르지 않음');
  t.el('#hubSetIn_14').value='45';await t.click('[hub-set-save]=14');
  t.el('#hubSetIn_15').value='30';await t.click('[hub-set-save]=15');
  t.el('#hubSetIn_16').value='40';await t.click('[hub-set-save]=16');
  t.el('#hubSetIn_17').value='150';await t.click('[hub-set-save]=17');
  const ups=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.deepEqual(clone(ups.map(u=>u.payload)),[{key:'inbox.group_window_min',value:'45'},{key:'inbox.alert_limit',value:'30'},{key:'consult.page_size',value:'40'},{key:'consult.action_limit',value:'150'}]);
  await t.click('[hub-set-reset]=17');
  assert.equal(t.state.settings.find(r=>r.key==='consult.action_limit').value,'100','되돌리기는 기본값을 다시 적음(설정 표는 지울 수 없음)');
});
test('화면: 📋 목록에 문의 출처·문의 상태·상담 구분·상담 상태 이름이 있고, 코드는 회색(못 고침)·새 항목 추가 단추는 없음',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=lists');
  const sec=t.section.innerHTML;
  assert.ok(sec.includes('문의 출처 이름')&&sec.includes('문의 상태 이름')&&sec.includes('상담 구분 이름')&&sec.includes('상담 상태 이름'));
  assert.equal((sec.match(/<span class="hub-code">/g)||[]).length,37+8+7+6+5+32);
  assert.equal((sec.match(/data-hub-list-add=/g)||[]).length,2,'새 항목을 늘릴 수 있는 목록은 직원 부서·서류 종류뿐');
  assert.match(sec,/<span class="hub-code">naver_talktalk<\/span><input id="hubLstLbl_8_3" type="text" maxlength="20" value="네이버 톡톡"/);
  assert.match(sec,/<span class="hub-code">recall_1<\/span><input id="hubLstLbl_9_2" type="text" maxlength="20" value="리콜 1차"/);
  assert.match(sec,/<span class="hub-code">카카오,네이버예약,당근<\/span><input id="hubLstLbl_10_4" type="text" maxlength="20" value="카카오,네이버예약,당근"/);
  assert.match(sec,/<span class="hub-code">확정<\/span><input id="hubLstLbl_11_3" type="text" maxlength="20" value="확정"/);
  ['NEW(미처리)','진행중','1차 연락','리콜 2차','리콜 3차','종결','상담일지 전환'].forEach((v,i)=>{t.el('#hubLstLbl_9_'+i).value=v;});
  await t.click('[hub-list-save]=9');
  const up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.equal(up.length,1);assert.equal(up[0].payload.key,'list.inquiry_status');
  assert.deepEqual(clone(JSON.parse(up[0].payload.value)),[{code:'new',label:'NEW(미처리)'},{code:'in_progress',label:'진행중'},{code:'recall_1',label:'1차 연락'},{code:'recall_2',label:'리콜 2차'},{code:'recall_3',label:'리콜 3차'},{code:'closed',label:'종결'},{code:'converted',label:'상담일지 전환'}]);
});

/* ───────────── 8. DB에도 있어 안 옮긴 것 · 기존 시험이 찾는 줄 ───────────── */
test('DB에도 같은 값이 있어 안 옮김: 광고 알림 기준 금액 100,000원(DB 함수) · 기존 시험이 줄 모양을 찾는 것: 불러오는 건수 150·선택칸 option 줄·라벨 줄',()=>{
  const h=helpers();
  assert.ok(!h.HUB_SETTING_DEFS.some(d=>/threshold|100000|load_limit/.test(d.key)),'광고 기준 금액·불러오는 건수 키는 만들지 않음');
  assert.match(hr,/Number\(row\.threshold_krw\|\|100000\)/);
  assert.match(read('db/ai_billing_alerts_draft.sql'),/coalesce\(new\.threshold_krw,100000\)/);
  assert.match(hr,/\.order\('received_at',\{ascending:false\}\)\.limit\(150\);/);
  assert.match(hr,/<option value="new" \$\{INBOX_FILTER\.status==='new'\?'selected':''\}>NEW\(미처리\)<\/option>/);
  assert.match(hr,/<option value="recall_1" \$\{INBOX_FILTER\.status==='recall_1'\?'selected':''\}>/);
  assert.match(hr,/<label>지시\/혹은 기타사항<\/label><textarea id="cjInstruction" maxlength="1000"><\/textarea>/);
  assert.match(hr,/<label>특이사항<\/label><textarea id="cjSpecial" maxlength="1000"><\/textarea>/);
  assert.match(hr,/class="hint">매니저·실장·원장만 볼 수 있습니다\. 원본 엑셀 행은 가져오지 않으며/);
  assert.match(hr,/리콜 = 다시 연락할 문의/);
  assert.match(hr,/consultationServerQueryPlan\(CONSULTATION_FILTERS,CONSULTATION_PAGE_SIZE\)/);
  // 이번에 안 옮긴 것(차례 7로 미룸): 불만 감지 말 · 시트별 추가 칸 이름 · 답하러 가는 주소
  assert.match(hr,/\/불만\|환불\|신고\|항의\|민원\/\.test/);
  assert.match(hr,/const CONSULTATION_SOURCE_FIELDS=\{/);
  assert.match(hr,/https:\/\/center-pf\.kakao\.com\//);
});
test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장)',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_5.sql')),false);
  const SEC=String.fromCharCode(0xA7); // 섹션 기호는 어디에도 쓰지 않는 규칙(이 파일에도 글자 그대로는 안 씀)
  assert.ok(!js.includes(SEC)&&!hr.includes(SEC));
  for(const f of ['tests/fixtures/hub5-harness.cjs','tests/hub-ui-texts-5.test.js','tests/manual/make-hub5-golden.cjs','tests/sql/pglite-hub-ui-texts-5.mjs'])assert.ok(!read(f).includes(SEC),f);
});
test('hr.html·hub-texts.js·이 시험 파일의 한글이 깨지지 않고 UTF-8로 저장돼 있다',()=>{
  const bad=Buffer.from([0xEF,0xBF,0xBD]);
  for(const f of ['hr.html','hub-texts.js','tests/hub-ui-texts-5.test.js','tests/fixtures/hub5-harness.cjs'])assert.equal(fs.readFileSync(path.join(root,f)).includes(bad),false,f+' 에 UTF-8 깨짐(교체 문자)이 있습니다.');
  assert.ok(!js.startsWith('\uFEFF'));
});
