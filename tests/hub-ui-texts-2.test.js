// 직원허브 「⚙️ 허브 설정」 차례 2 시험 — 내 서류함 + 업무자료 글·목록·카드를 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 두 화면이 옛 화면(656ad0d)과 글자 하나까지 같음 ②표에 값이 있으면 그 글 ③표 읽기 실패해도 기본값
//       ④서류 종류·상태 이름은 코드 고정(이름만 고침) ⑤업무자료 카드 링크는 http(s)만.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll}=require('./fixtures/hub2-harness.cjs');
const golden=JSON.parse(read('tests/fixtures/hub2-golden-656ad0d.json'));
const clone=x=>JSON.parse(JSON.stringify(x));

function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block);
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubSetting,hubSettingSetValues,hubList,hubListValidate,HUB_LIST_DEFS,HUB_CARD_DEFS,hubTextDefs,hubTextDefByKey,hubTextsSave,hubCards,hubCardUrlOk,hubCardNormalize,hubCardsValidate,hubCardsParse,hubCardsSave,hubCardsReset,hubCardsCanon,hubTextSetOverrides};',c);
  return c.h;
}
// 표(hub_ui_texts·app_settings) 흉내
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

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 2 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 이름',()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>/^(onbo|workdoc)\./.test(d.key));
  assert.equal(defs.length,192,'차례 2 글 키 수(내 서류함 + 업무자료)');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.equal(screens.length,11);
  assert.ok(screens.every(s=>s.startsWith('📎 내 서류함')||s.startsWith('📚 업무자료')));
});

test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:hubT|hubText|hubTextHtml|T)\(\s*'([a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(hr))){
    const key=m[1];if(!/^(onbo|workdoc)\./.test(key))continue;
    const v=vm.runInNewContext(m[2]);
    if(found.has(key))assert.equal(found.get(key),v,key+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(key,v);
  }
  const defs=h.hubTextDefs().filter(d=>/^(onbo|workdoc)\./.test(d.key));
  const guideItems=vm.runInNewContext(hr.match(/const G_ONBOARDING_GUIDE_ITEMS=(\[[^\n]*?\]);/)[1]);
  for(const d of defs){
    if(d.key==='onbo.guide.items'){assert.equal(d.def,guideItems.join('\n'),'신입 첫날 안내 기본 글');continue;} // 코드에는 목록 변수 G_ONBOARDING_GUIDE_ITEMS로 둠
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of found.keys())assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  assert.ok(guideItems.length===15);
});

