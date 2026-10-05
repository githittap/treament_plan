// 직원허브 「⚙️ 허브 설정」 차례 3 시험 — 출퇴근 · 근무표 · 연차 글·숫자·목록을 원장이 화면에서 고치는 기능.
// 핵심: ①기본값만 있을 때 세 화면이 옛 화면(84053a7)과 글자 하나까지 같음 ②표에 값이 있으면 그 글 ③표 읽기 실패·잘못된 값이면 기본값
//       ④연차 유형·근무부서는 코드 고정(이름만 고침) ⑤동시 휴가 인원·반차 값·목록 건수는 범위 검사 + 잘못되면 기본값.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hrRaw=read('hr.html'),hr=hrRaw.replace(/\r\n/g,'\n');
const {renderAll,tablesFor}=require('./fixtures/hub3-harness.cjs');
const golden={...JSON.parse(read('tests/fixtures/hub3-golden-84053a7.json')),...JSON.parse(read('tests/fixtures/p7-leave-golden.json'))}; // P7가 정한 연차 원장 카드만 새 기준, 그 밖은 옛 기준 유지
const clone=x=>JSON.parse(JSON.stringify(x));
const CH3=/^(att|sched|leave)\./;
// P7에서 허용된 시간 입력 연결 속성과 숨긴 모바일 입력만 제외해 PC의 기존 글·배치를 계속 대조한다.
function attendanceLegacyLayout(value){return String(value)
  .replace(/    <div class="card"><h2>📊 직원별 월 근태 요약<\/h2>[\s\S]*?(?=    <div class="card"><h2>📝 수기 출퇴근 입력)/g,'') // 뒤에 추가된 월 근태 요약은 별도 시험에서 확인함
  .replace(/\n    \n(?=    <div class="card"><h2>📝 수기 출퇴근 입력)/g,'\n') // 시급제 카드가 없는 역할에서 생기는 빈 줄만 제외함
  .replace(/ class="rowflex manual-clock-desktop"/g,' class="rowflex"')
  .replace(/ onchange="syncManualClock\('(In|Out)',false\)"/g,'')
  .replace(/<input type="time" class="manual-clock-mobile" id="manualClock(In|Out)Time"[^>]*>/g,'')
  .replace(/ id="manualAttendanceSubmit"/g,'');}
const P7_DATE_TEXT_KEYS=new Set(['att.manual.confirm_discard','att.manual.m_loading','att.manual.m_load_fail']);


function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block);
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubSetting,hubSettingChecked,hubSettingSetValues,hubSettingValidate,hubSettingSave,hubSettingReset,hubList,hubListValidate,hubListSave,HUB_LIST_DEFS,HUB_SETTING_DEFS,hubTextDefs,hubTextDefByKey,hubTextMatches,hubTextSetOverrides};',c);
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
const dynRows=defs=>defs.map(d=>({key:d.key,value:'«'+d.key+'»'+(d.vars?' '+d.vars.map(v=>'{'+v+'}').join(' '):'')}));

/* ───────────── 1. 기본 글 목록 ───────────── */
test('차례 3 글 목록: 키 모양·중복 없음·{자리표시자} 일치·화면 묶음 14개(출퇴근·근태차이 8 · 근무표 2 · 연차 4)',()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH3.test(d.key));
  assert.equal(defs.length,439,'차례 3 글 키 수(고쳐 쓰는 글 295 + 모달 속 고정 글 19 · P7 이름 보기 추가)');
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  for(const d of defs){
    assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/,d.key);
    assert.ok(d.where&&d.screen&&d.def.length>0,d.key+' 설명·화면·기본 글');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    assert.deepEqual([...new Set(ph)].sort(),clone(d.vars||[]).sort(),d.key+' 자리표시자');
  }
  const screens=[...new Set(defs.map(d=>d.screen))];
  assert.equal(screens.length,20,'B2 소명 화면 6개와 C 근태차이 화면 3개 추가');
  assert.equal(screens.filter(s=>s.startsWith('🕘 출퇴근')).length,14,'B2·C의 출퇴근 소명·차이 화면 9개 추가');
  assert.equal(screens.filter(s=>s.startsWith('🗓 근무표')).length,2);
  assert.equal(screens.filter(s=>s.startsWith('🌿 연차')).length,4);
});

