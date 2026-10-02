// 직원허브 「⚙️ 허브 설정」 차례 4 시험 — 결재함 · 공지 · 캘린더 · 건의함 글·목록·숫자를 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 네 화면이 옛 화면(3d4b91e)과 글자 하나까지 같음 ②표에 값이 있으면 그 글 ③표 읽기 실패·잘못된 값이면 기본값
//       ④결재 종류·일정 종류는 코드 고정(이름만 고침 · 선택칸 option 값은 코드) ⑤결재 목록 건수는 범위 검사 + 잘못되면 기본값
//       ⑥DB·Storage에도 같은 값이 있는 것(첨부 10MB·허용 형식·건의 점수 1~5·순위 1~3)은 안 옮김.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll,tablesFor}=require('./fixtures/hub4-harness.cjs');
const golden=JSON.parse(read('tests/fixtures/hub4-golden-3d4b91e.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const CH4=/^(appr|notice|cal|lvs|sug)\./;
const STATIC_PART=hr.slice(0,hr.indexOf('<script src="hub-texts.js')); // 고정 HTML(모달)은 이 앞쪽에 있음

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
// 고정 HTML(모달)에 있는 글의 키 — 이 키들은 화면을 다시 그릴 때 hubStaticFill이 바꿔 넣음
const staticKeys=()=>new Set([...STATIC_PART.matchAll(/\bdata-hubk="([a-z0-9_.]+)"/g)].map(m=>m[1]));

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 4 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 12개(결재함 4 · 공지 3 · 캘린더 3 · 건의함 2)',()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH4.test(d.key));
  assert.equal(defs.length,145,'차례 4 글 키 수');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.equal(screens.length,12);
  assert.equal(screens.filter(s=>s.startsWith('🖊 결재함')).length,4);
  assert.equal(screens.filter(s=>s.startsWith('📢 공지')).length,3);
  assert.equal(screens.filter(s=>s.startsWith('📅 캘린더')).length,3);
  assert.equal(screens.filter(s=>s.startsWith('💡 건의함')).length,2);
});

test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:hubT|hubText|hubTextHtml|T)\(\s*'([a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(hr))){
    const key=m[1];if(!CH4.test(key))continue;
    const v=vm.runInNewContext(m[2]);
    if(found.has(key))assert.equal(found.get(key),v,key+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(key,v);
  }
  // 요소에 data-hubk="키"를 달아 둔 글(모달 속 고정 글 · 캘린더 단추): 요소 안의 글이 기본 글
  const marks=new Map();
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="([a-z0-9_.]+)"[^>]*>([^<]*)</g)){if(!CH4.test(sm[1]))continue;if(marks.has(sm[1]))assert.equal(marks.get(sm[1]),sm[2],sm[1]);marks.set(sm[1],sm[2]);}
  const defs=h.hubTextDefs().filter(d=>CH4.test(d.key));
  for(const d of defs){
    if(marks.has(d.key)){assert.equal(marks.get(d.key),d.def,d.key+' 표지 글이 기본값과 다름');assert.ok(!found.has(d.key)||found.get(d.key)===d.def);continue;}
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of [...found.keys(),...marks.keys()])assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  const st=[...marks.keys()].filter(k=>staticKeys().has(k));
  assert.equal(st.length,19,'고정 모달 글: 결재 올리기 6 + 공지 작성 9 + 재직증명서 3 + 첨부 미리보기 1');
  assert.equal([...marks.keys()].filter(k=>!staticKeys().has(k)).length,6,'캘린더의 표지 글 6개(제목·전체·근무·연차·주간·월간)');
});