test('목록·카드 기본값: 서류 종류·상태 이름·업무자료 카드가 hr.html과 같다',()=>{
  const h=helpers(),L=k=>clone(h.HUB_LIST_DEFS.find(d=>d.key===k).def);
  assert.deepEqual(L('list.doc_kinds').map(i=>i.code),['잠복결핵 검사서','자격증','보안서약서','면허증','신분증 사본','기타']);
  assert.ok(L('list.doc_kinds').every(i=>i.code===i.label));
  assert.deepEqual(L('list.onbo_status'),[{code:'미제출',label:'미제출'},{code:'제출',label:'제출'},{code:'확인',label:'확인'}]);
  assert.deepEqual(L('list.payment_status'),[{code:'chief_pending',label:'실장 검토 대기'},{code:'owner_pending',label:'원장 결재 대기'},{code:'approved',label:'승인'},{code:'rejected',label:'반려'}]);
  assert.equal(h.HUB_LIST_DEFS.find(d=>d.key==='list.doc_kinds').addable,true);
  assert.equal(h.HUB_LIST_DEFS.find(d=>d.key==='list.onbo_status').addable,false);
  assert.equal(h.HUB_LIST_DEFS.find(d=>d.key==='list.payment_status').addable,false);
  // hr.html의 workDocuments(기본 카드)와 같은 내용
  const block=hr.match(/\/\* work-documents:test-start \*\/([\s\S]*?)\/\* work-documents:test-end \*\//)[1];
  const c={};vm.createContext(c);vm.runInContext(block+';this.d=workDocuments;',c);
  assert.deepEqual(clone(c.d),clone(h.HUB_CARD_DEFS[0].def),'기본 카드가 화면 코드와 같음');
  assert.ok(h.hubCardsValidate(h.HUB_CARD_DEFS[0].def).ok,'기본 카드는 검사를 통과');
  // 서류 종류 기본 선택칸 줄(기존 시험이 이 줄을 직접 찾음)이 기본 목록의 근원
  assert.match(hr,/<select id="edType"><option>잠복결핵 검사서<\/option><option>자격증<\/option><option>보안서약서<\/option>/);
  assert.match(hr,/hub-texts\.js\?v=2026100308/,'캐시 번호를 새 값으로 올림(차례 3에서 2026100108 → 2026100109, 차례 4에서 → 2026100110, 차례 5에서 → 2026100111, 차례 6에서 → 2026100112, 차례 7에서 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-02 인박스 판에서 → 2026100223)');
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 두 화면이 옛 화면(656ad0d)과 글자 하나까지 같다',async()=>{
  const out=await renderAll(hr,{engine:false});
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
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
test('목록·카드 값이 모양이 틀려도(깨진 JSON·빈 값·링크 검사 실패) 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.doc_kinds':'not json','list.onbo_status':'[]','list.payment_status':'[{"code":"a"}]','cards.work_materials':'[{"title":"x","url":"javascript:alert(1)"}]'}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
  const blank=await renderAll(hr,{engine:true,textRows:[],settings:{'cards.work_materials':'   '}});
  assert.equal(blank['work.clinical'],golden['work.clinical']);
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다',async()=>{
  const changed=hr.replace("hubT('workdoc.guide_card.label','직원용 안내')","hubT('workdoc.guide_card.label','직원용 안내!')");
  assert.notEqual(changed,hr);
  const out=await renderAll(changed,{engine:false});
  assert.notEqual(out['work.clinical'],golden['work.clinical']);
  const changed2=hr.replace("'제출함'","'제출 함'");
  assert.notEqual((await renderAll(changed2,{engine:false}))['onbo.render.staff'],golden['onbo.render.staff']);
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 업무자료(제목·카드 글·설명서 단계·알림 메시지)',async()=>{
  const rows=[{key:'workdoc.title',value:'📚 자료실 <진짜>'},{key:'workdoc.guide_card.button',value:'설명서 보기'},{key:'workdoc.search.placeholder',value:'찾을 자료'},{key:'workdoc.open',value:'바로가기'},
    {key:'workdoc.guide.title',value:'허브 길잡이'},{key:'workdoc.guide.flow2',value:'근무·연차'},{key:'workdoc.guide.s3.body',value:'첫째 줄\n둘째 줄 <b>'},{key:'workdoc.guide.s1.cap',value:'화면: 홈!'},{key:'workdoc.guide.footer',value:'권한 안내 새 글'},
    {key:'workdoc.push.title',value:'🔔 푸시'},{key:'workdoc.push.m_denied',value:'알림이 막혀 있어요'},{key:'workdoc.push.m_reg_fail',value:'안 됨({detail})'},{key:'workdoc.push.m_un_db_fail',value:'지우기 실패 {detail}'}];
  const o=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.ok(o['work.clinical'].includes('<h2>📚 자료실 &lt;진짜&gt;</h2>'),'제목(꺾쇠는 이스케이프)');
  assert.ok(o['work.clinical'].includes('>설명서 보기</button>'));
  assert.ok(o['work.clinical'].includes('placeholder="찾을 자료"'));
  assert.ok(o['work.clinical'].includes('>바로가기</a>'),'카드 링크 글');
  assert.ok(o['work.clinical'].includes('<h3>진료 매뉴얼</h3>'),'카드 제목은 카드 목록에서 고침 — 안 건드림');
  assert.ok(o['work.guide'].includes('<h2>허브 길잡이</h2>'));
  assert.ok(o['work.guide'].includes('<span><b>02</b>근무·연차</span>'));
  assert.ok(o['work.guide'].includes('<ul><li>첫째 줄</li><li>둘째 줄 &lt;b&gt;</li></ul>'),'줄바꿈 하나가 목록 한 칸');
  assert.ok(o['work.guide'].includes('<figcaption>화면: 홈!</figcaption>'));
  assert.ok(o['work.guide'].includes('권한 안내 새 글</div>'));
  assert.ok(o['work.push_card.push'].includes('🔔 푸시'));
  assert.equal(o['work.sub.denied'],'알림이 막혀 있어요');
  assert.equal(o['work.sub.dberr'],'안 됨(DB망)','{detail} 자리가 실패 이유로 채워짐');
  assert.equal(o['work.unsub.dberr'],'지우기 실패 삭제불가');
  // 안 고친 글은 그대로
  assert.equal(o['work.empty_search'].includes('검색 결과가 없습니다.'),true);
  assert.equal(o['work.sub.unsupported'],golden['work.sub.unsupported']);
});

test('표에 값이 있으면 그 글: 내 서류함(첫날 안내·제출물·체크리스트·서류함·결제·서명·지문·현황·메시지)',async()=>{
  const rows=[{key:'onbo.guide.items',value:'첫째 안내\n\n  둘째 안내  \n셋째 <b>안내</b>'},{key:'onbo.guide.title',value:'🧭 첫날 안내 {n}가지'},{key:'onbo.guide.hint',value:'새 설명'},
    {key:'onbo.items.title',value:'📋 제출물'},{key:'onbo.items.btn_submit',value:'냈어요'},{key:'onbo.items.required',value:'(꼭)'},
    {key:'onbo.check.title',value:'✅ 체크'},{key:'onbo.check.row1.label',value:'월급 통장'},{key:'onbo.check.row5.rule',value:'파일이나 서명'},{key:'onbo.check.state_done',value:'끝'},{key:'onbo.check.state_need',value:'아직'},{key:'onbo.check.f_bank',value:'은행'},
    {key:'onbo.docs.title',value:'📎 내 서류'},{key:'onbo.docs.filter_all',value:'전부'},{key:'onbo.docs.filter_leave',value:'연차 증빙서'},{key:'onbo.docs.btn_leave',value:'휴가 신청'},{key:'onbo.docs.th_kind',value:'분류'},{key:'onbo.docs.approval_row',value:'결재 · {kind}'},{key:'onbo.docs.empty_all',value:'서류 없음'},{key:'onbo.docs.err_docs',value:'서류 못 읽음: {detail}'},
    {key:'onbo.pay.title',value:'💳 돈 요청'},{key:'onbo.pay.f_item',value:'무엇 때문에 *'},{key:'onbo.pay.btn_submit',value:'요청하기'},{key:'onbo.pay.none',value:'영수증 없음'},{key:'onbo.pay.btn_approve',value:'OK'},{key:'onbo.pay.m_missing',value:'빈칸이 있어요'},{key:'onbo.pay.m_fail',value:'안 됐어요({detail})'},{key:'onbo.pay.p_reject_reason',value:'왜 반려해요?'},{key:'onbo.pay.a_act_fail',value:'처리 불가 {detail}'},
    {key:'onbo.sign.title',value:'✍ 서명함'},{key:'onbo.sign.count',value:'서명 {n}장'},{key:'onbo.sign.m_bad',value:'PNG만 가능'},
    {key:'onbo.fp.title',value:'🖐 지문'},{key:'onbo.fp.status_pending',value:'승인 기다림'},{key:'onbo.fp.pending_count',value:'대기 {n}'},{key:'onbo.fp.btn_report',value:'보고하기'},{key:'onbo.fp.m_reported',value:'보고 완료'},
    {key:'onbo.over.title',value:'👀 현황판'},{key:'onbo.over.common',value:'은행 {bank} / Notion {notion}'},{key:'onbo.over.all_done',value:'모두 냈어요'},
    {key:'onbo.docs.v_pick',value:'파일을 골라 주세요'},{key:'onbo.docs.v_size',value:'너무 커요'},{key:'onbo.docs.v_blocked',value:'이 파일은 안 돼요'},{key:'onbo.docs.v_tb',value:'결핵 검사서는 PDF·이미지만'},
    {key:'onbo.docs.m_upload_fail',value:'올리기 실패 {detail}'},{key:'onbo.docs.a_not_found',value:'서류 없음 알림'},{key:'onbo.docs.a_open_fail',value:'못 열었어요: {detail}'},{key:'onbo.docs.btn_upload_leave',value:'증빙 올리기'}];
  const o=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.deepEqual(JSON.parse(o['onbo.guide.items']),['첫째 안내','둘째 안내','셋째 <b>안내</b>'],'한 줄=항목 하나, 빈 줄은 건너뜀');
  assert.ok(o['onbo.guide.card.collapsed'].includes('🧭 첫날 안내 3가지</summary>'));
  assert.ok(o['onbo.guide.card.collapsed'].includes('<li>셋째 &lt;b&gt;안내&lt;/b&gt;</li>'));
  assert.ok(o['onbo.guide.card.open'].includes('<div class="hint">새 설명</div>'));
  const R=o['onbo.render.manager'];
  assert.ok(R.includes('<h2>📋 제출물</h2>'));assert.ok(R.includes('>냈어요</button>'));
  assert.ok(R.includes('<span class="sub">(꼭)</span>'));
  assert.ok(R.includes('<h2>✅ 체크</h2>'));assert.ok(R.includes('<td>월급 통장</td>'));assert.ok(R.includes('<td>파일이나 서명</td>'));assert.ok(R.includes('>끝</span>')&&R.includes('>아직</span>'));assert.ok(R.includes('<label>은행</label>'));
  assert.ok(R.includes('<h2>📎 내 서류</h2>'));assert.ok(R.includes('>전부</button>'));
  assert.ok(R.includes('data-doc-filter-button="연차증빙" onclick="filterEmployeeDocuments(\'연차증빙\')">연차 증빙서</button>'),'단추 글만 바뀌고 안쪽 구분값(연차증빙)은 그대로');
  assert.ok(R.includes('<option value="연차증빙">연차 증빙서</option>'),'올릴 종류 값은 그대로 · 보이는 글만');
  assert.ok(R.includes('>휴가 신청</button>'));assert.ok(R.includes('<th>분류</th>'));assert.ok(R.includes('<td>결재 · 보고</td>'),'{kind}가 결재 종류로 채워짐');
  assert.ok(R.includes('<h2>💳 돈 요청</h2>'));assert.ok(R.includes('<label>무엇 때문에 *</label>'));assert.ok(R.includes('>요청하기</button>'));assert.ok(R.includes('>OK</button>')||o['onbo.pay.chief.rows'].includes('>OK</button>'));
  assert.ok(o['onbo.pay.staff.rows'].includes('영수증.pdf')&&o['onbo.pay.staff.rows'].includes('>영수증 없음</td>'),'영수증 없는 줄');
  assert.ok(R.includes('✍ 서명함')&&R.includes('서명 2장'));
  assert.ok(o['onbo.fp.manager.pending'].includes('대기 2</div>')&&o['onbo.fp.staff.none'].includes('보고하기'));
  assert.ok(o['onbo.fp.staff.pending'].includes('승인 기다림'),'내 상태 표시');
  assert.equal(o['onbo.fp.status.mapped'],JSON.stringify(['승인 기다림','완료','반려','승인 기다림']));
  assert.ok(o['onbo.overview.manager'].includes('👀 현황판')&&o['onbo.overview.manager'].includes('은행 끝 / Notion 아직'),'{bank}·{notion}이 완료/확인 필요 글(바뀐 글 포함)로 채워짐');
  assert.ok(o['onbo.overview.alldone'].includes('모두 냈어요'));
  const v=JSON.parse(o['onbo.validate']);
  assert.deepEqual(v,['파일을 골라 주세요',golden['onbo.validate']&&JSON.parse(golden['onbo.validate'])[1],'너무 커요','이 파일은 안 돼요','','결핵 검사서는 PDF·이미지만','','']);
  const msgs=JSON.parse(o['onbo.messages']);
  assert.deepEqual(msgs['pay.missing'].msg,['빈칸이 있어요']);assert.deepEqual(msgs['pay.rpcfail'].msg,['안 됐어요(요청실패)']);
  assert.deepEqual(msgs['sign.badfile'].msg,['PNG만 가능']);assert.deepEqual(msgs['fp.ok'].msg,['보고 완료']);
  assert.deepEqual(msgs['doc.storagefail'].msg,['올리기 실패 저장소실패']);assert.deepEqual(msgs['dl.notfound'].alerts,['서류 없음 알림',golden['onbo.messages']&&JSON.parse(golden['onbo.messages'])['dl.notfound'].alerts[1]]);
  assert.deepEqual(msgs['dl.downloadfail'].alerts[0],'못 열었어요: 내려받기실패');
  assert.deepEqual(msgs['pay.actfail'].alerts,['처리 불가 결재실패']);
  assert.equal(o['onbo.scope.leave'],'증빙 올리기');
  // 안 고친 글은 옛 글 그대로
  assert.equal(o['onbo.pay.error'].includes('결제 요청 연결 대기: 표없음'),true);
  assert.equal(o['onbo.sign.none'],golden['onbo.sign.none'].replace('✍ 개인서명 보관함','✍ 서명함'));
});

test('설정 화면의 글을 시험 도구 밖 가짜 DOM에서도: 글 고치기 키마다 hubText 덮어쓰기가 안전(빈 글·공백만이면 무시)',async()=>{
  const o=await renderAll(hr,{engine:true,textRows:[{key:'onbo.docs.title',value:'   '},{key:'workdoc.title',value:''},{key:'onbo.guide.items',value:' \n \n'}],settings:{}});
  for(const k of Object.keys(golden))assert.equal(o[k],golden[k],k);
});

/* ───────────── 4. 목록: 코드 고정 · 이름만 고침 ───────────── */
test('서류 종류·상태 이름: 이름만 바뀌고 저장되는 값(코드)은 그대로, 새 서류 종류는 선택칸에 나온다',async()=>{
  const settings={'list.doc_kinds':JSON.stringify([{code:'자격증',label:'자격 증명서'},{code:'잠복결핵 검사서',label:'결핵 검사서'},{code:'치위생 보수교육',label:'치위생 보수교육'}]),
    'list.onbo_status':JSON.stringify([{code:'미제출',label:'아직'},{code:'제출',label:'냄'},{code:'확인',label:'확인함'}]),
    'list.payment_status':JSON.stringify([{code:'chief_pending',label:'실장님 보는 중'},{code:'owner_pending',label:'원장님 보는 중'},{code:'approved',label:'OK'},{code:'rejected',label:'NO'}])};
  const o=await renderAll(hr,{engine:true,textRows:[],settings});
  const R=o['onbo.docs.manager.full'];
  assert.ok(R.includes('<option value="잠복결핵 검사서">결핵 검사서</option>'),'값=코드 · 보이는 글=새 이름');
  assert.ok(R.includes('<option value="자격증">자격 증명서</option>'));
  assert.ok(R.includes('<option>면허증</option>')&&R.includes('<option>기타</option>'),'안 고친 기본 종류는 그대로(값=이름)');
  assert.ok(R.includes('<option>치위생 보수교육</option>'),'새로 늘린 종류가 선택칸 끝에 나옴');
  assert.ok(R.includes('<td>결핵 검사서</td>'),'서류 표의 종류 칸도 보이는 이름으로');
  assert.ok(R.includes('<td>새종류</td>'),'목록에 없는 옛 값은 값 그대로');
  assert.ok(o['onbo.render.owner'].includes('<span class="b mid">냄</span>')&&o['onbo.render.owner'].includes('<span class="b no">아직</span>'),'제출물 상태는 이름만 바뀌고 색은 코드 기준');
  assert.ok(o['onbo.render.owner'].includes('onclick="confirmOnbo(2)"')&&o['onbo.render.owner'].includes('onclick="submitOnbo(3)"'),'제출 상태(코드)일 때 확인 단추·미제출일 때 제출 단추가 그대로 나옴');
  assert.equal(JSON.parse(o['onbo.pay.status']).join('|'),'실장님 보는 중|원장님 보는 중|OK|NO|알 수 없음');
  assert.ok(o['onbo.pay.chief.rows'].includes('<td>실장님 보는 중</td>')&&o['onbo.pay.chief.rows'].includes('paymentRequestAct(61,\'approve\')'),'결재 단추는 코드(chief_pending) 기준으로 그대로');
  // 검사 함수는 이름이 바뀌어도 잘 통과(서류 검사는 코드로 함)
  assert.equal(JSON.parse(o['onbo.validate'])[5],golden['onbo.validate']&&JSON.parse(golden['onbo.validate'])[5]);
});

test('목록 저장 검사: 서류 종류는 새 항목 OK·기본 코드는 못 지움·상태 이름은 새 항목 못 늘림',()=>{
  const h=helpers(),D=k=>h.HUB_LIST_DEFS.find(d=>d.key===k);
  const kinds=clone(D('list.doc_kinds').def);
  assert.equal(h.hubListValidate(D('list.doc_kinds'),kinds.concat([{code:'치위생 보수교육',label:'치위생 보수교육'}])).ok,true);
  assert.equal(h.hubListValidate(D('list.doc_kinds'),kinds.map((i,n)=>n===1?{code:i.code,label:'자격 증명서'}:i)).ok,true,'이름만 고침');
  const noCert=h.hubListValidate(D('list.doc_kinds'),kinds.filter(i=>i.code!=='자격증'));
  assert.equal(noCert.ok,false);assert.match(noCert.reason,/기본 항목은 지울 수 없어요/);
  const st=clone(D('list.onbo_status').def);
  assert.equal(h.hubListValidate(D('list.onbo_status'),st.concat([{code:'새상태',label:'새상태'}])).ok,false,'제출물 상태는 새 항목 못 늘림');
  assert.equal(h.hubListValidate(D('list.onbo_status'),st.map(i=>i.code==='제출'?{code:'제출',label:'냈음'}:i)).ok,true);
  const pay=clone(D('list.payment_status').def);
  assert.equal(h.hubListValidate(D('list.payment_status'),pay.concat([{code:'x',label:'x'}])).ok,false);
  // 코드를 바꿔 넣으면(기본 코드가 빠진 것) 거절
  assert.equal(h.hubListValidate(D('list.payment_status'),pay.map(i=>i.code==='approved'?{code:'done',label:'승인'}:i)).ok,false,'코드는 못 바꿈');
  // 읽을 때도: 저장된 값에서 코드가 바뀌어 들어와도 기본 코드는 되살아나고 이름만 따라감
  h.hubSettingSetValues({'list.payment_status':JSON.stringify([{code:'approved',label:'통과'}])});
  const got=clone(h.hubList('list.payment_status',pay));
  assert.deepEqual(got.map(i=>i.code),['chief_pending','owner_pending','approved','rejected']);
  assert.equal(got.find(i=>i.code==='approved').label,'통과');
});

/* ───────────── 5. 업무자료 카드 ───────────── */
test('카드 링크 검사: http(s)만 — javascript:·data:·file:·ftp·빈 주소·공백·따옴표·사용자정보(@) 거절',()=>{
  const h=helpers(),ok=u=>h.hubCardUrlOk(u);
  for(const u of ['https://app.notion.com/p/1f7ba489?source=copy_link','http://example.com','HTTPS://EXAMPLE.COM/A?b=1#c','https://example.com:8443/x','https://sub.example.co.kr/가나다?q=한글'])assert.equal(ok(u),true,u);
  for(const u of ['javascript:alert(1)','JaVaScRiPt:alert(1)','  javascript:alert(1)','data:text/html,<b>x</b>','vbscript:x','file:///c:/a','ftp://example.com','//example.com','example.com','https://','http://','https:// a.com','https://a.com/x y','https://a.com/"onmouseover="x','https://a.com/<script>','https://user:pw@a.com','https://a@b.com','https://a.com\\evil','','   ',null,undefined,'https://'+'a'.repeat(1001)])assert.equal(ok(u),false,String(u));
});

test('카드 검사·정리: 제목 필수·글자 수·부서·특정 부서에만 보이기·빈 목록 허용·30장 제한',()=>{
  const h=helpers(),base={icon:'📘',category:'매뉴얼',title:'안내',description:'설명',url:'https://a.com/x',manual:false,depts:['진료실']};
  let r=h.hubCardNormalize(base);assert.equal(r.ok,true);assert.deepEqual(clone(r.card),{icon:'📘',category:'매뉴얼',title:'안내',description:'설명',depts:[],manual:false,url:'https://a.com/x'},'특정 부서 끄면 부서는 비움 · 칸 순서 고정');
  r=h.hubCardNormalize(Object.assign({},base,{manual:true,depts:[' 진료실 ','진료실','상담','']}));assert.deepEqual(clone(r.card.depts),['진료실','상담'],'공백 정리·중복 제거');
  assert.equal(h.hubCardNormalize(Object.assign({},base,{icon:''})).card.icon,'📄','아이콘 비면 기본');
  for(const [bad,why] of [[{title:'  '},/제목/],[{title:'가'.repeat(41)},/40자/],[{title:'a\nb'},/줄바꿈/],[{icon:'x'.repeat(13)},/아이콘/],[{category:'x'.repeat(21)},/종류/],[{description:'x'.repeat(201)},/200자/],[{url:'javascript:alert(1)'},/http/],[{url:''},/http/],[{depts:'진료실'},/부서/],[{manual:true,depts:Array.from({length:13},(_,i)=>'부서'+i)},/12개/],[{manual:true,depts:['가'.repeat(21)]},/20자/]]){
    const x=h.hubCardNormalize(Object.assign({},base,bad));assert.equal(x.ok,false,JSON.stringify(bad));assert.match(x.reason,why,JSON.stringify(bad));
  }
  assert.equal(h.hubCardNormalize(null).ok,false);assert.equal(h.hubCardNormalize([]).ok,false);
  assert.equal(h.hubCardsValidate([]).ok,true,'카드를 전부 지워도 됨');assert.equal(h.hubCardsValidate([]).value,'[]');
  assert.equal(h.hubCardsValidate(Array.from({length:31},()=>base)).ok,false);assert.equal(h.hubCardsValidate(Array.from({length:30},()=>base)).ok,true);
  assert.equal(h.hubCardsValidate('x').ok,false);
  const two=h.hubCardsValidate([base,Object.assign({},base,{title:'두번째'})]);assert.equal(JSON.parse(two.value).map(c=>c.title).join(),'안내,두번째');
});

test('카드 읽기: 값이 없거나 깨졌거나 링크가 틀리면 기본 카드, 빈 목록 [] 은 카드 없음, 고친 카드는 그대로',()=>{
  const h=helpers(),def=clone(h.HUB_CARD_DEFS[0].def),key='cards.work_materials';
  assert.deepEqual(clone(h.hubCards(key,def)),def,'값 없음');
  for(const bad of ['','   ','not json','{"a":1}','[1]','[{"title":"x"}]','[{"title":"x","url":"javascript:alert(1)"}]','[{"title":"x","url":"https://a.com"},{"title":"","url":"https://a.com"}]']){
    h.hubSettingSetValues({[key]:bad});assert.deepEqual(clone(h.hubCards(key,def)),def,'기본 카드: '+bad);
  }
  h.hubSettingSetValues({[key]:'[]'});assert.deepEqual(clone(h.hubCards(key,def)),[],'빈 목록은 원장이 다 지운 것');
  h.hubSettingSetValues({[key]:JSON.stringify([{icon:'📘',category:'매뉴얼',title:'새 자료',description:'d',url:'https://a.com',manual:false,depts:[]},def[0]])});
  assert.deepEqual(clone(h.hubCards(key,def)).map(c=>c.title),['새 자료','진료 매뉴얼'],'순서 그대로');
  // 기본 목록을 변형해 돌려줘도 원본 기본값이 안 망가짐
  const got=h.hubCards(key,def);got[0].title='망가뜨림';assert.equal(def[0].title,'진료 매뉴얼');
});

test('업무자료 화면: 원장이 고친 카드 목록이 그대로 나오고(순서·이스케이프), 부서 제한은 기존 규칙 그대로',async()=>{
  const cards=[{icon:'📘',category:'전체 공지',title:'전체 <자료>',description:'모두 봄',url:'https://a.com/x?a=1&b=2',manual:false,depts:[]},
    {icon:'🦷',category:'기공',title:'기공 매뉴얼',description:'기공팀만',url:'https://lab.example.com',manual:true,depts:['기공팀']},
    {icon:'🩺',category:'진료 매뉴얼',title:'진료 매뉴얼',description:'진료실·상담 직무에 필요한 업무 안내를 확인합니다.',url:'https://app.notion.com/p/1f7ba489f082806e9761e748524994bc?source=copy_link',manual:true,depts:['진료실','상담']}];
  const o=await renderAll(hr,{engine:true,textRows:[],settings:{'cards.work_materials':JSON.stringify(cards)}});
  const titles=h=>[...h.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m=>m[1]);
  assert.deepEqual(titles(o['work.clinical']),['직원 허브 사용 설명서','전체 &lt;자료&gt;','진료 매뉴얼'],'진료실: 전체 카드 + 진료 매뉴얼(기공 매뉴얼은 안 보임)');
  assert.deepEqual(titles(o['work.other_dept']),['직원 허브 사용 설명서','전체 &lt;자료&gt;','기공 매뉴얼'],'기공팀 직원은 전체 카드 + 기공 매뉴얼(진료 매뉴얼은 안 보임)');
  assert.ok(o['work.clinical'].includes('href="https://a.com/x?a=1&amp;b=2" target="_blank" rel="noopener"'),'링크는 이스케이프 · 새 창 noopener');
  assert.ok(o['work.clinical'].includes('<div class="workdoc-icon">📘</div>'));
  // 기공팀 직원(other_dept)은 전체 카드 + 기공 매뉴얼
  // 빈 목록이면 카드 없이 「검색 결과가 없습니다.」
  const none=await renderAll(hr,{engine:true,textRows:[],settings:{'cards.work_materials':'[]'}});
  assert.ok(none['work.clinical'].includes('<div id="workDocResults" class="workdocs-grid"><div class="empty">검색 결과가 없습니다.</div></div>'));
  // 아이콘에 HTML을 넣어도 글자로만 보임
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'cards.work_materials':JSON.stringify([{icon:'<img src=x onerror=alert(1)>',category:'c',title:'t',description:'d',url:'https://a.com',manual:false,depts:[]}])}});
  assert.equal(evil['work.clinical'].includes('<img src=x'),false);
});

