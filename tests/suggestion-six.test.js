const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(extra={}){
  const html=fs.readFileSync('hr.html','utf8'),block=html.match(/\/\* suggestion-six:start \*\/[\s\S]*?\/\* suggestion-six:end \*\//);
  assert.ok(block,'건의 구현 코드가 있어야 함');
  const c={ME:{id:'me',role:'staff'},today:()=> '2026-10-06',esc:s=>String(s??''),hubT:(k,d,v)=>Object.entries(v||{}).reduce((s,[k,x])=>s.replaceAll('{'+k+'}',x),d),...extra};
  vm.createContext(c);vm.runInContext((html.match(/^function leaveLedgerTotals[^\r\n]+/m)?.[0]||'')+';'+block[0],c);return c;
}
test('승인된 본인 미래 연차만 취소·반차 변경 요청 단추가 열린다',()=>{
  const c=setup(),r={id:1,user_id:'me',status:'승인',type:'연차',date_from:'2026-10-07',date_to:'2026-10-07'};
  assert.match(c.leaveChangeButtons(r),/requestLeaveChange\(1,'cancel'\)/);
  assert.match(c.leaveChangeButtons(r),/requestLeaveChange\(1,'half'\)/);
  for(const patch of [{user_id:'other'},{status:'대기'},{date_from:'2026-10-05'}])assert.equal(c.leaveChangeButtons({...r,...patch}),'');
  assert.doesNotMatch(c.leaveChangeButtons({...r,type:'반차'}),/'half'/);
});
test('변경 요청 결재는 실장만 승인하고 원장은 사전 반려한다',()=>{
  const row={id:1,user_id:'me',action:'cancel',status:'대기',reason:'일정 변경'};
  assert.match(setup({ME:{role:'chief'}}).leaveChangeCards([row]),/processLeaveChange\(1,'approve'\)/);
  assert.doesNotMatch(setup({ME:{role:'owner'}}).leaveChangeCards([row]),/'approve'/);
  assert.match(setup({ME:{role:'owner'}}).leaveChangeCards([row]),/'reject'/);
  assert.doesNotMatch(setup().leaveChangeCards([row]),/processLeaveChange/);
});

test('연차 세 칸은 원장과 같은 사용·복구 장부와 실제 잔액을 사용한다',()=>{
 const c=setup(),entries=[{kind:'사용',days:3},{kind:'조정',days:0.5,note:'승인취소 복구: 반차'},{kind:'조정',days:2,note:'잔액 조정'}];
 const totals=c.leaveThreeTotals({balance:8},entries,[{status:'대기',days:1},{status:'1차승인',days:0.5},{status:'승인',days:3}]);
 assert.equal(totals.used,2.5);assert.equal(totals.pending,1.5);assert.equal(totals.balance,8);
 assert.match(c.leaveThreeCards(totals),/사용/);assert.match(c.leaveThreeCards(totals),/신청 중/);assert.match(c.leaveThreeCards(totals),/잔여/);
});

test('한 주는 월요일부터 일요일까지이고 일일 RPC 인자·10분 절사를 재사용한다',()=>{
 const c=setup({overtimeDraftMinutes:raw=>raw==='oops'?null:Math.floor(Number(raw||0)/10)*10});
 assert.equal(c.manualWeekDates('2026-10-07').join(','),'2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09,2026-10-10,2026-10-11');
 const args=c.manualWeekPayload({date:'2026-10-06',clockIn:'09:00',clockOut:'18:00',lunch:'19',clockout:'28',evening:'0',late:'0',early:'0',half:'없음',reason:'',note:''});
 assert.equal(args.p_lunch_overtime_min,10);assert.equal(args.p_clockout_overtime_min,20);assert.equal(args.p_work_date,'2026-10-06');
 assert.match(c.manualWeekValidate({...args,p_reason_required:true}),/사유/);
 assert.match(c.manualWeekValidate({...args,p_late_min:-1}),/형식/);
});
test('주간 저장은 지문 날을 잠그고 오류 줄만 남기며 유효 줄 저장을 확인한다',async()=>{
 const calls=[],c=setup({confirm:()=>false,sb:{rpc:async(n,a)=>{calls.push([n,a]);return {data:{id:1}};}}});
 const good={p_work_date:'2026-10-06',p_late_min:0,p_early_min:0,p_lunch_overtime_min:0,p_clockout_overtime_min:0,p_evening_overtime_min:0,p_half_day:'없음'};
 const rows=[{args:good},{args:{...good,p_work_date:'2026-10-07',p_late_min:-1}},{args:{...good,p_work_date:'2026-10-08'},fingerprint:true}];
 let out=await c.saveManualWeekRows(rows);assert.equal(calls.length,0);assert.equal(out[1].status,'error');assert.equal(out[2].status,'locked');
 c.confirm=()=>true;out=await c.saveManualWeekRows(rows);assert.equal(calls.length,1);assert.equal(calls[0][0],'submit_manual_attendance_d');assert.equal(out[0].status,'saved');
});

test('물품구매는 설정 목록·선택 값·문서 표시에서 같은 종류로 처리된다',()=>{
 const html=fs.readFileSync('hr.html','utf8'),c=setup();
 const mapping=html.match(/const APPROVAL_KIND_VALUES=[^;]+;/)[0],items=html.match(/^function approvalKindItems[^\r\n]+/m)[0],value=html.match(/^function approvalKindValue[^\r\n]+/m)[0];
 vm.runInContext(mapping+items+value,c);assert.equal(c.approvalKindValue('물품구매'),'물품구매');assert.ok(c.approvalKindItems().some(r=>r.code==='물품구매'));
 const texts=fs.readFileSync('hub-texts.js','utf8');assert.match(texts,/code:'물품구매',label:'물품구매'/);
});

test('승인 대기 안내는 신입 안내·공통 목록과 본인 서류·지문 동작만 연다',()=>{
 const c=setup({onboardingGuideCard:()=>'<div>신입 첫날 안내</div>'});
 const out=c.pendingOnboardingHtml([{label:'공통 서류 제출'}],[{original_name:'내 서류.pdf'}],null);
 assert.match(out,/신입 첫날 안내/);assert.match(out,/공통 입사 체크리스트/);assert.match(out,/내 서류.pdf/);assert.match(out,/pendingUploadDocument/);assert.match(out,/pendingReportFingerprint/);
 assert.doesNotMatch(out,/go\(|renderOnbo|edUser|leave|다른 직원/);
});

test('본인 월 표는 다른 직원 자료를 제외하고 월 날짜·요일·연차·수기와 합계를 만든다',()=>{
 const c=setup({overtimeDraftMinutes:raw=>Math.floor(Number(raw||0)/10)*10});
 const model=c.staffAttendanceMonthModel('2026-10',[
 {user_id:'me',work_date:'2026-10-06',clock_in:'09:00',clock_out:'18:00',overtime_min:29,source:'fp'},
 {user_id:'other',work_date:'2026-10-06',clock_in:'10:00',overtime_min:100}],
 [{user_id:'me',work_date:'2026-10-07',clock_in:'09:00',clock_out:'18:00',status:'대기',lunch_overtime_min:19,clockout_overtime_min:28,evening_overtime_min:0,half_day:'오전 반차',reason:'입력 사유'}],
 [{user_id:'me',date_from:'2026-10-08',date_to:'2026-10-08',status:'승인',type:'연차'}]);
 assert.equal(model.rows.length,31);assert.equal(model.days,2);assert.equal(model.overtime,50);assert.equal(model.rows[6].half,'오전 반차');assert.equal(model.rows[7].leave,'연차');
 const out=c.staffAttendanceMonthHtml(model);assert.match(out,/인쇄/);assert.match(out,/PDF/);assert.match(out,/입력 사유/);assert.doesNotMatch(out,/100분/);
});

test('취소·반차 요청은 필수 사유를 검증하고 성공 때만 화면을 새로 읽는다',async()=>{
 const calls=[],messages=[],answers=[' ', '일정 변경','09:00~13:00'];
 const c=setup({prompt:()=>answers.shift(),alert:m=>messages.push(m),render:async()=>calls.push('render'),refreshBadges:async()=>calls.push('badge'),sb:{rpc:async(n,a)=>{calls.push([n,a]);return {data:7};}}});
 await c.requestLeaveChange(1,'cancel');assert.equal(calls.length,0);
 await c.requestLeaveChange(1,'half');assert.equal(calls[0][0],'request_leave_change');assert.equal(calls[0][1].p_type_note,'09:00~13:00');assert.equal(calls[1],'render');
 c.prompt=()=> '사유';c.sb.rpc=async()=>({error:{message:'중복 요청'}});calls.length=0;
 await c.requestLeaveChange(1,'cancel');assert.equal(calls.length,0);assert.match(messages[0],/중복 요청/);
});

test('변경 결재 실패와 확인 취소는 재조회하지 않고, 성공 뒤 중복 클릭을 막는다',async()=>{
 const calls=[],messages=[],c=setup({confirm:()=>false,alert:m=>messages.push(m),render:async()=>calls.push('render'),refreshBadges:async()=>calls.push('badge'),sb:{rpc:async()=>{calls.push('rpc');return {data:[{status:'승인'}]};}}});
 await c.processLeaveChange(1,'approve');assert.equal(calls.length,0);c.confirm=()=>true;
 await Promise.all([c.processLeaveChange(1,'approve'),c.processLeaveChange(1,'approve')]);assert.equal(calls.filter(x=>x==='rpc').length,1);
 c.sb.rpc=async()=>({error:{message:'원본 변경됨'}});calls.length=0;await c.processLeaveChange(2,'approve');assert.equal(calls.length,0);assert.match(messages[0],/원본 변경됨/);
});

test('새 화면 문구는 모두 고칠 수 있는 키이며 자리표시자와 기본값이 유효하다',()=>{
 const js=fs.readFileSync('hub-texts.js','utf8'),block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0],c={};vm.createContext(c);vm.runInContext(block+';this.defs=hubTextDefs();this.set=hubTextSetOverrides;this.text=hubText;',c);
 const defs=c.defs.filter(d=>/^att\.(week|staff_month)\.|^leave\.change\.|^leave\.my\.(used|pending|unit)$|^pending\.onbo\./.test(d.key));
 assert.equal(defs.length,77);assert.equal(new Set(defs.map(d=>d.key)).size,77);
 for(const d of defs){assert.match(d.key,/^[a-z][a-z0-9_.]{1,80}$/);assert.ok(d.screen&&d.where);const vars=[...new Set([...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]))].sort();assert.equal(JSON.stringify(vars),JSON.stringify(Array.from(d.vars||[]).sort()),d.key);c.set([{key:d.key,value:'새 글'}]);assert.equal(c.text(d.key,d.def),'새 글');}
});