test('숫자·목록 기본값: 결재 건수 2개와 결재 종류·일정 종류 목록이 hr.html·DB와 같다 · 캐시 번호',()=>{
  const h=helpers(),S=k=>h.HUB_SETTING_DEFS.find(d=>d.key===k),L=k=>h.HUB_LIST_DEFS.find(d=>d.key===k);
  assert.deepEqual(clone(h.HUB_SETTING_DEFS.slice(12,14).map(d=>[d.key,d.def,d.kind,d.min,d.max])),[['appr.my_list_limit','20','int',5,100],['appr.done_list_limit','50','int',10,200]]);
  assert.match(hr,/limit\(hubN\('appr\.my_list_limit',20\)\)/);assert.match(hr,/limit\(hubN\('appr\.done_list_limit',50\)\)/);
  // 결재 종류: 코드는 화면이 지금 쓰는 이름 그대로(저장 값 규칙·재직증명서 발급 흐름이 이 코드로 움직임)
  const kinds=clone(L('list.approval_kinds').def);
  assert.deepEqual(kinds.map(k=>k.code),['연차 신청','사직서','재직증명서 발급','보고','소명','기타']);
  assert.ok(kinds.every(k=>k.code===k.label));
  assert.match(hr,/<select id="apKind"><option>연차 신청<\/option><option>사직서<\/option><option>재직증명서 발급<\/option><option>보고<\/option><option>소명<\/option><option>기타<\/option><\/select>/,'결재 올리기 창 기본 선택칸(기존 시험이 이 줄을 찾음)');
  const vals=vm.runInNewContext('('+hr.match(/const APPROVAL_KIND_VALUES=(\{[^\n]*?\});/)[1]+')');
  assert.deepEqual(kinds.map(k=>k.code),Object.keys(vals));
  // 일정 종류: DB가 허락하는 3가지와 같음
  const cal=clone(L('list.calendar_kinds').def);
  assert.deepEqual(cal.map(k=>k.code),['이벤트','단축근무','면접']);
  assert.match(read('db/hr_schema.sql'),/kind text default '이벤트'\s*check \(kind in \('이벤트', '단축근무', '면접'\)\)/);
  assert.match(read('db/hr_schema.sql'),/check \(kind in \('연차', '소명', '사직서', '보고', '기타'\)\)/);
  assert.equal(L('list.approval_kinds').addable,false);assert.equal(L('list.calendar_kinds').addable,false);
  assert.match(hr,/hub-texts\.js\?v=2026100301/,'캐시 번호를 새 값으로 올림(차례 5에서 2026100110 → 2026100111, 차례 6에서 → 2026100112, 차례 7에서 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-02 인박스 판에서 → 2026100223)');
  // 이전 차례들이 쓰는 캐시 기대값이 남지 않음
  assert.ok(!/hub-texts\.js\?v=2026100109/.test(hr));
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 네 화면이 옛 화면(3d4b91e)과 글자 하나까지 같다',async()=>{
  const out=await renderAll(hr,{engine:false});
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
  assert.ok(Object.keys(golden).length>=100,'대조 항목 수');
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
test('숫자·목록 값이 모양이 틀려도(깨진 JSON·범위 밖·글자·낯선 코드) 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.approval_kinds':'not json','list.calendar_kinds':'[{"code":"x"}]','appr.my_list_limit':'abc','appr.done_list_limit':'9999'}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
  const out2=await renderAll(hr,{engine:true,textRows:[],settings:{'list.approval_kinds':JSON.stringify([{code:'보고',label:'보고'},{code:'낯선',label:'낯선'}]),'list.calendar_kinds':JSON.stringify([{code:'이벤트',label:'이벤트'},{code:'휴가',label:'휴가'}])}});
  for(const k of Object.keys(golden))assert.equal(out2[k],golden[k],k+' 이름이 같거나 낯선 코드만 있으면 옛 화면과 같음');
});
test('표에 글이 비어 있거나 공백뿐이면 무시하고 기본 글',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[{key:'appr.title',value:'   '},{key:'cal.title',value:''},{key:'sug.title',value:'\n'}],settings:{}});
  for(const k of Object.keys(golden))assert.equal(out[k],golden[k],k);
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다(결재·공지·캘린더·건의 각각)',async()=>{
  const c1=hr.replace("hubT('appr.title','🖊 결재')","hubT('appr.title','🖊 결재!')");
  assert.notEqual(c1,hr);assert.notEqual((await renderAll(c1,{engine:false}))['appr.render.staff'],golden['appr.render.staff']);
  const c2=hr.replace("hubT('notice.empty','공지 없음')","hubT('notice.empty','공지 없음 ')");
  assert.notEqual(c2,hr);assert.notEqual((await renderAll(c2,{engine:false}))['notice.render.empty'],golden['notice.render.empty']);
  const c3=hr.replace("hubT('cal.btn_png','PNG로 저장')","hubT('cal.btn_png','PNG 로 저장')");
  assert.notEqual(c3,hr);assert.notEqual((await renderAll(c3,{engine:false}))['cal.week.all.staff'],golden['cal.week.all.staff']);
  const c4=hr.replace('data-hubk="cal.view_all" onclick="setCalendarView(\'all\')">전체<','data-hubk="cal.view_all" onclick="setCalendarView(\'all\')">전체 <');
  assert.notEqual(c4,hr);assert.notEqual((await renderAll(c4,{engine:false}))['cal.week.all.staff'],golden['cal.week.all.staff']);
  const c5=hr.replace("hubT('sug.m_like_fail','좋아요를 변경하지 못했습니다: {msg}'","hubT('sug.m_like_fail','좋아요를 바꾸지 못했습니다: {msg}'");
  assert.notEqual(c5,hr);assert.notEqual((await renderAll(c5,{engine:false}))['sug.like.fail_insert'],golden['sug.like.fail_insert']);
  const c6=hr.replace("hubT('appr.m_title_required','제목을 입력하세요.')","hubT('appr.m_title_required','제목을 입력하세요')");
  assert.notEqual(c6,hr);assert.notEqual((await renderAll(c6,{engine:false}))['appr.submit.no_title'],golden['appr.submit.no_title']);
  // 고정 모달 글의 기본 글을 바꿔도 시험이 잡음(정답 파일의 모달 글과 대조)
  const c7=hr.replace('<span data-hubk="notice.modal.title">📢 공지 작성</span>','<span data-hubk="notice.modal.title">📢 공지 쓰기</span>');
  assert.notEqual(c7,hr);assert.notEqual((await renderAll(c7,{engine:false}))['static.modal.ntMask'],golden['static.modal.ntMask']);
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 고쳐 쓰는 글이 모두 화면(제목·단추·표 머리·알림창·확인창·메시지)에 나온다',async()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH4.test(d.key));
  const stat=staticKeys();
  const dyn=defs.filter(d=>!stat.has(d.key));
  assert.equal(dyn.length,145-19,'고정 모달 글 19개를 뺀 나머지');
  const out=await renderAll(hr,{engine:true,textRows:dynRows(dyn),settings:{}});
  const all=Object.values(out).join('\n');
  const missing=dyn.filter(d=>!all.includes('«'+d.key+'»')).map(d=>d.key);
  assert.equal(missing.length,0,'값을 넣었는데 화면에 안 나오는 키: '+missing.join(', '));
  assert.ok(!/«[a-z0-9_.]+»[^"\\]*\{[a-z_]+\}/.test(all.replace(/\\"/g,'"')),'{자리표시자}가 채워지지 않고 남음');
});
test('표에 값이 있으면 그 글: 구체적인 예(결재 제목·공지 단추·캘린더 단추·건의 알림창) + HTML은 이스케이프',async()=>{
  const rows=[{key:'appr.title',value:'🖊 우리 결재 <진짜>'},{key:'notice.btn_new',value:'공지 쓰기'},{key:'cal.view_all',value:'모두'},{key:'cal.period_week',value:'이번 주'},{key:'cal.btn_png',value:'그림 저장'},
    {key:'sug.m_like_fail',value:'{msg} 때문에 좋아요가 안 돼요'},{key:'cal.title',value:'<b>달력</b>'},{key:'cal.roster_count',value:'{label} 총 {n}'},{key:'lvs.empty',value:'승인 연차 없음'},{key:'appr.cancel.confirm',value:'{title}({kind}) 완결을 되돌릴까요?'}];
  const out=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.match(out['appr.render.staff'],/<h2>🖊 우리 결재 &lt;진짜&gt;<\/h2>/);
  assert.match(out['notice.render.staff'],/onclick="show\('ntMask'\)">공지 쓰기<\/button>/);
  assert.match(out['cal.week.all.staff'],/<h2>&lt;b&gt;달력&lt;\/b&gt;<\/h2>/);
  assert.ok(!out['cal.week.all.staff'].includes('data-hubk'),'표지는 화면에 남지 않음');
  assert.match(out['cal.week.all.staff'],/onclick="setCalendarView\('all'\)">모두<\/button>/);
  assert.match(out['cal.week.all.staff'],/onclick="setCalendarPeriod\('week'\)">이번 주<\/button>/);
  assert.match(out['cal.week.all.staff'],/onclick="saveCalendarPng\(\)">그림 저장<\/button>/);
  assert.match(out['cal.month.all.staff'],/class="cal-summary">[^<]*총 \d+<\/span>/);
  assert.match(out['sug.like.fail_insert'],/좋아요<실패> 때문에 좋아요가 안 돼요/);
  assert.match(out['lvs.empty.cal'],/승인 연차 없음/);
  assert.match(out['appr.cancel.declined'],/t<1>\(보고\) 완결을 되돌릴까요\?/);
  assert.ok(!out['appr.render.staff'].includes('<b>진짜</b>'));
  // 바꾸지 않은 칸은 그대로
  assert.match(out['cal.week.all.staff'],/onclick="setCalendarView\('work'\)">근무<\/button>/);
});