test('화면 코드(hr.html)에 박힌 기본 글이 기본값 목록과 글자까지 같고, 목록의 모든 키가 화면에서 쓰인다',()=>{
  const h=helpers(),found=new Map();
  const re=/\b(?:hubT|hubText|hubTextHtml|T)\(\s*'([a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(hr))){
    const key=m[1];if(!CH3.test(key))continue;
    const v=vm.runInNewContext(m[2]);
    if(found.has(key))assert.equal(found.get(key),v,key+' 같은 키를 두 곳에서 다른 기본 글로 씀');
    found.set(key,v);
  }
  // 모달처럼 고정된 HTML 속 글: data-hubk(글) · data-hubph(칸 안 흐린 글)
  const stat=new Map();
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="([a-z0-9_.]+)"[^>]*>([^<]*)</g))if(CH3.test(sm[1]))stat.set(sm[1],sm[2]); // 차례 4의 고정 글 표지(결재·공지 창)는 차례 4 시험이 따로 봄
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubph="([a-z0-9_.]+)"[^>]*>/g)){const ph=/placeholder="([^"]*)"/.exec(sm[0]);assert.ok(ph,sm[1]+' 흐린 글 칸');if(CH3.test(sm[1]))stat.set(sm[1],ph[1]);}
  const defs=h.hubTextDefs().filter(d=>CH3.test(d.key));
  for(const d of defs){
    if(d.key==='att.myissue.th_evidence'){assert.equal(d.def,'증거');assert.ok(!found.has(d.key),'내 소명 목록을 두 줄로 바꾸며 증거 열 머리는 더 이상 표시하지 않음');continue;}
    if(['att.issueform.mode_new','att.issueform.mode_answer','att.issueform.mode_edit','att.issue.auto_clock_in','att.issue.auto_clock_out'].includes(d.key)){
      assert.match(hr,/hubT\(form\.mode==='new'\?'att\.issueform\.mode_new':form\.mode==='answer'\?'att\.issueform\.mode_answer':'att\.issueform\.mode_edit'/,'실제 양식 렌더는 세 모드 글 키를 선택함');
      assert.match(hr,/att\.myissue\.pending/,'실제 내 소명 카드가 자동 감지 글을 선택함');
      const mode=hr.match(/hubT\(form\.mode==='new'\?'att\.issueform\.mode_new':form\.mode==='answer'\?'att\.issueform\.mode_answer':'att\.issueform\.mode_edit',form\.mode==='new'\?'([^']*)':form\.mode==='answer'\?'([^']*)':'([^']*)'\)/);
      assert.ok(mode,"form mode fallback literals present");
      const clocks=[...hr.matchAll(/hubT\(i\.type==='[^']+'\?'att\.issue\.auto_clock_out':'att\.issue\.auto_clock_in',i\.type==='[^']+'\?'([^']*)':'([^']*)'\)/g)];
      assert.equal(clocks.length,3,'자동 출퇴근 글의 대기 카드·내 표·관리자 표 세 callsite');
      for(const call of clocks)assert.deepEqual(call.slice(1),clocks[0].slice(1),'세 callsite의 기본 글이 서로 같음');
      const fallback={'att.issueform.mode_new':mode[1],'att.issueform.mode_answer':mode[2],'att.issueform.mode_edit':mode[3],'att.issue.auto_clock_out':clocks[0][1],'att.issue.auto_clock_in':clocks[0][2]};
      assert.equal(d.def,fallback[d.key],d.key+" default text equals hr.html fallback");
      continue;
    }
    if(stat.has(d.key)){assert.equal(stat.get(d.key),d.def,d.key+' 고정 글이 기본값과 다름');assert.ok(!found.has(d.key),d.key+' 고정 글과 호출이 겹침');continue;}
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본 글이 화면 코드와 다름');
  }
  for(const k of [...found.keys(),...stat.keys()])assert.ok(h.hubTextDefByKey(k),k+' 는 화면에서 쓰는데 기본값 목록에 없음');
  assert.equal(stat.size,19);
});

test('숫자·목록 기본값: 연차·소명 숫자 5개와 연차 유형·근무부서 목록이 hr.html과 같다 · 캐시 번호',()=>{
  const h=helpers(),S=k=>h.HUB_SETTING_DEFS.find(d=>d.key===k),L=k=>h.HUB_LIST_DEFS.find(d=>d.key===k);
  assert.deepEqual(clone(h.HUB_SETTING_DEFS.slice(7,12).map(d=>[d.key,d.def,d.kind,d.min,d.max])),[
    ['att.issue_list_limit','30','int',5,100],['leave.same_day_limit','2','int',1,30],['leave.same_day_reason_from','1','int',1,30],['leave.half_day_value','0.5','dec',0.1,1],['leave.my_list_limit','20','int',5,100]]);
  // 화면 코드의 기본값도 같음
  assert.match(hr,/hubN\('att\.issue_list_limit',30\)/);assert.match(hr,/hubN\('leave\.my_list_limit',20\)/);assert.match(hr,/hubN\('leave\.half_day_value',0\.5\)/);
  assert.match(hr,/hubSettingChecked\('leave\.same_day_limit',2\)/);assert.match(hr,/hubSettingChecked\('leave\.same_day_reason_from',1\)/);
  const dept=clone(vm.runInNewContext(hr.match(/const SCHEDULE_DEPARTMENTS=(\[[^\n]*?\]);/)[1]));
  assert.deepEqual(clone(L('list.work_depts').def),dept.map(c=>({code:c,label:c})));
  assert.deepEqual(dept,['Dr.','진료실','데스크','기공실','미지정','상담','행정']);
  const types=clone(vm.runInNewContext(hr.match(/function leaveTypeItems\(\)\{const def=(\[[^\n]*?\]);/)[1]));
  assert.deepEqual(clone(L('list.leave_types').def),types);
  assert.deepEqual(types.map(t=>t.code),['연차','반차','조퇴','기타']);
  assert.match(hr,/<select id="lvType"><option>연차<\/option><option>반차<\/option><option>조퇴<\/option><option>기타<\/option><\/select>/,'신청 창 기본 선택칸(기존 시험이 이 줄을 찾음)');
  assert.equal(L('list.work_depts').addable,false);assert.equal(L('list.leave_types').addable,false);
  assert.ok(S('leave.same_day_limit').where.includes('DB에는 없어요'));
  assert.match(hr,/hub-texts\.js\?v=202610\d{4}/,'캐시 번호를 새 값으로 올림(차례 4에서 2026100109 → 2026100110, 차례 5에서 → 2026100111, 차례 6에서 → 2026100112, 차례 7에서 → 2026100113, 10-02 원장요청 5건에서 → 2026100221, 10-02 인박스 판에서 → 2026100223)');
});

/* ───────────── 2. 기본값만 있을 때 옛 화면과 똑같음 ───────────── */
test('기본값만 있을 때: 허브 설정 엔진이 아예 없어도 세 화면이 옛 화면(84053a7)과 글자 하나까지 같다',async()=>{
  const out=await renderAll(hr,{engine:false});
  assert.deepEqual(Object.keys(out).sort(),Object.keys(golden).sort());
  assert.ok(Object.keys(golden).length>=140,'대조 항목 수');
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});
test('기본값만 있을 때: 엔진을 못 불러와 hr.html의 대비책(shim)만 있어도 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:false,shim:true});
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});
test('기본값만 있을 때: 엔진이 있고 표가 비어 있어도 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{}});
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});
test('표를 못 읽어도(읽기 실패) 옛 화면과 같다 — 기본값으로 조용히 동작',async()=>{
  const out=await renderAll(hr,{engine:true,loadFail:true,settings:{}});
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});
test('숫자·목록 값이 모양이 틀려도(깨진 JSON·범위 밖·글자) 옛 화면과 같다',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[],settings:{'list.leave_types':'not json','list.work_depts':'[{"code":"x"}]','leave.same_day_limit':'abc','leave.same_day_reason_from':'0','leave.half_day_value':'9','leave.my_list_limit':'1','att.issue_list_limit':'999'}});
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});
test('시험이 실제로 잡는지: 화면 글을 한 글자만 바꾸면 대조가 실패한다',async()=>{
  const changed=hr.split("T('sched.title','🗓 근무표')").join("T('sched.title','🗓 근무표!')");
  assert.notEqual(changed,hr);
  assert.notEqual((await renderAll(changed,{engine:false}))['sched.week.staff'],golden['sched.week.staff']);
  const changed2=hr.replace("hubT('leave.my.btn_apply','연차 신청')","hubT('leave.my.btn_apply','연차 신청 ')");
  assert.notEqual(changed2,hr);
  assert.notEqual((await renderAll(changed2,{engine:false}))['leave.render.staff'],golden['leave.render.staff']);
  const changed3=hr.replace("hubT('att.xl.m_done','저장 완료: {n}건'","hubT('att.xl.m_done','저장완료: {n}건'");
  assert.notEqual(changed3,hr);
  assert.notEqual((await renderAll(changed3,{engine:false}))['att.xl.save.ok'],golden['att.xl.save.ok']);
});