/* ───────────── 6. 카드 저장·되돌리기(DB 호출) ───────────── */
test('카드 저장: 검사 통과하면 app_settings upsert, 틀리면 DB를 부르지 않음, 되돌리기는 기본 카드를 다시 적음, 권한 없음 안내',async()=>{
  const h=helpers(),def=clone(h.HUB_CARD_DEFS[0].def),key='cards.work_materials',good={icon:'📘',category:'c',title:'새 자료',description:'d',url:'https://a.com',manual:false,depts:[]};
  let t=fakeSb({});
  let r=await h.hubCardsSave(t.sb,key,[good]);
  assert.deepEqual(clone(r),{ok:true,action:'saved',items:[good]});
  assert.deepEqual(clone(t.state.calls.filter(c=>c.op==='upsert')[0].payload),{key,value:h.hubCardsValidate([good]).value});
  assert.deepEqual(JSON.parse(t.state.settings.find(x=>x.key===key).value),[good]);
  assert.equal(t.state.calls.filter(c=>c.op==='upsert')[0].opts.onConflict,'key');
  t=fakeSb({});
  r=await h.hubCardsSave(t.sb,key,[Object.assign({},good,{url:'javascript:alert(1)'})]);
  assert.equal(r.ok,false);assert.equal(r.reason,'invalid');assert.match(r.message,/http/);assert.equal(t.state.calls.length,0,'틀리면 DB 안 부름');
  assert.equal((await h.hubCardsSave(t.sb,'cards.nope',[good])).reason,'unknown_key');
  r=await h.hubCardsReset(t.sb,key);assert.equal(r.ok,true);assert.equal(r.action,'reset');
  assert.deepEqual(JSON.parse(t.state.settings.find(x=>x.key===key).value),def,'기본 카드를 다시 적음');
  const f=fakeSb({failWrite:true});
  r=await h.hubCardsSave(f.sb,key,[good]);assert.equal(r.ok,false);assert.equal(r.reason,'write_failed');assert.equal(r.error.code,'42501');
});