/* ───────────── 4. 고정 HTML(모달) 속 글 ───────────── */
test('모달 속 고정 글 19개: 기본값 그대로·표에 값이 있으면 바뀌고·되돌리면 다시 기본값(결재 올리기 창·공지 작성 창·재직증명서 창·첨부 미리보기 창)',async()=>{
  const items=[];
  for(const sm of STATIC_PART.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="([a-z0-9_.]+)"[^>]*>([^<]*)</g))if(CH4.test(sm[1]))items.push({key:sm[1],text:sm[2]});
  assert.equal(items.length,19);
  const els=items.map(it=>({dataset:{},textContent:it.text,getAttribute(){return it.key;},it}));
  const doc={querySelectorAll(sel){return sel==='[data-hubk]'?els:[];}};
  const run=async(rows)=>{
    const P=await renderAll(hr,{engine:true,textRows:rows,settings:{},probe:true});
    const r=await P.asRole('staff',{document:doc});
    r.api2.hubStaticFill();
  };
  await run([]);
  for(const e of els)assert.equal(e.textContent,e.it.text,e.it.key+' 기본값이면 그대로');
  await run(items.map(it=>({key:it.key,value:'바꾼 '+it.key})));
  for(const e of els)assert.equal(e.textContent,'바꾼 '+e.it.key,e.it.key+' 표에 값');
  await run([]);
  for(const e of els)assert.equal(e.textContent,e.it.text,e.it.key+' 되돌리기');
  const Pn=await renderAll(hr,{engine:false,probe:true});
  const rn=await Pn.asRole('staff',{document:doc});rn.api2.hubStaticFill();
  for(const e of els)assert.equal(e.textContent,e.it.text);
  // 결재 올리기 창의 안내(재직증명서 안내 줄)는 기존 시험이 찾는 글 그대로 남아 있음
  assert.match(hr,/재직증명서는 최종 승인 시 재직 정보를 확인해 발급되며/);
});
test('hubFillHtml: 표지가 있는 요소만 바꾸고, 값이 없으면 표지만 지워 옛 HTML과 같게 하며, 값은 이스케이프한다',async()=>{
  const P=await renderAll(hr,{engine:true,textRows:[{key:'cal.view_all',value:'<모두>'},{key:'x.same',value:'같음'}],settings:{},probe:true});
  const r=await P.asRole('staff');
  const f=r.api2.hubFillHtml;
  assert.equal(f('<button class="a" data-hubk="cal.view_all" onclick="x(\'a\')">전체</button>'),'<button class="a" onclick="x(\'a\')">&lt;모두&gt;</button>');
  assert.equal(f('<b data-hubk="cal.view_work">근무</b> <i>그대로</i>'),'<b>근무</b> <i>그대로</i>','값 없는 키는 표지만 지움');
  assert.equal(f('<p>표지 없음</p>'),'<p>표지 없음</p>');
  assert.equal(f('<span data-hubk="cal.view_all">A</span><span data-hubk="cal.view_all">B</span>'),'<span>&lt;모두&gt;</span><span>&lt;모두&gt;</span>');
  // 사용자가 쓴 글에 표지처럼 보이는 글이 있어도(이미 이스케이프돼 있음) 바뀌지 않음
  assert.equal(f('<td>&lt;b data-hubk=&quot;cal.view_all&quot;&gt;전체&lt;/b&gt;</td>'),'<td>&lt;b data-hubk=&quot;cal.view_all&quot;&gt;전체&lt;/b&gt;</td>');
  // 엔진이 없을 때(대비책): 표지만 지움
  const Pn=await renderAll(hr,{engine:false,probe:true});
  const rn=await Pn.asRole('staff');
  assert.equal(vm.runInContext('typeof hubText',rn.ctx),'undefined');
  assert.equal(rn.api2.hubFillHtml('<b class="x" data-hubk="cal.view_work">근무</b>'),'<b class="x">근무</b>');
});