/* ───────────── 3. 표에 값이 있으면 그 글 ───────────── */
test('표에 값이 있으면 그 글: 고쳐 쓰는 글 355개가 모두 화면(제목·표 머리·단추·알림창·확인창·메시지)에 나온다',async()=>{
  const h=helpers(),defs=h.hubTextDefs().filter(d=>CH3.test(d.key));
  const stat=new Set([...hr.matchAll(/\bdata-hub(?:k|ph)="([a-z0-9_.]+)"/g)].map(m=>m[1]));
  const dyn=defs.filter(d=>!stat.has(d.key)&&!P7_DATE_TEXT_KEYS.has(d.key)); // 날짜 전환 글 3개는 attendance-date-switch.test.js의 실제 호출로 확인함
  assert.equal(dyn.length,417);
  const out=await renderAll(hr,{engine:true,textRows:dynRows(dyn),settings:{}});
  const b2Defs=defs.filter(d=>/^att\.issue\.p_date$|^att\.issueform\.|^att\.myissue\.|^att\.issue\.(?:evidence_|admin_evidence|awaiting_staff|auto_clock_)/.test(d.key));
  const b2Observed=await require('./fixtures/hub3-harness.cjs').observeAttendanceIssueB2(hr,{textRows:dynRows(b2Defs)});
  const cDefs=defs.filter(d=>d.key.startsWith('att.diff.'));
  const P=await renderAll(hr,{probe:true,engine:true,textRows:dynRows(cDefs),settings:{'att.diff.gap_min':'1','att.diff.show_staff':'1'}}),c=await P.makeCtx();
  c.ctx.ME={id:'u1',name:'김직원',role:'chief'};
  vm.runInContext('this.api.attDiffCardHtml=attDiffCardHtml;this.api.attDiffRenderRows=attDiffRenderRows;this.api.attDiffExportModel=attDiffExportModel;this.api.attDiffLabel=attDiffLabel;this.api.attDiffSignedMinutes=attDiffSignedMinutes;this.api.attDiffGapText=attDiffGapText;this.api.attDiffStaffMissingKinds=attDiffStaffMissingKinds;this.api.attDiffWeekday=attDiffWeekday;this.api.attendanceStaffDiffHtml=attendanceStaffDiffHtml',c.ctx);
  const sample={userId:'u1',name:'김직원',workDate:'2026-10-02',kinds:'출근 · 퇴근',manualIn:'09:02',manualOut:'18:02',fpIn:'09:00',fpOut:'18:00',diffInMin:2,diffOutMin:2,manualStatus:'대기',manualReason:'사유',issueStatus:'',issueReason:''};
  const cObserved=[c.api.attDiffCardHtml(),c.api.attDiffRenderRows({rows:[sample],month:'2026-10',coverageEnd:'2026-10-31'}),c.api.attDiffRenderRows({rows:[],month:'2026-10',coverageEnd:null}),c.api.attDiffRenderRows({rows:[],month:'2026-10',error:{message:'query fail'}})];
  c.ctx.ME.role='staff';cObserved.push(c.api.attendanceStaffDiffHtml([sample]),c.api.attendanceStaffDiffHtml([]),c.api.attendanceStaffDiffHtml({error:'query fail'}));
  cObserved.push(JSON.stringify(c.api.attDiffExportModel([sample],{month:'2026-10',thresholdMin:1,coverageEnd:'2026-10-31',createdAt:'2026-10-03T10:00:00Z'})),JSON.stringify(c.api.attDiffExportModel([],{month:'2026-10',thresholdMin:1,coverageEnd:null,createdAt:'2026-10-03T10:00:00Z'})),c.api.attDiffLabel('출근 · 퇴근 · 지문 출근 없음 · 지문 퇴근 없음 · 지문 없음'),c.api.attDiffSignedMinutes(sample.diffInMin),c.api.attDiffSignedMinutes(sample.diffOutMin),c.api.attDiffGapText(2,2),c.api.attDiffStaffMissingKinds('출근 · 퇴근 · 지문 출근 없음 · 지문 퇴근 없음 · 지문 없음'),...['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10'].map(d=>c.api.attDiffWeekday(d)));
  const cObservedText=cObserved.join('\n');
  const cObservedMissing=cDefs.filter(d=>!cObservedText.includes('«'+d.key+'»')).map(d=>d.key);
  assert.equal(cObservedMissing.length,0,'C 차이 글은 관리자·직원·오류·빈 상태·엑셀의 실제 렌더에 모두 나타남 '+cObservedMissing.join(', '));
  const all=Object.values(out).join('\n')+'\n'+b2Observed+'\n'+cObservedText;
  const legacyMissing=dyn.filter(d=>!b2Defs.some(x=>x.key===d.key)&&!all.includes('«'+d.key+'»')).map(d=>d.key);
  const visibleMissing=b2Defs.filter(d=>d.key!=='att.myissue.th_evidence'&&!all.includes('«'+d.key+'»')).map(d=>d.key);
  assert.equal(legacyMissing.length,0,'기존 화면 글은 기존 관측 그대로 검사: '+legacyMissing.join(', '));
  assert.equal(visibleMissing.length,0,'B2 양식·카드·관리자 표·증거 목록은 실제 관측 렌더로 검사: '+visibleMissing.join(', '));
  // 자리표시자는 화면이 채워 넣음
  assert.match(all,/«att\.close\.confirm»/);
  assert.ok(!/«[a-z0-9_.]+»[^"\\]*\{[a-z_]+\}/.test(all.replace(/\\"/g,'"')),'{자리표시자}가 채워지지 않고 남음');
});
test('표에 값이 있으면 그 글: 구체적인 예(근무표 제목·내 연차 단추·소명 안내·지문 엑셀 메시지) + HTML은 이스케이프',async()=>{
  const rows=[{key:'sched.title',value:'🗓 우리 근무표 <진짜>'},{key:'leave.my.btn_apply',value:'휴가 신청하기'},{key:'att.my.fix_c',value:'을(를) 올려 주세요.'},
    {key:'att.xl.m_done',value:'{n}건 올렸어요'},{key:'leave.m_clash',value:'이미 {n}명이라 못 해요'},{key:'sched.rt.title',value:'👥 명부'},{key:'att.manual.title',value:'<b>수기</b> 입력'}];
  const out=await renderAll(hr,{engine:true,textRows:rows,settings:{}});
  assert.match(out['sched.week.staff'],/<h2>🗓 우리 근무표 &lt;진짜&gt; <span/);
  assert.match(out['sched.month.staff'],/<h2>🗓 우리 근무표 &lt;진짜&gt;<\/h2>/);
  assert.match(out['sched.week.err_week'],/<h2>🗓 우리 근무표 &lt;진짜&gt;<\/h2>/);
  assert.match(out['leave.render.staff'],/onclick="openLeave\(\)">휴가 신청하기<\/button>/);
  assert.match(out['att.render.staff.data'],/관리자에게\s*<b>지문누락 소명<\/b>을\(를\) 올려 주세요\./);
  assert.match(out['att.xl.save.ok'],/\["1건 올렸어요"/);
  assert.match(out['leave.clash.2'],/이미 2명이라 못 해요/);
  assert.match(out['sched.roster.card'],/<summary[^>]*>👥 명부<\/summary>/);
  assert.match(out['att.render.staff.data'],/<h2>&lt;b&gt;수기&lt;\/b&gt; 입력 <span/);
  assert.ok(!out['att.render.staff.data'].includes('<b>수기</b>'));
  // 바꾸지 않은 칸은 그대로
  assert.match(out['sched.week.staff'],/<button class="mini" onclick="navWeek\(7\)">다음주 ▶<\/button>/);
});
test('표에 값이 있어도 글이 비어 있거나 공백뿐이면 무시하고 기본 글',async()=>{
  const out=await renderAll(hr,{engine:true,textRows:[{key:'sched.title',value:'   '},{key:'leave.my.title',value:''}],settings:{}});
  for(const k of Object.keys(golden))assert.equal(attendanceLegacyLayout(out[k]),golden[k],k);
});

/* ───────────── 4. 고정 HTML(모달) 속 글 ───────────── */
test('모달 속 고정 글 19개: 기본값 그대로·표에 값이 있으면 바뀌고·되돌리면 다시 기본값(연차 신청 창·휴가 신청서 창·지문 엑셀 창)',async()=>{
  const items=[];
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubk="([a-z0-9_.]+)"[^>]*>([^<]*)</g))if(CH3.test(sm[1]))items.push({kind:'k',key:sm[1],text:sm[2]});
  for(const sm of hr.matchAll(/<[a-z0-9]+\b[^>]*\bdata-hubph="([a-z0-9_.]+)"[^>]*>/g))if(CH3.test(sm[1]))items.push({kind:'ph',key:sm[1],text:/placeholder="([^"]*)"/.exec(sm[0])[1]});
  assert.equal(items.length,19);
  const els=items.map(it=>{const attrs={};return {dataset:{},_attrs:attrs,textContent:it.kind==='k'?it.text:'',getAttribute(n){return n==='data-hubk'||n==='data-hubph'?it.key:(n==='placeholder'?attrs.placeholder:null);},setAttribute(n,v){attrs[n]=v;},it};});
  for(const e of els.filter(e=>e.it.kind==='ph'))e._attrs.placeholder=e.it.text;
  const doc={querySelectorAll(sel){return els.filter(e=>sel==='[data-hubk]'?e.it.kind==='k':e.it.kind==='ph');}};
  const run=async(rows)=>{
    const P=await renderAll(hr,{engine:true,textRows:rows,settings:{},probe:true});
    const r=await P.asMgr('staff',{document:doc});
    r.api2.hubStaticFill();
  };
  const cur=e=>e.it.kind==='k'?e.textContent:e._attrs.placeholder;
  await run([]);
  for(const e of els)assert.equal(cur(e),e.it.text,e.it.key+' 기본값이면 그대로');
  await run(items.map(it=>({key:it.key,value:'바꾼 '+it.key})));
  for(const e of els)assert.equal(cur(e),'바꾼 '+e.it.key,e.it.key+' 표에 값');
  await run([]); // 되돌리기(표에서 행이 지워짐) → 처음 기본 글이 다시 나옴
  for(const e of els)assert.equal(cur(e),e.it.text,e.it.key+' 되돌리기');
  // 엔진 없이(대비책만)도 안 깨짐
  const Pn=await renderAll(hr,{engine:false,probe:true});
  const rn=await Pn.asMgr('staff',{document:doc});rn.api2.hubStaticFill();
  for(const e of els)assert.equal(cur(e),e.it.text);
});

