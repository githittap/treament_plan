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