/* ───────────── 5. 결재 목록 건수 ───────────── */
test('숫자 읽기(hubSettingChecked): 결재 건수 기본값 · 표 값 · 범위 밖·글자·빈 값이면 기본값',()=>{
  const h=helpers();
  const t=(k,v,def)=>{h.hubSettingSetValues(v===undefined?{}:{[k]:v});return h.hubSettingChecked(k,def);};
  assert.equal(t('appr.my_list_limit',undefined,20),20);assert.equal(t('appr.my_list_limit','50',20),50);assert.equal(t('appr.my_list_limit','5',20),5);assert.equal(t('appr.my_list_limit','100',20),100);
  for(const bad of ['4','101','abc','','  ','1.5','-1','２'])assert.equal(t('appr.my_list_limit',bad,20),20,'잘못된 값 → 기본값: '+JSON.stringify(bad));
  assert.equal(t('appr.done_list_limit','200',50),200);assert.equal(t('appr.done_list_limit','10',50),10);
  for(const bad of ['9','201','abc',''])assert.equal(t('appr.done_list_limit',bad,50),50,'잘못된 값 → 기본값: '+JSON.stringify(bad));
});
test('목록 건수: 「내가 올린 문서」·「완결된 결재 문서」 건수가 설정을 따르고 잘못된 값이면 기본(20·50)',async()=>{
  const lims=async(settings,role)=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});
    const rec=[];
    const mkRec=(spec,t)=>{const c=P.chain(spec);const w=new Proxy(c,{get(tg,k){if(k==='limit')return n=>{rec.push([t,n]);return w;};const v=tg[k];if(k==='then')return v;return (...a)=>{const r=v(...a);return r===c?w:r;};}});return w;};
    const sb={from:t=>mkRec(tablesFor(t)||{list:[],single:null},t)};
    const r=await P.asRole(role,{sb});
    await r.api.renderAppr({innerHTML:''});
    return rec.filter(x=>x[0]==='approval_docs').map(x=>x[1]);
  };
  assert.deepEqual(await lims({},'chief'),[20,50]);
  assert.deepEqual(await lims({'appr.my_list_limit':'7','appr.done_list_limit':'120'},'chief'),[7,120]);
  assert.deepEqual(await lims({'appr.my_list_limit':'1000','appr.done_list_limit':'abc'},'chief'),[20,50]);
  assert.deepEqual(await lims({'appr.my_list_limit':'30'},'staff'),[30],'직원 화면은 내가 올린 문서만');
});