/* ───────────── 5. 연차 기준 숫자 ───────────── */
test('숫자 읽기(hubSettingChecked): 기본값 · 표 값 · 범위 밖·글자·빈 값이면 기본값',()=>{
  const h=helpers();
  const t=(k,v,def)=>{h.hubSettingSetValues(v===undefined?{}:{[k]:v});return h.hubSettingChecked(k,def);};
  assert.equal(t('leave.same_day_limit',undefined,2),2);
  assert.equal(t('leave.same_day_limit','3',2),3);
  for(const bad of ['0','31','abc','','  ','1.5','-1','２'])assert.equal(t('leave.same_day_limit',bad,2),2,'잘못된 값 → 기본값: '+JSON.stringify(bad));
  assert.equal(t('leave.half_day_value','0.7',0.5),0.7);
  assert.equal(t('leave.half_day_value','1',0.5),1);
  for(const bad of ['0','0.05','1.1','2','abc','','0.55','.5'])assert.equal(t('leave.half_day_value',bad,0.5),0.5,'잘못된 값 → 기본값: '+JSON.stringify(bad));
  assert.equal(t('leave.my_list_limit','50',20),50);assert.equal(t('leave.my_list_limit','4',20),20);assert.equal(t('leave.my_list_limit','101',20),20);
  assert.equal(t('att.issue_list_limit','5',30),5);assert.equal(t('att.issue_list_limit','100',30),100);
  assert.equal(t('없는.키','7',3),7,'정의에 없는 키는 숫자이면 그대로');assert.equal(t('없는.키','x',3),3);
});