/* ───────────── 7. 「⚙️ 허브 설정」 화면(가짜 DOM): 글 고치기 새 묶음 · 목록 · 카드 편집 ───────────── */
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
function setCard(t,di,ri,v){
  t.el('#hubCrd_'+di+'_'+ri+'_icon').value=v.icon;t.el('#hubCrd_'+di+'_'+ri+'_category').value=v.category;t.el('#hubCrd_'+di+'_'+ri+'_title').value=v.title;
  t.el('#hubCrd_'+di+'_'+ri+'_description').value=v.description;t.el('#hubCrd_'+di+'_'+ri+'_url').value=v.url;t.el('#hubCrd_'+di+'_'+ri+'_depts').value=v.depts;
  t.el('#hubCrd_'+di+'_'+ri+'_manual').checked=!!v.manual;
}
const DEF_CARD={icon:'🩺',category:'진료 매뉴얼',title:'진료 매뉴얼',description:'진료실·상담 직무에 필요한 업무 안내를 확인합니다.',url:'https://app.notion.com/p/1f7ba489f082806e9761e748524994bc?source=copy_link',depts:'진료실,상담',manual:true};

test('화면: 글 고치기에 새 묶음 11개가 접혀 나오고 검색으로 찾을 수 있으며, 저장하면 hub_ui_texts에 upsert',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  for(const name of ['📎 내 서류함 › 신입 첫날 안내','📎 내 서류함 › 입사 제출물','📎 내 서류함 › 공통 입사 체크리스트','📎 내 서류함 › 서류함(올리기·목록)','📎 내 서류함 › 결제 요청','📎 내 서류함 › 개인서명 보관함','📎 내 서류함 › 지문 등록 확인','📎 내 서류함 › 입사 체크 현황(실장·매니저)','📚 업무자료','📚 업무자료 › 직원 허브 사용 설명서','📚 업무자료 › 모바일 알림'])
    assert.ok(sec.includes('data-hub-group="'+name+'"'),name);
  assert.match(sec,/이름표: onbo\.guide\.items/);assert.match(sec,/한 줄이 항목 하나/);
  // 신입 첫날 안내 항목 고치기 → 저장
  const idx=Number(sec.match(/data-hub-text-row="(\d+)">(?:(?!data-hub-text-row)[^])*?이름표: onbo\.guide\.items/)[1]);
  t.el('#hubTxtIn_'+idx).value='첫째\n둘째';
  await t.click('[hub-text-save]='+idx);
  const up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.equal(up.length,1);assert.deepEqual(clone(up[0].payload),{key:'onbo.guide.items',value:'첫째\n둘째'});
  assert.equal(t.el('#hubTxtMsg_'+idx).textContent,'저장했어요.');
  // 기본으로 되돌리기 → 행 삭제
  await t.click('[hub-text-reset]='+idx);
  assert.equal(t.state.texts.length,0);
});