/* ───────────── 6. 결재 종류 · 일정 종류 목록 ───────────── */
const RENAMED_KINDS=[{code:'연차 신청',label:'휴가 신청'},{code:'사직서',label:'퇴직원'},{code:'재직증명서 발급',label:'재직증명서 신청'},{code:'보고',label:'업무 보고'},{code:'소명',label:'소명'},{code:'기타',label:'그 밖'}];
test('결재 종류 이름: 보이는 이름만 바뀌고 저장되는 값(코드)은 그대로 — 선택칸 option 값은 코드, 올리기는 코드로 처리, 문서 카드는 이름을 고친 종류만 새 이름',async()=>{
  const settings={'list.approval_kinds':JSON.stringify(RENAMED_KINDS)};
  const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});
  // (1) 선택칸 채우기: 값은 코드, 글은 새 이름(이름을 안 고친 항목은 옛 HTML 그대로)
  const sel={value:'보고',options:[],innerHTML:''};
  const base=P.makeDom().$;
  const r=await P.asRole('staff',{$:id=>id==='#apKind'?sel:base(id)});
  r.api2.apprKindSelectFill();
  assert.equal(sel.innerHTML,'<option value="연차 신청">휴가 신청</option><option value="사직서">퇴직원</option><option value="재직증명서 발급">재직증명서 신청</option><option value="보고">업무 보고</option><option>소명</option><option value="기타">그 밖</option>');
  assert.equal(sel.value,'보고','고른 값은 그대로 유지');
  // (2) 같은 목록이 이미 들어 있으면 다시 안 채움(고른 값을 안 건드림)
  const sel2={value:'소명',options:[{value:'연차 신청',textContent:'휴가 신청'},{value:'사직서',textContent:'퇴직원'},{value:'재직증명서 발급',textContent:'재직증명서 신청'},{value:'보고',textContent:'업무 보고'},{value:'소명',textContent:'소명'},{value:'기타',textContent:'그 밖'}],innerHTML:'원래'};
  const r2=await P.asRole('staff',{$:id=>id==='#apKind'?sel2:base(id)});r2.api2.apprKindSelectFill();
  assert.equal(sel2.innerHTML,'원래');
  // (3) 기본 이름이면 옛 선택칸(값=글)과 같아 다시 안 채움
  const P0=await renderAll(hr,{engine:true,textRows:[],settings:{},probe:true});
  const sel0={value:'보고',options:['연차 신청','사직서','재직증명서 발급','보고','소명','기타'].map(t=>({value:t,textContent:t})),innerHTML:'원래'};
  const r0=await P0.asRole('staff',{$:id=>id==='#apKind'?sel0:base(id)});r0.api2.apprKindSelectFill();
  assert.equal(sel0.innerHTML,'원래');
  // (4) 새 이름으로 올려도 서버에 저장되는 값(코드)은 그대로
  const run=async(value,title)=>{const d=P.makeDom();d.$('#apKind').value=value;d.$('#apTitle').value=title;d.$('#apBody').value='내용';const ins=[];
    const sb={from:t=>{if(t==='approval_docs')return {insert:pl=>{ins.push(pl);return {select:()=>({single:async()=>({data:{id:7},error:null})})};}};return {insert:async()=>({error:null})};}};
    const q=await P.asRole('staff',{$:d.$,sb});await q.api.submitApproval();return {ins,log:q.log};};
  let x=await run('보고','월간');assert.equal(x.ins[0].kind,'보고');
  x=await run('재직증명서 발급','발급 요청');assert.equal(x.ins[0].kind,'기타');assert.equal(x.ins[0].title,'[재직증명서 발급] 발급 요청');assert.match(x.ins[0].body,/^\[재직증명서 발급 요청\]/);
  x=await run('연차 신청','휴가');assert.equal(x.ins.length,0);assert.deepEqual(x.log,['hide:apMask','openLeave'],'연차 신청 코드는 이름을 바꿔도 연차 신청 창으로 감');
  // (5) 문서 카드의 [종류]: 이름을 고친 종류만 새 이름. 재직증명서 요청 문서는 그 종류의 새 이름
  const q=await P.asRole('chief');
  const disp=d=>q.api2.approvalKindDisplay(d);
  assert.equal(disp({kind:'보고',title:'t',body:''}),'업무 보고');
  assert.equal(disp({kind:'사직서'}),'퇴직원');
  assert.equal(disp({kind:'연차'}),'휴가 신청');
  assert.equal(disp({kind:'소명'}),'소명','이름을 안 고친 종류는 저장된 값 그대로');
  assert.equal(disp({kind:'기타',title:'[재직증명서 발급] 요청',body:'[재직증명서 발급 요청]\nx'}),'재직증명서 신청');
  assert.equal(disp({kind:'기타',title:'그냥',body:''}),'그 밖');
  assert.equal(disp({kind:'알수없음'}),'알수없음');assert.equal(disp(null),'');
  const out=await renderAll(hr,{engine:true,textRows:[],settings});
  assert.match(out['appr.render.chief'],/<b>\[업무 보고\] &lt;월간&gt; 보고<\/b>/);
  assert.match(out['appr.render.chief'],/<b>\[재직증명서 신청\] \[재직증명서 발급\] 발급 요청<\/b>/);
  assert.match(out['appr.cancel.declined'],/confirm:\[업무 보고\] t<1> 문서의 완결 처리를 취소합니다/);
  // (6) 코드는 서버가 허락한 6개뿐: 낯선 코드가 끼어도 선택칸에 안 나옴
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'list.approval_kinds':JSON.stringify([{code:'연차 신청',label:'연차 신청'},{code:'해고',label:'해고'}])},probe:true});
  const re=await evil.asRole('staff');
  assert.deepEqual(clone(re.api2.approvalKindItems().map(i=>i.code)),['연차 신청','사직서','재직증명서 발급','보고','소명','기타']);
});
test('일정 종류 이름: 보이는 이름만 바뀌고 저장되는 값(코드)은 그대로 — 일정 추가 칸 option 값은 코드, 일정 위 글은 새 이름',async()=>{
  const settings={'list.calendar_kinds':JSON.stringify([{code:'이벤트',label:'행사'},{code:'단축근무',label:'일찍 퇴근'},{code:'면접',label:'면접'}])};
  const out=await renderAll(hr,{engine:true,textRows:[],settings});
  assert.match(out['cal.week.all.chief'],/<select class="mini" id="calKind"><option value="이벤트">행사<\/option><option value="단축근무">일찍 퇴근<\/option><option>면접<\/option><\/select>/);
  assert.match(out['cal.month.all.chief'],/title="행사 &lt;행사&gt;"/);
  assert.match(out['cal.month.all.chief'],/title="일찍 퇴근 일찍 퇴근"/);
  assert.match(out['cal.month.all.chief'],/title="면접 면접"/);
  // 기본 이름이면 옛 HTML 그대로
  const def=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  assert.match(def['cal.week.all.chief'],/<select class="mini" id="calKind"><option>이벤트<\/option><option>단축근무<\/option><option>면접<\/option><\/select>/);
  // 직원 화면에는 일정 추가 줄이 없음
  assert.ok(!def['cal.week.all.staff'].includes('id="calKind"'));
  // 추가는 고른 칸의 값(코드) 그대로 DB로 간다
  const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});
  const d=P.makeDom();d.$('#calDate').value='2026-10-02';d.$('#calTitle').value='면접 일정';d.$('#calKind').value='단축근무';
  const ins=[];const sb={from:()=>({insert:async pl=>{ins.push(pl);return {error:null};}})};
  const r=await P.asRole('chief',{$:d.$,sb});await r.api.addCalendarEvent();
  assert.deepEqual(clone(ins),[{date:'2026-10-02',title:'면접 일정',kind:'단축근무',created_by:'김직원'}]);
  // 낯선 코드는 선택칸에 안 나옴
  const evil=await renderAll(hr,{engine:true,textRows:[],settings:{'list.calendar_kinds':JSON.stringify([{code:'이벤트',label:'이벤트'},{code:'휴가',label:'휴가'}])},probe:true});
  const re=await evil.asRole('staff');
  assert.deepEqual(clone(re.api2.calendarKindItems().map(i=>i.code)),['이벤트','단축근무','면접']);
  assert.equal(re.api2.calendarKindLabel('낯선'),'낯선','모르는 코드는 그대로');
});
test('목록 저장 검사: 결재 종류·일정 종류는 새 항목을 못 늘리고 기본 코드는 못 지우며 이름만 고침',()=>{
  const h=helpers();
  for(const key of ['list.approval_kinds','list.calendar_kinds']){
    const def=h.HUB_LIST_DEFS.find(d=>d.key===key);
    const renamed=clone(def.def).map((i,n)=>({code:i.code,label:'이름'+n}));
    assert.equal(h.hubListValidate(def,renamed).ok,true,key+' 이름만 바꾸기 OK');
    assert.equal(h.hubListValidate(def,renamed.concat([{code:'새코드',label:'새이름'}])).ok,false,key+' 새 항목 거절');
    assert.equal(h.hubListValidate(def,renamed.slice(1)).ok,false,key+' 기본 코드 지우기 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:'바뀐코드',label:i.label}:i)).ok,false,key+' 코드 바꾸기(=지우고 새로 넣기) 거절');
    assert.equal(h.hubListValidate(def,renamed.map(i=>({code:i.code,label:'같은'}))).ok,false,key+' 이름 중복 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:i.code,label:'a'.repeat(21)}:i)).ok,false,key+' 21자 이름 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:i.code,label:'<b>'}:i)).ok,false,key+' 꺾쇠 거절');
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
test('화면: 글 고치기에 결재함 4 · 공지 3 · 캘린더 3 · 건의함 2 묶음이 접혀 나오고 검색으로 찾을 수 있으며, 저장하면 hub_ui_texts에 upsert',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  for(const name of ['🖊 결재함 › 결재함 화면','🖊 결재함 › 문서 카드·결재 처리','🖊 결재함 › 결재 올리기 창','🖊 결재함 › 재직증명서 창','📢 공지 › 공지 화면','📢 공지 › 공지 작성 창','📢 공지 › 첨부 미리보기','📅 캘린더 › 월·주간 화면','📅 캘린더 › 날짜 상세·일정 추가','📅 캘린더 › 연차 캘린더 보기','💡 건의함 › 건의함 화면','💡 건의함 › 평가·수상·알림창'])
    assert.ok(sec.includes('data-hub-group="'+name+'"'),name);
  assert.match(sec,/이름표: appr\.title/);assert.match(sec,/이름표: sug\.m_campaign_fail/);
  const idx=Number(sec.match(/data-hub-text-row="(\d+)">(?:(?!data-hub-text-row)[^])*?이름표: notice\.btn_new/)[1]);
  t.el('#hubTxtIn_'+idx).value='공지 쓰기';
  await t.click('[hub-text-save]='+idx);
  const up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.equal(up.length,1);assert.deepEqual(clone(up[0].payload),{key:'notice.btn_new',value:'공지 쓰기'});
  assert.equal(t.el('#hubTxtMsg_'+idx).textContent,'저장했어요.');
  await t.click('[hub-text-reset]='+idx);
  assert.equal(t.state.texts.length,0);
  const h=helpers(),hits=q=>h.hubTextDefs().filter(d=>h.hubTextMatches(d,q,null)).map(d=>d.key);
  assert.ok(hits('완결 처리').includes('appr.cancel.confirm'));
  assert.ok(hits('상단 고정').includes('notice.modal.f_pin'));
  assert.ok(hits('PNG').includes('cal.btn_png')&&hits('PNG').includes('cal.m_png_fail'));
  assert.ok(hits('수상').includes('sug.win.title'));
});
test('화면: 🔢 숫자·기준 — 결재 건수 2개가 더 있고 잘못된 값은 DB 호출 없이 거절, 저장·되돌리기',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,14+4+1+8,'차례 5의 문의함·상담일지 숫자 4개가 더 있음');
  assert.ok(sec.includes('🖊 결재 기준'));
  assert.match(sec,/id="hubSetIn_12" type="number" inputmode="numeric" min="5" max="100" value="20"/);
  assert.match(sec,/id="hubSetIn_13" type="number" inputmode="numeric" min="10" max="200" value="50"/);
  const before=t.state.calls.length;
  for(const [i,bad] of [[12,'4'],[12,'101'],[12,'abc'],[12,''],[13,'9'],[13,'201'],[13,'1.5']]){
    t.el('#hubSetIn_'+i).value=bad;await t.click('[hub-set-save]='+i);
    assert.match(t.el('#hubSetMsg_'+i).textContent,/저장하지 못했어요/,i+' '+bad);
  }
  assert.equal(t.state.calls.length,before,'잘못된 값은 DB를 부르지 않음');
  t.el('#hubSetIn_12').value='30';await t.click('[hub-set-save]=12');
  t.el('#hubSetIn_13').value='100';await t.click('[hub-set-save]=13');
  const ups=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.deepEqual(clone(ups.map(u=>u.payload)),[{key:'appr.my_list_limit',value:'30'},{key:'appr.done_list_limit',value:'100'}]);
  await t.click('[hub-set-reset]=13');
  assert.equal(t.state.settings.find(r=>r.key==='appr.done_list_limit').value,'50','되돌리기는 기본값을 다시 적음(설정 표는 지울 수 없음)');
});
test('화면: 📋 목록에 결재 종류 이름·일정 종류 이름이 있고, 코드는 회색(못 고침)·새 항목 추가 단추는 없음',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=lists');
  const sec=t.section.innerHTML;
  assert.ok(sec.includes('결재 종류 이름')&&sec.includes('일정 종류 이름'));
  assert.equal((sec.match(/<span class="hub-code">/g)||[]).length,4+6+3+4+4+7+6+3+8+7+6+5+32);
  assert.equal((sec.match(/data-hub-list-add=/g)||[]).length,2,'새 항목을 늘릴 수 있는 목록은 직원 부서·서류 종류뿐');
  assert.match(sec,/<span class="hub-code">재직증명서 발급<\/span><input id="hubLstLbl_6_2" type="text" maxlength="20" value="재직증명서 발급"/);
  assert.match(sec,/<span class="hub-code">단축근무<\/span><input id="hubLstLbl_7_1" type="text" maxlength="20" value="단축근무"/);
  ['연차 신청','사직서','재직증명서 발급','업무 보고','소명','기타'].forEach((v,i)=>{t.el('#hubLstLbl_6_'+i).value=v;});
  await t.click('[hub-list-save]=6');
  const up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.equal(up.length,1);assert.equal(up[0].payload.key,'list.approval_kinds');
  assert.deepEqual(clone(JSON.parse(up[0].payload.value)),[{code:'연차 신청',label:'연차 신청'},{code:'사직서',label:'사직서'},{code:'재직증명서 발급',label:'재직증명서 발급'},{code:'보고',label:'업무 보고'},{code:'소명',label:'소명'},{code:'기타',label:'기타'}]);
});

