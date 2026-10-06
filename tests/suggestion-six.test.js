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