test('화면: 📋 목록에 서류 종류·상태 이름 목록과 업무자료 카드 편집이 있고, 코드는 회색·카드 편집(추가·순서·빼기·저장·되돌리기)이 된다',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=lists');
  let sec=t.section.innerHTML;
  for(const s of ['직원 부서','서류 종류','입사 제출물 상태 이름','결제 요청 상태 이름','업무자료 카드'])assert.ok(sec.includes(s),s);
  assert.match(sec,/data-hub-list-add="1"/,'서류 종류만 새 항목 추가 단추');
  assert.equal((sec.match(/data-hub-list-add="/g)||[]).length,2,'부서·서류 종류만 추가 가능(상태 이름 두 목록은 이름만 고침)');
  assert.match(sec,/<span class="hub-code">chief_pending<\/span><input id="hubLstLbl_3_0" type="text" maxlength="20" value="실장 검토 대기"/);
  assert.match(sec,/id="hubCrd_0_0_title"[^>]*value="진료 매뉴얼"/);assert.match(sec,/id="hubCrd_0_0_url"[^>]*value="https:\/\/app\.notion\.com\/p\/1f7ba489/);
  assert.match(sec,/id="hubCrd_0_0_depts"[^>]*value="진료실,상담"/);assert.match(sec,/id="hubCrd_0_0_manual" type="checkbox" checked/);
  assert.match(sec,/data-hub-card-add="0"/);assert.match(sec,/data-hub-card-save="0"/);assert.match(sec,/data-hub-card-reset="0"/);
  assert.equal(t.state.settings.length,0,'열기만 해서는 DB 안 바뀜');
  // 카드 추가 → 제목·링크를 적지 않으면 저장 거절(DB 안 부름)
  setCard(t,0,0,DEF_CARD);
  await t.click('[hub-card-add]=0');
  sec=t.section.innerHTML;
  assert.match(sec,/id="hubCrd_0_1_title"/,'새 카드 칸');assert.match(sec,/\(2장\)/);
  setCard(t,0,0,DEF_CARD);setCard(t,0,1,{icon:'📄',category:'',title:'',description:'',url:'',depts:'',manual:false});
  await t.click('[hub-card-save]=0');
  assert.match(t.el('#hubCrdMsg_0').textContent,/제목이 빈 카드/);
  assert.equal(t.state.settings.length,0);
  // 위험한 링크 거절
  setCard(t,0,1,{icon:'📘',category:'안내',title:'위험',description:'',url:'javascript:alert(1)',depts:'',manual:false});
  await t.click('[hub-card-save]=0');
  assert.match(t.el('#hubCrdMsg_0').textContent,/저장하지 못했어요 — .*http/);
  assert.equal(t.state.settings.length,0,'틀린 링크는 DB를 안 건드림');
  // 올바른 값 저장 + 순서 바꾸기(위로)
  setCard(t,0,1,{icon:'📘',category:'안내',title:'새 자료',description:'설명',url:'https://a.com/new',depts:'',manual:false});
  await t.click('[hub-card-up]=0:1');
  sec=t.section.innerHTML;
  assert.match(sec,/id="hubCrd_0_0_title"[^>]*value="새 자료"/,'위로 올림');assert.match(sec,/id="hubCrd_0_1_title"[^>]*value="진료 매뉴얼"/);
  setCard(t,0,0,{icon:'📘',category:'안내',title:'새 자료',description:'설명',url:'https://a.com/new',depts:'',manual:false});setCard(t,0,1,DEF_CARD);
  await t.click('[hub-card-save]=0');
  assert.equal(t.el('#hubCrdMsg_0').textContent,'저장했어요.');
  const saved=JSON.parse(t.state.settings.find(x=>x.key==='cards.work_materials').value);
  assert.deepEqual(saved.map(c=>c.title),['새 자료','진료 매뉴얼']);
  assert.deepEqual(saved[1],{icon:'🩺',category:'진료 매뉴얼',title:'진료 매뉴얼',description:'진료실·상담 직무에 필요한 업무 안내를 확인합니다.',depts:['진료실','상담'],manual:true,url:'https://app.notion.com/p/1f7ba489f082806e9761e748524994bc?source=copy_link'});
  assert.match(t.section.innerHTML,/<span class="b ok">고침<\/span>/,'고친 표시');
  // 아래로 · 빼기 · 저장 → 한 장
  setCard(t,0,0,{icon:'📘',category:'안내',title:'새 자료',description:'설명',url:'https://a.com/new',depts:'',manual:false});setCard(t,0,1,DEF_CARD);
  await t.click('[hub-card-down]=0:0');
  assert.match(t.section.innerHTML,/id="hubCrd_0_1_title"[^>]*value="새 자료"/);
  setCard(t,0,0,DEF_CARD);setCard(t,0,1,{icon:'📘',category:'안내',title:'새 자료',description:'설명',url:'https://a.com/new',depts:'',manual:false});
  await t.click('[hub-card-del]=0:1');
  assert.match(t.section.innerHTML,/\(1장\)/);
  setCard(t,0,0,DEF_CARD);
  await t.click('[hub-card-save]=0');
  assert.equal(JSON.parse(t.state.settings.find(x=>x.key==='cards.work_materials').value).length,1);
  // 모두 빼기 → 빈 목록 저장 가능
  await t.click('[hub-card-del]=0:0');
  await t.click('[hub-card-save]=0');
  assert.equal(t.state.settings.find(x=>x.key==='cards.work_materials').value,'[]');
  // 되돌리기
  await t.click('[hub-card-reset]=0');
  assert.deepEqual(JSON.parse(t.state.settings.find(x=>x.key==='cards.work_materials').value),[{icon:'🩺',category:'진료 매뉴얼',title:'진료 매뉴얼',description:'진료실·상담 직무에 필요한 업무 안내를 확인합니다.',depts:['진료실','상담'],manual:true,url:'https://app.notion.com/p/1f7ba489f082806e9761e748524994bc?source=copy_link'}]);
  assert.equal(t.el('#hubCrdMsg_0').textContent,'처음 카드로 돌렸어요.');
  // 쓰기 실패(직원 계정 등)
  const f=ui({failWrite:true});await f.render(OWNER);await f.click('[hub-subtab]=lists');setCard(f,0,0,DEF_CARD);
  await f.click('[hub-card-save]=0');
  assert.match(f.el('#hubCrdMsg_0').textContent,/원장 계정으로 로그인/);
});

test('화면: 서류 종류 목록 — 이름 고침 + 새 종류 추가·저장, 상태 이름 목록은 새 항목 추가 단추 없음',async()=>{
  const t=ui({});
  await t.render(OWNER);await t.click('[hub-subtab]=lists');
  ['잠복결핵 검사서','자격증','보안서약서','면허증','신분증 사본','기타'].forEach((v,i)=>{t.el('#hubLstLbl_1_'+i).value=v;});
  t.el('#hubLstLbl_1_1').value='자격 증명서';
  ['진료실','데스크','기공팀','기타'].forEach((v,i)=>{t.el('#hubLstLbl_0_'+i).value=v;});
  t.el('#hubLstNew_1').value='치위생 보수교육';
  await t.click('[hub-list-add]=1');
  t.el('#hubLstLbl_1_1').value='자격 증명서';t.el('#hubLstLbl_1_6').value='치위생 보수교육'; // 가짜 화면은 입력칸 값을 HTML에서 읽지 않으므로 지금 이름을 넣어 줌
  await t.click('[hub-list-save]=1');
  assert.equal(t.el('#hubLstMsg_1').textContent,'저장했어요.');
  const saved=JSON.parse(t.state.settings.find(x=>x.key==='list.doc_kinds').value);
  assert.deepEqual(saved.map(i=>i.code),['잠복결핵 검사서','자격증','보안서약서','면허증','신분증 사본','기타','치위생 보수교육']);
  assert.equal(saved[1].label,'자격 증명서');assert.equal(saved[1].code,'자격증','코드는 그대로');
  assert.equal(t.state.settings.some(x=>x.key==='list.onbo_status'),false);
});

test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장)',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_2.sql')),false);
  assert.ok(!js.includes('§')&&!hr.includes('§')&&!fs.readFileSync(path.join(root,'tests/fixtures/hub2-harness.cjs'),'utf8').includes('§'));
});