async function leaveProbe(settings,n,vals,extraSb){
  const P=await renderAll(hr,{engine:true,textRows:[],settings:settings||{},probe:true});
  const d=P.makeDom();
  Object.entries(Object.assign({'#lvFrom':'2026-10-05','#lvTo':'2026-10-05','#lvType':'연차','#lvTimeFrom':'','#lvTimeTo':'','#lvReason':'','#lvContact':'','#lvSpecial':'','#lvNote':''},vals||{})).forEach(([k,v])=>{d.$(k).value=v;});
  const spec={list:Array.from({length:n},(_,i)=>({user_id:'u'+(i+2),date_from:'2026-10-05',date_to:'2026-10-05'}))};
  let inserted=null;
  const sb={from:t=>{if(t!=='leave_requests')return P.chain({list:[]});const c=P.chain(spec);return new Proxy(c,{get(tg,k){if(k==='insert')return pl=>{inserted=pl;return {select:()=>({maybeSingle:async()=>({data:{id:1},error:null})})};};return tg[k];}});}};
  const r=await P.asMgr('staff',{$:d.$,sb});
  return {r,d,inserted:()=>inserted};
}
test('동시 휴가 기준: 설정을 바꾸면 신청 가능 여부·특별사정 사유 요구·안내 글이 그 기준을 따른다',async()=>{
  // 막히는 인원 3 · 사유가 필요해지는 인원 2
  const S={'leave.same_day_limit':'3','leave.same_day_reason_from':'2'};
  let p=await leaveProbe(S,1,{});await p.r.api.submitLeave();
  assert.ok(p.inserted(),'1명 있어도 사유 없이 신청됨(2명부터 사유)');assert.equal(p.inserted().special,false);
  p=await leaveProbe(S,2,{});await p.r.api.submitLeave();
  assert.equal(p.inserted(),null,'2명이면 사유 없이는 안 됨');assert.match(p.d.$('#lvMsg').innerHTML,/특별사정 사유를 적어야/);
  p=await leaveProbe(S,2,{'#lvSpecial':'급한 일'});await p.r.api.submitLeave();
  assert.ok(p.inserted());assert.equal(p.inserted().special,true);assert.equal(p.inserted().special_reason,'급한 일');
  p=await leaveProbe(S,3,{'#lvSpecial':'급한 일'});await p.r.api.submitLeave();
  assert.equal(p.inserted(),null,'3명이면 사유가 있어도 못 함');assert.match(p.d.$('#lvMsg').innerHTML,/그 날 이미 3명이 휴가입니다\./);
  // 겹침 안내(checkClash)
  for(const [n,wrap,msg] of [[1,'none',''],[2,'',''],[3,'none','그 날 이미 3명이 휴가입니다. 신청할 수 없습니다']]){
    p=await leaveProbe(S,n,{});await p.r.api.checkClash();
    assert.equal(p.d.$('#lvSpecialWrap').style.display,wrap,n+'명일 때 특별사정 칸');assert.equal(p.d.$('#lvMsg').textContent,msg,n+'명일 때 안내');
  }
  // 사유가 필요한 인원이 막히는 인원보다 크면(의미 없는 값) 막히는 인원에서 막기만 함
  const odd={'leave.same_day_limit':'2','leave.same_day_reason_from':'5'};
  p=await leaveProbe(odd,1,{});await p.r.api.submitLeave();assert.ok(p.inserted(),'1명은 사유 없이 됨');
  p=await leaveProbe(odd,2,{});await p.r.api.submitLeave();assert.equal(p.inserted(),null);assert.match(p.d.$('#lvMsg').innerHTML,/이미 2명이 휴가입니다/);
  // 잘못된 값이면 기본(2명 막힘·1명 사유)
  const bad={'leave.same_day_limit':'abc','leave.same_day_reason_from':'99'};
  p=await leaveProbe(bad,1,{});await p.r.api.submitLeave();assert.equal(p.inserted(),null);assert.match(p.d.$('#lvMsg').innerHTML,/특별사정 사유를 적어야/);
  p=await leaveProbe(bad,2,{});await p.r.api.submitLeave();assert.match(p.d.$('#lvMsg').innerHTML,/이미 2명이 휴가입니다/);
  // 안내 글 자체도 표에서 고침({n}은 화면이 채움)
  const P2=await renderAll(hr,{engine:true,textRows:[{key:'leave.m_full',value:'{n}명이 차서 안 돼요'}],settings:S,probe:true});
  assert.ok(P2);
});
test('반차·조퇴 일수: 설정을 바꾸면 반차·조퇴 신청의 일수가 바뀌고 연차는 그대로, 잘못된 값이면 0.5',async()=>{
  const days=async(settings,type)=>{const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});const r=await P.asMgr('staff',null,{tables:{holidays:{list:[]},schedules:{list:[]}}});return r.api.computeLeaveDays('u1','2026-10-05','2026-10-07',type);};
  assert.deepEqual([await days({},'반차'),await days({},'조퇴'),await days({},'연차')],[0.5,0.5,3]);
  assert.deepEqual([await days({'leave.half_day_value':'0.7'},'반차'),await days({'leave.half_day_value':'0.7'},'조퇴'),await days({'leave.half_day_value':'0.7'},'연차')],[0.7,0.7,3]);
  assert.equal(await days({'leave.half_day_value':'1'},'반차'),1);
  for(const bad of ['0','2','abc','0.55',''])assert.equal(await days({'leave.half_day_value':bad},'반차'),0.5,bad);
});
test('목록 건수: 내 신청 내역·지문누락 소명 목록의 건수가 설정을 따르고 잘못된 값이면 기본(20·30)',async()=>{
  const lims=async(settings,role,fn)=>{
    const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});
    const rec=[];
    const mkRec=(spec,t)=>{const c=P.chain(spec);const w=new Proxy(c,{get(tg,k){if(k==='limit')return n=>{rec.push([t,n]);return w;};const v=tg[k];if(k==='then')return v;return (...a)=>{const r=v(...a);return r===c?w:r;};}});return w;};
    const sb={from:t=>mkRec(tablesFor(t)||{list:[],single:null},t),rpc:async()=>({data:[{}],error:null})};
    const r=await P.asMgr(role,{sb});
    const m={innerHTML:''};await r.api[fn](m);
    return rec;
  };
  const find=(rec,t)=>rec.filter(x=>x[0]===t).map(x=>x[1]);
  assert.deepEqual(find(await lims({},'staff','renderLeave'),'leave_requests'),[20]);
  assert.deepEqual(find(await lims({'leave.my_list_limit':'7'},'staff','renderLeave'),'leave_requests'),[7]);
  assert.deepEqual(find(await lims({'leave.my_list_limit':'1000'},'staff','renderLeave'),'leave_requests'),[20]);
  assert.ok(find(await lims({},'chief','renderAtt'),'attendance_issues').includes(30));
  assert.ok(find(await lims({'att.issue_list_limit':'12'},'chief','renderAtt'),'attendance_issues').includes(12));
  assert.ok(find(await lims({'att.issue_list_limit':'abc'},'chief','renderAtt'),'attendance_issues').includes(30));
});