/* ───────────── 8. DB에도 있어 안 옮긴 것 · 기존 시험이 찾는 줄 ───────────── */
test('DB·Storage에도 같은 값이 있는 것은 옮기지 않음: 첨부 10MB·허용 형식·건의 점수 1~5·순위 1~3',()=>{
  const h=helpers();
  assert.ok(!h.HUB_SETTING_DEFS.some(d=>/attach|notice\./.test(d.key)),'첨부 한도 키는 만들지 않음');
  assert.match(hr,/const NOTICE_ATTACHMENT_MAX_BYTES=10\*1024\*1024;/);
  assert.match(hr,/const NOTICE_ATTACHMENT_ALLOWED_TYPES=new Set\(\[/);assert.match(hr,/const NOTICE_BLOCKED_EXT=/);
  assert.match(read('db/notice_attachments_deposit_access_draft.sql'),/file_size_limit/);assert.match(read('db/notice_attachments_deposit_access_draft.sql'),/10485760/);
  assert.match(read('db/suggestion_board.sql'),/originality_score smallint check \(originality_score between 1 and 5\)/);
  assert.match(read('db/suggestion_board.sql'),/award_rank smallint check \(award_rank between 1 and 3\)/);
  assert.match(hr,/id="suggestionScore-\$\{row\.id\}" type="number" min="1" max="5"/);assert.match(hr,/id="suggestionRank-\$\{row\.id\}" type="number" min="1" max="3"/);
});
test('기존 시험이 줄 모양을 직접 찾는 글 3곳은 그대로 둠(공지 첨부·저장 실패 알림, 건의 게시글 수·좋아요 수)',()=>{
  assert.match(hr,/\$\('#ntMsg'\)\.textContent='첨부 실패: '\+error\.message/);
  assert.match(hr,/\$\('#ntMsg'\)\.textContent='공지 저장 실패: '\+error\.message/);
  assert.match(hr,/<span>게시글 \$\{summary\.totalPosts\}개<\/span><span>좋아요 \$\{summary\.totalLikes\}개<\/span>/);
});
test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장)',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_4.sql')),false);
  const SEC=String.fromCharCode(0xA7); // 섹션 기호는 어디에도 쓰지 않는 규칙(이 파일에도 글자 그대로는 안 씀)
  assert.ok(!js.includes(SEC)&&!hr.includes(SEC));
  for(const f of ['tests/fixtures/hub4-harness.cjs','tests/hub-ui-texts-4.test.js','tests/manual/make-hub4-golden.cjs','tests/sql/pglite-hub-ui-texts-4.mjs'])assert.ok(!read(f).includes(SEC),f);
});
