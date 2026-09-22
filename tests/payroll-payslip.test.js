const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('hr.html');
const block=html.match(/\/\* payroll-payslip:test-start \*\/[\s\S]*?\/\* payroll-payslip:test-end \*\//)?.[0];

function ctx(){
  assert.ok(block,'급여명세서 검산 순수 helper 블록이 없습니다.');
  const c={};vm.createContext(c);
  vm.runInContext(block+';this.h={floorTo10,clampNum,payslipTaxBase,calcHealthIns,calcLongTermCare,calcEmploymentIns,calcLocalIncomeTax,'
    +'PAYSLIP_LEDGER_ONLY_KEYS,payslipCrossCheck,timeToMin,overlapMinutes,aggregateAttendanceForPayslip,minutesToHours,PAYSLIP_RATES_2026};',c);
  return c.h;
}

test('건강보험·장기요양·고용보험·지방소득세 검산 공식이 설계서 예시대로 계산된다(과세base=지급액계-식대 200,000 비과세, 절사 10원)',()=>{
  const h=ctx();
  assert.equal(h.payslipTaxBase(3200000,200000),3000000);
  assert.equal(h.payslipTaxBase(3200000,50000),3150000,'식대가 200,000 미만이면 실제 식대만 비과세');
  assert.equal(h.calcHealthIns(3000000),107850);
  assert.equal(h.calcLongTermCare(107850),14170,'장기요양은 보수월액이 아니라 건강보험료에서 파생');
  assert.equal(h.calcEmploymentIns(3000000),27000);
  assert.equal(h.calcLocalIncomeTax(50000),5000);
});

test('건강보험 산정 기준액은 하한 280,390원·상한 127,725,730원으로 clamp된다(국민연금과 달리 천원 절사는 하지 않는다)',()=>{
  const h=ctx();
  assert.equal(h.calcHealthIns(100000),10080,'하한 미만이면 280,390원 기준으로 계산');
  assert.equal(h.calcHealthIns(200000000),4591730,'상한 초과면 127,725,730원 기준으로 계산');
});

test('부동소수점 오차로 절사가 어긋나지 않는다(3,000,000×0.009는 부동소수점으로 26999.999...가 되어 잘못 내림될 수 있음)',()=>{
  const h=ctx();
  assert.equal(3000000*h.PAYSLIP_RATES_2026.employment<27000,true,'이 값 자체가 이미 부동소수점 오차를 갖고 있어야 회귀가 의미 있다');
  assert.equal(h.calcEmploymentIns(3000000),27000,'오차 보정 없이 그냥 floor하면 26990이 나와 10원 초과 오차로 오탐 배지가 뜬다');
});

test('국민연금·소득세·연말정산·조정수당은 재현하지 않고 대장 값 그대로 표시 대상으로 분류된다',()=>{
  const h=ctx();
  ['pension','income_tax','income_tax_yearend','local_tax_yearend','ins_adjust','adjust_allow'].forEach(k=>
    assert.ok(h.PAYSLIP_LEDGER_ONLY_KEYS.includes(k),k+'가 대장전용 목록에 없습니다'));
});

test('검산 병기표는 재현 가능 4항목을 계산해 대장 값과 비교하고, 10원 초과 차이만 diff로, 대장전용 항목은 ledger_only로 분류한다',()=>{
  const h=ctx();
  const items={gross_total:3200000,meal_allow:200000,health_ins:107850,ltc_ins:14170,employment_ins:28000,local_tax:5000,income_tax:50000,pension:135000};
  const rows=h.payslipCrossCheck(items);
  assert.equal(rows.length,6);
  const byKey=k=>rows.find(r=>r.key===k);
  assert.equal(byKey('health_ins').status,'match');assert.equal(byKey('health_ins').diff,0);
  assert.equal(byKey('ltc_ins').status,'match');
  assert.equal(byKey('employment_ins').calc,27000);assert.equal(byKey('employment_ins').diff,1000);assert.equal(byKey('employment_ins').status,'diff','10원을 넘는 차이는 diff 배지');
  assert.equal(byKey('local_tax').status,'match');
  assert.equal(byKey('income_tax').status,'ledger_only');assert.equal(byKey('income_tax').calc,null);
  assert.equal(byKey('pension').status,'ledger_only');assert.equal(byKey('pension').ledger,135000);
});

test('대장에 값이 없는 재현가능 항목은 ledger_missing으로 표시하고 대장전용 항목은 값이 없으면 행 자체를 만들지 않는다',()=>{
  const h=ctx();
  const rows=h.payslipCrossCheck({gross_total:3000000,meal_allow:200000});
  assert.equal(rows.length,4,'재현 가능 4항목만 나오고 대장전용은 값이 없어 행이 없어야 함');
  assert.ok(rows.every(r=>r.status==='ledger_missing'));
});

test('근태 집계는 실제 출퇴근 기록에서 근로일수·총근로시간·연장·야간·휴일근로시간을 뽑는다(야간=22시~06시 겹침, 연장=overtime_min 합)',()=>{
  const h=ctx();
  const rows=[
    {clock_in:'09:00',clock_out:'18:30',overtime_min:30,evening:false,is_holiday:false},
    {clock_in:'09:00',clock_out:'23:00',overtime_min:270,evening:true,is_holiday:false},
    {clock_in:'10:00',clock_out:'16:00',overtime_min:0,evening:false,is_holiday:true}
  ];
  const agg=h.aggregateAttendanceForPayslip(rows);
  assert.deepEqual(JSON.parse(JSON.stringify(agg)),{workedDays:3,totalWorkMinutes:1770,overtimeMinutes:300,nightMinutes:60,holidayMinutes:360});
  assert.equal(h.minutesToHours(agg.totalWorkMinutes),29.5);
});

test('출퇴근 기록이 없는 달은 전부 0으로 집계되고(허위 근무시간을 지어내지 않는다), 퇴근이 출근보다 빠르면 그 날은 세지 않는다',()=>{
  const h=ctx();
  assert.deepEqual(JSON.parse(JSON.stringify(h.aggregateAttendanceForPayslip([]))),{workedDays:0,totalWorkMinutes:0,overtimeMinutes:0,nightMinutes:0,holidayMinutes:0});
  assert.deepEqual(JSON.parse(JSON.stringify(h.aggregateAttendanceForPayslip([{clock_in:'09:00',clock_out:null,overtime_min:0}]))),{workedDays:0,totalWorkMinutes:0,overtimeMinutes:0,nightMinutes:0,holidayMinutes:0});
});

test('명세서 화면은 병원색·3열 표·근로기준법 필수 항목·발행 잠금·인쇄 CSS를 모두 갖춘다',()=>{
  assert.match(html,/#156f72/,'병원 포인트색');
  assert.match(html,/(?:항목|급여항목)[\s\S]{0,40}금액[\s\S]{0,40}산출식/,'지급·공제 3열(항목/금액/산출식)');
  ['근로일수','총근로시간','연장근로시간','야간근로시간','휴일근로시간'].forEach(label=>
    assert.match(html,new RegExp(label),label+' 표시 누락'));
  assert.match(html,/payslip-printing/,'기존 @media print 패턴(leave-printing·calendar-printing)과 같은 방식');
  assert.match(html,/counter\(page\)/,'페이지 번호 CSS 시도');
  assert.match(html,/Chrome[\s\S]{0,60}(지원하지 않|미지원|안 되|신뢰할 수 없)/,'Chrome print가 페이지번호 마진박스를 지원하지 않는다는 사실을 숨기지 않고 주석으로 남김');
  assert.match(html,/issued_by/,'발행 감사 컬럼 사용');
});

test('직원 홈 카드는 본인의 발행된 명세서만 조회한다(owner도 client 필터로 issued만)',()=>{
  assert.match(html,/from\('payslips'\)[\s\S]{0,160}eq\('user_id',ME\.id\)[\s\S]{0,80}eq\('issued',true\)|from\('payslips'\)[\s\S]{0,160}eq\('issued',true\)[\s\S]{0,80}eq\('user_id',ME\.id\)/);
});

test('명세서 발행은 owner 전용 upsert로 payslips에 기록한다',()=>{
  assert.match(html,/sb\.from\('payslips'\)\.upsert\(/);
  assert.match(html,/onConflict:\s*'month,user_id'/);
});