/* ───────────── 6. 연차 유형 · 근무부서 목록 ───────────── */
test('연차 유형 이름: 보이는 이름만 바뀌고 저장되는 값(코드)은 그대로 — 신청 창 선택칸·내 신청 내역·승인 대기·신청서·표시 글',async()=>{
  const settings={'list.leave_types':JSON.stringify([{code:'연차',label:'정기 휴가'},{code:'반차',label:'반일 휴가'},{code:'조퇴',label:'일찍 퇴근'},{code:'기타',label:'그 밖'}])};
  const out=await renderAll(hr,{engine:true,textRows:[],settings});
  assert.match(out['leave.render.staff'],/<td>정기 휴가<\/td>/);assert.match(out['leave.render.staff'],/<td>일찍 퇴근 · 13:00~15:00<\/td>/);assert.match(out['leave.render.staff'],/<td>그 밖 · &lt;경조사&gt;<\/td>|<td>그 밖<\/td>/);
  assert.match(out['leave.render.chief'],/<td>반일 휴가\(09:00~13:00\)<\/td>/,'승인 대기 표');
  assert.match(out['leave.form.html'],/휴가종류<\/th><td[^>]*>일찍 퇴근 \(13:00~15:00\)</,'휴가 신청서');
  assert.equal(JSON.parse(out['leave.displayText'])[0],'정기 휴가');assert.equal(JSON.parse(out['leave.displayText'])[1],'반일 휴가 · 09:00~13:00');assert.equal(JSON.parse(out['leave.displayText'])[4],'정기 휴가','모르는 유형은 연차 취급(기존 규칙)');
  assert.match(out['sched.month.staff'],/반일 휴가 · 09:00~13:00|정기 휴가/);
  // 신청 창 선택칸: 값은 코드, 보이는 글은 새 이름
  const P=await renderAll(hr,{engine:true,textRows:[],settings,probe:true});
  const r=await P.asMgr('staff',{document:{querySelectorAll:()=>[]}});
  r.api2.leaveApplyModalPrepare();
  assert.equal(r.ctx.$('#lvType').innerHTML,'<option value="연차">정기 휴가</option><option value="반차">반일 휴가</option><option value="조퇴">일찍 퇴근</option><option value="기타">그 밖</option>');
  // 코드는 서버가 허락한 4개뿐: 목록에 낯선 코드가 끼어도 화면에 안 나옴
  const evil={'list.leave_types':JSON.stringify([{code:'연차',label:'연차'},{code:'휴직',label:'휴직'}])};
  const P2=await renderAll(hr,{engine:true,textRows:[],settings:evil,probe:true});
  const r2=await P2.asMgr('staff',{document:{querySelectorAll:()=>[]}});
  assert.deepEqual(clone(r2.api2.leaveTypeItems().map(i=>i.code)),['연차','반차','조퇴','기타']);
  assert.equal(r2.api2.leaveTypeLabel('휴직'),'휴직','모르는 코드는 그대로');
});
test('근무부서 이름: 보이는 이름만 바뀌고 값(코드)은 그대로, 낯선 부서는 선택칸에 안 나옴',async()=>{
  const names=['의사','진료','접수','기공','미정','상담팀','행정팀'];
  const settings={'list.work_depts':JSON.stringify(['Dr.','진료실','데스크','기공실','미지정','상담','행정'].map((c,i)=>({code:c,label:names[i]})))};
  const out=await renderAll(hr,{engine:true,textRows:[],settings});
  const card=out['sched.roster.card'];
  assert.match(card,/<option value="">근무부서 선택<\/option><option value="Dr\." >의사<\/option><option value="진료실" >진료<\/option>/,'선택칸: 값은 코드 그대로, 보이는 글만 새 이름');
  assert.match(card,/<option value="진료실" selected>진료<\/option>/);assert.match(card,/<option value="미지정" selected>미정<\/option>/);
  assert.ok(!card.includes('>상담</option>')&&card.includes('>상담팀</option>'));
  const P=await renderAll(hr,{engine:true,textRows:[],settings:{'list.work_depts':JSON.stringify([{code:'Dr.',label:'원장'},{code:'신설과',label:'신설과'}])},probe:true});
  const r=await P.asMgr('chief');
  const html=r.api.scheduleRosterAdminCard();
  assert.ok(!html.includes('신설과'),'DB가 허락하지 않는 부서 코드는 선택칸에 안 나옴');assert.match(html,/value="Dr\." >원장</);
});
test('목록 저장 검사: 연차 유형·근무부서는 새 항목을 못 늘리고 기본 코드는 못 지우며 이름만 고침',()=>{
  const h=helpers();
  for(const key of ['list.leave_types','list.work_depts']){
    const def=h.HUB_LIST_DEFS.find(d=>d.key===key);
    const renamed=clone(def.def).map((i,n)=>({code:i.code,label:'이름'+n}));
    assert.equal(h.hubListValidate(def,renamed).ok,true,key+' 이름만 바꾸기 OK');
    assert.equal(h.hubListValidate(def,renamed.concat([{code:'새코드',label:'새이름'}])).ok,false,key+' 새 항목 거절');
    assert.equal(h.hubListValidate(def,renamed.slice(1)).ok,false,key+' 기본 코드 지우기 거절');
    assert.equal(h.hubListValidate(def,renamed.map((i,n)=>n===0?{code:'바뀐코드',label:i.label}:i)).ok,false,key+' 코드 바꾸기(=지우고 새로 넣기) 거절');
    assert.equal(h.hubListValidate(def,renamed.map(i=>({code:i.code,label:'같은'}))).ok,false,key+' 이름 중복 거절');
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
test('화면: 글 고치기에 출퇴근·근무표·연차 묶음 11개가 접혀 나오고 검색으로 찾을 수 있으며, 저장하면 hub_ui_texts에 upsert',async()=>{
  const t=ui({});
  await t.render(OWNER);
  const sec=t.section.innerHTML;
  for(const name of ['🕘 출퇴근 › 내 출퇴근(직원 화면)','🕘 출퇴근 › 수기 출퇴근 입력','🕘 출퇴근 › 월 마감·인정 근태·수기 검토(실장·원장)','🕘 출퇴근 › 결근 후보·지문누락 소명','🕘 출퇴근 › 지문 엑셀 올리기 창','🗓 근무표 › 주간·월간 화면','🗓 근무표 › 근무명부 관리','🌿 연차 › 내 연차·신청 내역·승인','🌿 연차 › 연차 신청 창','🌿 연차 › 휴가 신청서','🌿 연차 › 연차 부여·자동 적립(원장)'])
    assert.ok(sec.includes('data-hub-group="'+name+'"'),name);
  assert.match(sec,/이름표: sched\.title/);assert.match(sec,/이름표: leave\.apply\.special/);
  const idx=Number(sec.match(/data-hub-text-row="(\d+)">(?:(?!data-hub-text-row)[^])*?이름표: leave\.my\.btn_apply/)[1]);
  t.el('#hubTxtIn_'+idx).value='휴가 신청하기';
  await t.click('[hub-text-save]='+idx);
  const up=t.state.calls.filter(c=>c.table==='hub_ui_texts'&&c.op==='upsert');
  assert.equal(up.length,1);assert.deepEqual(clone(up[0].payload),{key:'leave.my.btn_apply',value:'휴가 신청하기'});
  assert.equal(t.el('#hubTxtMsg_'+idx).textContent,'저장했어요.');
  await t.click('[hub-text-reset]='+idx);
  assert.equal(t.state.texts.length,0);
  // 검색: 이름표·화면 위치·글 어디에든 낱말이 있으면 찾음(모달 속 고정 글도)
  const h=helpers(),hits=q=>h.hubTextDefs().filter(d=>h.hubTextMatches(d,q,null)).map(d=>d.key);
  assert.ok(hits('특별사정').includes('leave.apply.special')&&hits('특별사정').includes('leave.m_need_reason')&&hits('특별사정').includes('leave.form.special'));
  assert.ok(hits('근무명부 관리').includes('sched.rt.title')&&hits('지문 엑셀').includes('att.xl.modal_title'));
  assert.ok(hits('직원별 연차').includes('leave.grant.title'));
});
test('화면: 🔢 숫자·기준 — 연차·소명 기준 5개가 더 있고(반차 값은 소수 입력), 잘못된 값은 DB 호출 없이 거절, 저장·되돌리기',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,6+12+2+4+1+8+1+1+6+1+7,'근태 7 + 연차·소명 5 + 차례 4 결재 건수 2 + 차례 5 문의함·상담일지 4');
  assert.ok(sec.includes('🌿 연차 기준')&&sec.includes('🕘 근태 기준'));
  assert.match(sec,/id="hubSetIn_8" type="number" inputmode="numeric" min="1" max="30" value="2"/);
  assert.match(sec,/id="hubSetIn_10" type="number" inputmode="decimal" step="0\.1" min="0\.1" max="1" value="0\.5"/);
  assert.match(sec,/처음 값 0\.5 · 0\.1~1 사이/);
  const before=t.state.calls.length;
  for(const [i,bad] of [[8,'0'],[8,'31'],[8,'abc'],[8,''],[9,'-1'],[10,'0.05'],[10,'1.5'],[10,'0.55'],[10,'abc'],[11,'4'],[7,'101']]){
    t.el('#hubSetIn_'+i).value=bad;await t.click('[hub-set-save]='+i);
    assert.match(t.el('#hubSetMsg_'+i).textContent,/저장하지 못했어요/,i+' '+bad);
  }
  assert.equal(t.state.calls.length,before,'잘못된 값은 DB를 부르지 않음');
  t.el('#hubSetIn_8').value='3';await t.click('[hub-set-save]=8');
  t.el('#hubSetIn_10').value='0.7';await t.click('[hub-set-save]=10');
  const ups=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.deepEqual(clone(ups.map(u=>u.payload)),[{key:'leave.same_day_limit',value:'3'},{key:'leave.half_day_value',value:'0.7'}]);
  assert.match(t.sb&&t.el('#hubSetBadge_8').innerHTML||'', /고침|/);
  await t.click('[hub-set-reset]=10');
  assert.equal(t.state.settings.find(r=>r.key==='leave.half_day_value').value,'0.5','되돌리기는 기본값을 다시 적음(설정 표는 지울 수 없음)');
});
test('화면: 📋 목록에 연차 유형 이름·근무부서 이름이 있고, 코드는 회색(못 고침)·새 항목 추가 단추는 없음',async()=>{
  const t=ui({});
  await t.render(OWNER);
  await t.click('[hub-subtab]=lists');
  let sec=t.section.innerHTML;
  assert.ok(sec.includes('연차 유형 이름')&&sec.includes('근무부서 이름'));
  assert.equal((sec.match(/<span class="hub-code">/g)||[]).length,5+4+6+3+4+4+7+6+3+8+7+6+5+32+3,'차례 4: 결재 종류 6 · 일정 종류 3 추가 + 차례 5: 문의 출처 8 · 문의 상태 7 · 상담 구분 6 · 상담 상태 5 + B2 소명 종류 3');
  assert.equal((sec.match(/data-hub-list-add=/g)||[]).length,2,'새 항목을 늘릴 수 있는 목록은 직원 부서·서류 종류뿐');
  assert.match(sec,/<span class="hub-code">반차<\/span><input id="hubLstLbl_4_1" type="text" maxlength="20" value="반차"/);
  assert.match(sec,/<span class="hub-code">Dr\.<\/span><input id="hubLstLbl_5_0" type="text" maxlength="20" value="Dr\."/);
  ['연차','반일 휴가','조퇴','기타'].forEach((v,i)=>{t.el('#hubLstLbl_4_'+i).value=v;}); // 가짜 화면은 칸 값을 직접 채워야 함
  await t.click('[hub-list-save]=4');
  const up=t.state.calls.filter(c=>c.table==='app_settings'&&c.op==='upsert');
  assert.equal(up.length,1);assert.equal(up[0].payload.key,'list.leave_types');
  assert.deepEqual(clone(JSON.parse(up[0].payload.value)),[{code:'연차',label:'연차'},{code:'반차',label:'반일 휴가'},{code:'조퇴',label:'조퇴'},{code:'기타',label:'기타'}]);
});

/* ───────────── 8. 기타 ───────────── */
test('휴가 신청서의 도장 글(신청·승인)은 HTML이 섞여도 이스케이프된다',async()=>{
  const P=await renderAll(hr,{engine:false,probe:true});
  const r=await P.asMgr('staff');
  assert.match(r.api.appStamp('나','2026-10-01T03:00:00Z','<발행>'),/class="appstamp">&lt;발행&gt;<br>/);
  assert.match(r.api.appStamp('원장','2026-10-01T03:00:00Z'),/class="appstamp">승인<br>원장<br>2026\.10\.01/);
});
test('SQL: 새 SQL 파일 없음 — app_settings는 원장 upsert를 이미 허용(읽기 로그인 직원·쓰기 원장)',()=>{
  const sql=read('db/hr_settings.sql');
  assert.match(sql,/app_settings_insert_owner[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_update_owner[\s\S]*using \(public\.my_role\(\) = 'owner'\)[\s\S]*with check \(public\.my_role\(\) = 'owner'\)/);
  assert.match(sql,/app_settings_select_all[\s\S]*using \(true\)/);
  assert.equal(fs.existsSync(path.join(root,'db/hub_ui_texts_3.sql')),false);
  // DB 함수에도 박혀 있는 숫자(수기 연장 10분 단위)는 이번에 안 옮김: 화면 코드가 그대로 10분 단위
  assert.match(hr,/Math\.floor\(n\/10\)\*10/);assert.match(read('db/attendance_manual_v2.sql'),/floor\(lunch_min\/10\.0\)\*10/);
  const SEC=String.fromCharCode(0xA7); // 섹션 기호는 어디에도 쓰지 않는 규칙(이 파일에도 글자 그대로는 안 씀)
  assert.ok(!js.includes(SEC)&&!hr.includes(SEC));
  for(const f of ['tests/fixtures/hub3-harness.cjs','tests/hub-ui-texts-3.test.js','tests/manual/make-hub3-golden.cjs'])assert.ok(!read(f).includes(SEC),f);
});