test('월 이동 조회는 모든 표에 본인 ID를 걸며 원장은 직원 월 화면을 호출하지 않는다',async()=>{
 const calls=[],elements={'#staffAttMonthContainer':{innerHTML:''}},c=setup({$:id=>elements[id],attendanceMonthBounds:()=>({start:'2026-10-01',next:'2026-11-01'}),fetchAttendancePages:async f=>f(),applyAttendanceResolutions:r=>r,sb:{from(table){const q={select:()=>q,eq(k,v){calls.push([table,k,v]);return q;},gte:()=>q,lt:()=>q,lte:()=>q,then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};return q;}}});
 await c.loadStaffAttendanceMonth('2026-10');assert.equal(calls.filter(r=>r[1]==='user_id'&&r[2]==='me').length,4);assert.match(elements['#staffAttMonthContainer'].innerHTML,/2026-10-31/);
 c.ME.role='owner';calls.length=0;await c.loadStaffAttendanceMonth('2026-10');assert.equal(calls.length,0);
});

test('주간 서버 검사가 실패하면 나머지 저장 여부를 묻고 취소하면 남은 줄을 보존한다',async()=>{
 let calls=0,asked=0;const c=setup({confirm:()=>{asked++;return false;},sb:{rpc:async()=>{calls++;return {error:{message:'저장 검사 실패'}};}}}),args={p_work_date:'2026-10-06',p_late_min:0,p_early_min:0,p_lunch_overtime_min:0,p_clockout_overtime_min:0,p_evening_overtime_min:0,p_half_day:'없음'};
 const out=await c.saveManualWeekRows([{args},{args:{...args,p_work_date:'2026-10-07'}}]);assert.equal(calls,1);assert.equal(asked,1);assert.equal(out[0].status,'error');assert.equal(out[1].status,'ready');
});
