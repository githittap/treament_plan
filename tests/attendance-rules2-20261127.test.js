// 2026-11-27 월말 근태 — 매니저 의견 2차(③ 수기 연장 인정 · ④ 휴게시간 차감) · 3차(근무표: 월별 요약 · 자동 OFF · 연차 겹침 · 월간 공표)
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const fill=(d,v)=>v?String(d).replace(/\{([a-z_]+)\}/g,(m,n)=>n in v?v[n]:m):d;
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));

/* ───────────── 2차: 근태 계산(월 요약 · 급여 합산) ───────────── */
const summary=html.match(/\/\* attendance-monthly-summary:start \*\/[\s\S]*?\/\* attendance-monthly-summary:end \*\//)[0];
const payroll=html.match(/\/\* payroll-payslip:test-start \*\/[\s\S]*?\/\* payroll-payslip:test-end \*\//)[0];
const apply=html.slice(html.indexOf('function applyAttendanceResolutions('),html.indexOf('let MANUAL_DETAIL_OPEN'));
const bounds=html.slice(html.indexOf('function attendanceMonthBounds('),html.indexOf('\n',html.indexOf('function attendanceMonthBounds(')));
const pages=html.slice(html.indexOf('async function fetchAttendancePages('),html.indexOf('\n',html.indexOf('async function fetchAttendancePages(')));
const toMinLine=html.slice(html.indexOf('const toMin=t=>'),html.indexOf('\n',html.indexOf('const toMin=t=>')));
const jongeop=html.slice(html.indexOf('function jongeop('),html.indexOf('\n}\n',html.indexOf('function jongeop('))+3);
const calcRow=html.slice(html.indexOf('function calcRow('),html.indexOf('\n}\n',html.indexOf('function calcRow('))+3);
const BREAKS={'att.break.lunch_start':'13:00','att.break.lunch_end':'14:00','att.break.dinner_start':'18:30','att.break.dinner_end':'19:00'};
function ctx(settings={}){
  const c={ME:{id:'m1',name:'매니저',role:'manager'},PROFILES:[],Intl,Date,Map,Set,Number,String,JSON,Math,Promise,
    SETTINGS:{late_cut:'09:40',ot_unit_min:'10',jongeop_weekday_evening:'20:00',jongeop_weekday_day:'18:30',jongeop_sat:'17:00',jongeop_sun:'14:00',...BREAKS,...settings},
    hubT:(k,d,v)=>fill(d,v),hubFmtDate:v=>String(v).slice(0,10),hubFmtDateTime:v=>String(v),esc,nameOf:u=>u,setStatus(){},alert(){},confirm:()=>true,hide(){},show(){}};
  vm.createContext(c);vm.runInContext(toMinLine+'\n'+jongeop+'\n'+calcRow+'\n'+apply+bounds+pages+payroll+summary,c);return c;
}
const emp=(id)=>({user_id:id,name:id,role:'staff',dept:'진료실',job_group:'clinical_consult'});
const fp=(over={})=>({id:1,user_id:'a',work_date:'2026-11-03',source:'fp',clock_in:'09:30',clock_out:'18:30',late_min:0,early_min:0,overtime_min:0,evening:false,...over});
const man=(over={})=>({id:10,user_id:'a',work_date:'2026-11-03',status:'대기',clock_in:'09:30',clock_out:'18:30',overtime_min:30,lunch_overtime_min:30,clockout_overtime_min:0,evening_overtime_min:0,...over});
function month(c,rows,manualRows,extra={}){return c.attMonthlyModel({month:'2026-11',rows,manualRows,resolutions:[],employees:[emp('a')],...extra}).employees[0];}

test('③ 지문 09:30~18:30 · 수기 같은 시각 · 점심 연장 30 · 대기 → 연장 30 인정(지문 자동 연장은 안 쓰고 두 번 세지 않음)',()=>{
  const c=ctx(),p=month(c,[fp({overtime_min:20})],[man()]);
  assert.equal(p.days[0].overtimeMinutes,30,'수기 연장 30만(지문 자동 20은 안 더함)');assert.equal(p.summary.overtimeMinutes,30);
  assert.match(p.days[0].basis,/수기 연장\(지문 일치\)/);assert.equal(p.summary.pendingManualDays,0,'인정된 대기는 수기 대기일에 안 셈');
});
test('③ 같은 날 수기 퇴근 18:50(다름) · 대기 → 인정 안 됨(지문 자동 연장만) · 수기 대기일로 셈',()=>{
  const c=ctx(),p=month(c,[fp({overtime_min:20})],[man({clock_out:'18:50',lunch_overtime_min:0,clockout_overtime_min:20,overtime_min:20})]);
  assert.equal(p.days[0].overtimeMinutes,20,'지문 자동 연장 그대로');assert.doesNotMatch(p.days[0].basis,/수기 연장/);assert.equal(p.summary.pendingManualDays,1);
});
test('③ 같은 줄이 실장승인이면 다른 시각이어도 인정(점심+퇴근+저녁 연장 합) · 원장확정도 인정 · 반려·대체는 인정 안 됨',()=>{
  const c=ctx(),base={clock_out:'18:50',lunch_overtime_min:10,clockout_overtime_min:20,evening_overtime_min:15,overtime_min:30};
  let p=month(c,[fp({overtime_min:20})],[man({...base,status:'실장승인'})]);
  assert.equal(p.days[0].overtimeMinutes,45,'10+20+15');assert.match(p.days[0].basis,/수기 연장\(실장 승인\)/);assert.equal(p.summary.pendingManualDays,0);
  p=month(c,[fp({overtime_min:20})],[man({...base,status:'원장확정'})]);assert.equal(p.days[0].overtimeMinutes,45);
  for(const status of ['반려','대체']){p=month(c,[fp({overtime_min:20})],[man({...base,status})]);assert.equal(p.days[0].overtimeMinutes,20,status+': 지문 자동 연장만');assert.equal(p.summary.pendingManualDays,0);}
});
test('③ 지문과 같은 줄에 저녁 연장도 함께 인정하고, 수기 줄이 여러 개면 원장확정 → 아니면 마지막 줄을 씀',()=>{
  const c=ctx(),a=month(c,[fp()],[man({lunch_overtime_min:0,clockout_overtime_min:10,evening_overtime_min:40,overtime_min:10})]);
  assert.equal(a.days[0].overtimeMinutes,50);
  const b=month(c,[fp()],[man({id:11,lunch_overtime_min:10,overtime_min:10}),man({id:12,lunch_overtime_min:30,overtime_min:30})]);assert.equal(b.days[0].overtimeMinutes,30,'마지막 줄');
  const d=month(c,[fp()],[man({id:11,status:'원장확정',lunch_overtime_min:10,overtime_min:10}),man({id:12,lunch_overtime_min:30,overtime_min:30})]);assert.equal(d.days[0].overtimeMinutes,10,'원장확정이 먼저');
});
test('③ 지문 기록이 없는 날(확정 수기 source=manual)은 지금 규칙 그대로 · 대기는 인정 안 되고 수기 대기일로 셈',()=>{
  const c=ctx(),row={id:2,user_id:'a',work_date:'2026-11-04',source:'manual',clock_in:'09:30',clock_out:'18:30',overtime_min:30,evening:false};
  let p=month(c,[row],[man({work_date:'2026-11-04',status:'원장확정',overtime_min:30,evening_overtime_min:20})]);
  assert.equal(p.days[0].overtimeMinutes,50,'옛 규칙: 확정 수기와 같으면 저녁 분을 더함');
  p=month(c,[row],[man({work_date:'2026-11-04',status:'대기',overtime_min:30,evening_overtime_min:20})]);assert.equal(p.days[0].overtimeMinutes,30);assert.equal(p.summary.pendingManualDays,1);
});
test('③ 급여 합산(payslipAttendanceRows·aggregateAttendanceForPayslip)과 월 요약이 같은 연장 분을 냄',()=>{
  const c=ctx(),rows=[fp({overtime_min:20}),fp({id:2,work_date:'2026-11-04',clock_out:'18:50',overtime_min:20})],manual=[man(),man({id:11,work_date:'2026-11-04',status:'실장승인',clock_out:'19:00',lunch_overtime_min:0,clockout_overtime_min:30,overtime_min:30})];
  const agg=c.aggregateAttendanceForPayslip(c.payslipAttendanceRows(rows,manual,[])),p=month(c,rows,manual);
  assert.equal(agg.overtimeMinutes,60,'30 + 30');assert.equal(p.summary.overtimeMinutes,agg.overtimeMinutes);
  assert.equal(p.summary.clockSpanMinutes,agg.totalWorkMinutes);
  assert.equal(JSON.stringify(rows).includes('수기'),false,'원본 근태 줄을 고치지 않음');assert.equal(rows[0].overtime_min,20);
});
test('③ 검토 목록 배지: 지문(보정 있으면 보정 시각)과 출퇴근이 같으면 「지문 일치」, 반려·대체·다른 시각은 아님',()=>{
  const c=ctx(),f={source:'fp',clock_in:'09:30:00',clock_out:'18:30:00'};
  assert.equal(c.attManualFpMatch({status:'대기',clock_in:'09:30',clock_out:'18:30'},f),true);
  assert.equal(c.attManualFpMatch({status:'대기',clock_in:'09:30',clock_out:'18:40'},f),false);
  assert.equal(c.attManualFpMatch({status:'반려',clock_in:'09:30',clock_out:'18:30'},f),false);
  assert.equal(c.attManualFpMatch({status:'대기',clock_in:'09:30',clock_out:'18:30'},null),false);
  assert.equal(c.attManualFpMatch({status:'대기',clock_in:'10:00',clock_out:'19:00'},f,{clock_in:'10:00',clock_out:'19:00'}),true,'승인 보정 시각과 비교');
  assert.match(html,/att\.review\.fp_match','지문 일치 — 연장 자동 인정'/);assert.match(html,/att\.review\.ot_rule/);
});
test('④ 09:30~18:30 → 480분(540−점심 60) · 야간 09:30~20:00 → 540(630−60−30) · 13:30 출근 → 30분만 차감',()=>{
  const c=ctx(),sum=r=>c.aggregateAttendanceForPayslip([r]);
  assert.equal(sum({clock_in:'09:30',clock_out:'18:30',evening:false}).totalWorkMinutes,480);
  assert.equal(sum({clock_in:'09:30',clock_out:'20:00',evening:true}).totalWorkMinutes,540);
  assert.equal(sum({clock_in:'09:30',clock_out:'20:00',evening:false}).totalWorkMinutes,570,'야간이 아니면 저녁은 안 뺌');
  assert.equal(sum({clock_in:'13:30',clock_out:'18:00',evening:false}).totalWorkMinutes,240,'270에서 30분만');
  assert.equal(sum({clock_in:'14:00',clock_out:'18:30',evening:false}).totalWorkMinutes,270,'오후 반차처럼 점심 뒤에 출근하면 안 뺌');
  assert.equal(sum({clock_in:'09:30',clock_out:'13:00',evening:false}).totalWorkMinutes,210,'오전 반차처럼 점심 전에 퇴근하면 안 뺌');
  assert.equal(sum({clock_in:'09:30',clock_out:'18:30',evening:false,is_holiday:true}).holidayMinutes,480,'휴일 시각 구간도 같은 차감');
});
test('④ 설정 값이 비거나 형식이 틀리거나 끝이 시작보다 이르면 그 휴게는 안 뺌 · 시간대는 설정을 따름',()=>{
  const row={clock_in:'09:30',clock_out:'20:00',evening:true};
  assert.equal(ctx({'att.break.lunch_start':'','att.break.dinner_start':'x'}).aggregateAttendanceForPayslip([row]).totalWorkMinutes,630,'둘 다 안 뺌');
  assert.equal(ctx({'att.break.lunch_end':'12:00'}).aggregateAttendanceForPayslip([row]).totalWorkMinutes,600,'점심 끝이 시작보다 이름 → 점심만 안 뺌, 저녁 30 차감');
  assert.equal(ctx({'att.break.lunch_start':'12:00','att.break.lunch_end':'13:00'}).aggregateAttendanceForPayslip([row]).totalWorkMinutes,540);
  const bare=vm.createContext({});vm.runInContext(payroll+';this.f=aggregateAttendanceForPayslip',bare);
  assert.equal(bare.f([row]).totalWorkMinutes,630,'설정이 없는 환경(SETTINGS 없음)에서는 안 뺌');
});
test('④ 월 요약도 같은 차감: 출퇴근 시각 구간·휴일 시각 구간 · 안내 글이 「휴게시간을 뺐습니다」로 바뀜',()=>{
  const c=ctx(),p=month(c,[fp(),fp({id:2,work_date:'2026-11-05',is_holiday:true,clock_in:'09:30',clock_out:'20:00',evening:true})],[]);
  assert.equal(p.days[0].clockSpanMinutes,480);assert.equal(p.days[1].clockSpanMinutes,540);assert.equal(p.days[1].holidayMinutes,540);
  assert.equal(p.summary.clockSpanMinutes,1020);assert.equal(p.summary.holidayMinutes,540);
  const model=c.attMonthlyModel({month:'2026-11',rows:[fp()],employees:[emp('a')]}),out=c.attMonthlyRowsHtml(model);
  assert.match(out,/점심\(야간조는 저녁 포함\) 휴게시간을 뺐습니다\(허브 설정에서 시간대 변경\)/);assert.doesNotMatch(out,/휴게시간을 차감하지 않았습니다/);
  const x=c.attMonthlyExportModel(model),basis=JSON.stringify(x.sheets[0].rows);assert.match(basis,/휴게시간을 뺀 값/);assert.doesNotMatch(basis,/휴게시간 미차감/);
});
test('④ 급여명세서가 읽는 수기 줄은 대기·실장승인·원장확정이고, 기본 휴게 시간대는 코드·설정 목록·SQL이 같음',()=>{
  const block=html.match(/async function renderPaySlip\(m\)\{[\s\S]*?\r?\n\}\r?\nfunction setPaySlipMonth/)[0];
  assert.match(block,/lunch_overtime_min,clockout_overtime_min,evening_overtime_min/);
  const js=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8'),sql=fs.readFileSync(path.join(root,'db','att_rules2_20261127.sql'),'utf8'),rb=fs.readFileSync(path.join(root,'db','att_rules2_20261127_rollback.sql'),'utf8');
  for(const [k,v] of Object.entries(BREAKS)){
    assert.match(html,new RegExp("'"+k.replace(/\./g,'\\.')+"':'"+v+"'"),k+' hr.html 기본값');
    assert.match(js,new RegExp("key:'"+k.replace(/\./g,'\\.')+"',[^\\n]*def:'"+v+"',kind:'time'"),k+' 허브 설정 목록');
    assert.match(sql,new RegExp("\\('"+k.replace(/\./g,'\\.')+"','"+v+"'"),k+' SQL 기본값');assert.ok(rb.includes("'"+k+"'"),k+' 되돌리기');
  }
  assert.match(sql,/on conflict \(key\) do nothing/);
});

/* ───────────── 3차: 근무표 ───────────── */
const roster=html.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//)[1];
const calendar=html.match(/\/\* ── 캘린더 ── \*\/([\s\S]*?)\/\* ── 연차현황 ── \*\//)[1];
const mondaySrc=html.match(/const dstr=[^\n]*\n/)[0]+html.match(/function addDays\([^\n]*\n/)[0]+html.match(/function mondayStr\(ds\)\{[^\n]*\n/)[0];
const cellSrc=html.slice(html.indexOf('function scheduleHasUnassignedRole('),html.indexOf('async function renderScheduleMonth('));
function sctx(extra={}){
  const c={PROFILES:[],esc,render(){},today:()=>'2026-11-10',...extra};
  vm.createContext(c);vm.runInContext(roster+'\n'+mondaySrc+calendar+'\n'+cellSrc,c);return c;
}
const P=(id,over={})=>({id,name:id,department:'진료실',active:true,included_in_schedule:true,sort_order:1,profile_user_id:'u-'+id,...over});

test('3차-1 월별 요약: 그 달 날짜만 · 근무(야간 포함) · 야간 · 기타 · OFF(자동 포함) · 연차(일) · 반차(회) · 연차가 겹친 날은 근무 대신 연차',()=>{
  const c=sctx(),people=[P('p1',{sort_order:1}),P('p2',{sort_order:2}),P('p3',{sort_order:3,active:false})];
  const rows=[
    {person_id:'p1',week_start:'2026-10-26',day:5,shift:'work'},   // 10-30 — 이웃 달이라 안 셈
    {person_id:'p1',week_start:'2026-10-26',day:0,shift:'work'},   // 11-01 일요일
    {person_id:'p1',week_start:'2026-11-02',day:1,shift:'work'},   // 11-02 — 연차와 겹침 → 연차
    {person_id:'p1',week_start:'2026-11-02',day:2,shift:'evening'},// 11-03 야간
    {person_id:'p1',week_start:'2026-11-02',day:3,shift:'etc'},    // 11-04 기타 + 반차
    {person_id:'p1',week_start:'2026-11-02',day:4,shift:'off'}     // 11-05 명시 OFF
  ];
  const leaves=[{user_id:'u-p1',type:'연차',status:'승인',date_from:'2026-11-02',date_to:'2026-11-02'},{user_id:'u-p1',type:'반차',status:'승인',date_from:'2026-11-04',date_to:'2026-11-04'},{user_id:'u-p1',type:'연차',status:'승인',date_from:'2026-10-29',date_to:'2026-10-29'}];
  const sum=plain(c.scheduleMonthSummary('2026-11',people,rows,[],leaves)),a=sum.find(r=>r.person.id==='p1'),b=sum.find(r=>r.person.id==='p2');
  assert.deepEqual([a.work,a.night,a.etc,a.off,a.autoOff,a.annual,a.half],[2,1,1,4,3,1,1],'근무 11-01·11-03 · 야간 1 · 기타 1 · OFF 명시 1+자동 3(11-06~08) · 연차 1(10월 연차는 제외) · 반차 1');
  assert.deepEqual([b.work,b.off,b.autoOff],[0,8,8],'줄이 하나도 없는 직원도 줄이 있는 주(10-26 주 11-01, 11-02 주 7일)는 자동 OFF');
  assert.equal(sum.some(r=>r.person.id==='p3'),false,'비활성·줄 없는 사람은 요약에서 뺌');
  const none=plain(c.scheduleMonthSummary('2026-12',people,rows,[],leaves));assert.equal(none.find(r=>r.person.id==='p1').off,0,'근무표 줄이 없는 달·주에는 자동 OFF 없음');
  const withWeek=plain(c.scheduleMonthSummary('2026-12',people,[],[{week_start:'2026-12-07',status:'초안'}],[]));assert.equal(withWeek.find(r=>r.person.id==='p1').off,7,'schedule_weeks 줄만 있어도 「만든 주」(12-07 주 7일)');
});
test('3차-1 요약 표 HTML: 머리 7칸 · 요약 인쇄 단추(인쇄 때는 숨김) · 이스케이프',()=>{
  const c=sctx(),out=c.scheduleMonthSummaryHtml('2026-11',[P('p<1>')],[{person_id:'p<1>',week_start:'2026-11-02',day:1,shift:'work'}],[],[]);
  for(const h of ['직원','근무 일수','야간','기타','OFF(자동 포함)','연차(일)','반차(회)'])assert.ok(out.includes('<th>'+h+'</th>'),h);
  assert.match(out,/onclick="printScheduleSummary\(\)">요약 인쇄/);assert.ok(out.includes('p&lt;1&gt;')&&!out.includes('p<1>'));
  assert.match(out,/schedule-summary-actions/);assert.match(html,/@media print\{\.schedule-summary-actions\{display:none!important\}\}/);
  assert.match(html,/function printScheduleSummary\(\)/);assert.match(html,/schedule-summary-printing/);
});
test('3차-2 자동 OFF: 줄이 있는 주만 · 다른 직무에 체크하면 빠짐 · 하루 연차는 제외 · OFF 인원수와 캘린더에도 같은 규칙 · 저장은 안 함',()=>{
  const c=sctx(),people=[P('p1'),P('p2'),P('p3')];
  const rows=[{person_id:'p1',week_start:'2026-11-02',day:1,shift:'work'},{person_id:'p3',week_start:'2026-11-02',day:1,shift:'off'}];
  const cell=(ds,ws,r=rows,leave={})=>c.scheduleRoleCell('OFF',ws,ds,people,r,leave,true);
  let out=cell('2026-11-02','2026-11-02');
  assert.match(out,/<summary>OFF · 2명<\/summary>/,'명시 OFF(p3) + 자동(p2)');
  assert.match(out,/schedule-selected schedule-auto-off"><input type="checkbox" checked disabled [^>]*><span>p2 · 진료·상담 · 자동<\/span>/);
  assert.doesNotMatch(out,/schedule-auto-off"><input[^>]*><span>p1/,'근무 체크된 p1은 자동 OFF가 아님');assert.doesNotMatch(out,/schedule-auto-off"><input[^>]*><span>p3/,'명시 OFF는 자동이 아님');
  assert.match(cell('2026-11-09','2026-11-09'),/<summary>OFF · 0명<\/summary>/,'줄이 없는 주는 자동 OFF 없음');
  assert.doesNotMatch(cell('2026-11-09','2026-11-09'),/schedule-auto-off/);
  out=cell('2026-11-02','2026-11-02',rows.concat([{person_id:'p2',week_start:'2026-11-02',day:1,shift:'work'}]));assert.match(out,/<summary>OFF · 1명<\/summary>/,'다른 직무에 체크하면 자동 OFF에서 빠짐');
  out=cell('2026-11-02','2026-11-02',rows,{'u-p2|p2|2026-11-02':{date:'2026-11-02',type:'연차',label:'연차'}});assert.match(out,/<summary>OFF · 1명<\/summary>/,'하루 연차는 자동 OFF가 아님');
  out=cell('2026-11-02','2026-11-02',rows,{'u-p2|p2|2026-11-02':{date:'2026-11-02',type:'반차',label:'반차'}});assert.match(out,/<summary>OFF · 2명<\/summary>/,'반차는 하루 연차가 아님');
  vm.runInContext("SCHEDULE_WEEK_ROWS=new Set(['2026-11-09'])",c);assert.match(cell('2026-11-09','2026-11-09',[]),/<summary>OFF · 3명<\/summary>/,'schedule_weeks 줄만 있어도 만든 주');
  vm.runInContext('SCHEDULE_WEEK_ROWS=new Set()',c);
  const idx=plain(c.scheduleCalendarIndex(rows,people,[],new Map(),[{user_id:'u-p2',type:'연차',status:'승인',date_from:'2026-11-03',date_to:'2026-11-03'}]));
  assert.deepEqual(idx['2026-11-02'].off.sort(),['p2','p3'],'캘린더 OFF 모음: 명시 + 자동');assert.deepEqual(idx['2026-11-03'].off,['p1','p3'],'하루 연차(p2)는 제외');
  assert.equal(idx['2026-11-09'],undefined,'줄이 없는 주는 날짜 칸도 안 만듦');
  assert.equal(rows.length,2,'표시 규칙만 — 저장 값(줄)은 안 바뀜');
});
test('3차-3 연차·반차 행은 「이름 보기」가 꺼져 있어도 이름을 보이고, 근무 체크된 사람에게 하루 연차가 겹치면 취소선·「연차」 표시',()=>{
  const c=sctx({scheduleNamesVisible:()=>false}),people=[P('p1'),P('p2')];
  const leave={'u-p1|p1|2026-11-02':{date:'2026-11-02',type:'연차',label:'연차'}},rows=[{person_id:'p1',week_start:'2026-11-02',day:1,shift:'work'},{person_id:'p2',week_start:'2026-11-02',day:1,shift:'work'}];
  assert.match(c.scheduleRoleCell('연차·반차','2026-11-02','2026-11-02',people,rows,leave,true),/p1 · 연차/);
  const out=c.scheduleRoleCell('진료·상담','2026-11-02','2026-11-02',people,rows,leave,true);
  assert.match(out,/<summary>진료·상담 · 1명 · 연차 1<\/summary>/);assert.match(out,/schedule-leave-overlap"><input[^>]*checked disabled [^>]*><span>p1 · 진료·상담 · 연차<\/span>/);
  assert.doesNotMatch(out,/schedule-leave-overlap"><input[^>]*><span>p2/);
  assert.match(html,/\.schedule-check\.schedule-leave-overlap>span,\.schedule-leave-overlap-name\{text-decoration:line-through\}/);
  const vis=sctx();vm.runInContext('SCHEDULE_NAMES_VISIBLE=true',vis);const shown=vis.scheduleRoleCell('진료·상담','2026-11-02','2026-11-02',people,rows,leave,true);
  assert.match(shown,/<span class="schedule-leave-overlap-name">p1<\/span> · 연차/);
});
test('3차-4 월간 보기: 주 블록마다 「이 주 공표」 단추(실장·원장만) · 맨 아래 직원별 요약 · 3차-5 엑셀 모달 문구',async()=>{
  const people=[{...P('p1'),profile_user_id:'u1'}],rows=[{person_id:'p1',user_id:'u1',week_start:'2026-11-02',day:1,shift:'work'}],weekRows=[{week_start:'2026-11-09',status:'공표'}];
  const source=html.match(/async function renderScheduleMonth\([\s\S]*?\r?\n\}\r?\nasync function applyScheduleShift/)[0].replace(/\nasync function applyScheduleShift$/,'');
  async function run(role){
    const m={innerHTML:''},c={SCHED_MONTH:'2026-11',SCHEDULE_PEOPLE:people,EMPLOYEE_JOB_GROUPS:null,PROFILES:[],SCHEDULE_STATUS_OVERRIDES:{},SCHEDULE_WRITE_SEQ:{},SCHEDULE_WRITE_TAIL:{},SCHEDULE_CELL_VALUES:{},SCHEDULE_ROLE_WRITE_SEQ:{},SCHEDULE_ROLE_WRITE_TAIL:{},
      scheduleNamesVisible:()=>false,scheduleNamesToggleButton:()=>'',SHIFTS:{work:{l:'근무'},off:{l:'off'},evening:{l:'야간'},etc:{l:'기타'}},today:()=>'2026-11-10',md:v=>v.slice(5),esc,
      isLead:()=>role!=='staff'&&role!=='manager',isMgr:()=>role!=='staff',scheduleRosterAdminCard:()=>'',setStatus(){},render(){},leaveDisplayText:(t,n)=>n?t+' '+n:t,
      sb:{from(table){const result=table==='schedules'?{data:rows,error:null}:table==='schedule_weeks'?{data:weekRows,error:null}:{data:[],error:null};const b={select(){return b;},in(){return b;},eq(){return b;},lte(){return b;},gte(){return b;},then(r){return Promise.resolve(r(result));}};return b;}}};
    vm.createContext(c);
    vm.runInContext(roster+'\n'+mondaySrc+html.match(/function scheduleMonthWeeks[\s\S]*?\n\}/)[0]+'\n'+html.match(/function scheduleShiftOptions[\s\S]*?\n\}/)[0]+'\n'+html.match(/function syncScheduleCellValues[\s\S]*?\n\}/)[0]+'\n'+cellSrc+'\n'+source+';this.go=renderScheduleMonth;',c);
    await c.go(m);return m.innerHTML;
  }
  const owner=await run('owner'),staff=await run('staff');
  assert.equal((owner.match(/onclick="publishSched\('\d{4}-\d\d-\d\d'\)">이 주 공표<\/button>/g)||[]).length,(owner.match(/<section class="schedule-week-block">/g)||[]).length,'주 블록마다 하나');
  assert.ok(owner.includes("publishSched('2026-11-02')"));assert.doesNotMatch(staff,/이 주 공표|publishSched/);
  for(const out of [owner,staff]){assert.match(out,/<section class="schedule-month-summary">/);assert.ok(out.indexOf('schedule-month-summary')>out.lastIndexOf('<section class="schedule-week-block">'),'주 블록들 뒤(맨 아래)에 요약');}
  assert.match(html,/<b data-hubk="att\.xl\.hint_b">근무표\(초안 포함\)<\/b>/);assert.doesNotMatch(html,/<b data-hubk="att\.xl\.hint_b">공표된 근무표/);
  assert.match(fs.readFileSync(path.join(root,'hub-texts.js'),'utf8'),/add\('att\.xl\.hint_b'[^\n]*'근무표\(초안 포함\)'\)/);
});
test('3차: 새 코드는 기존 인쇄 표식(schedule-print) 밖에 있고 월 요약은 월간 렌더에서 불림 · 연차 계산(computeLeaveDays)은 그대로',()=>{
  const printBlock=html.match(/\/\* schedule-print:test-start \*\/[\s\S]*?\/\* schedule-print:test-end \*\//)[0];
  assert.ok(!/scheduleMonthSummary|printScheduleSummary|scheduleAutoOff/.test(printBlock));
  assert.match(html,/html\+=scheduleMonthSummaryHtml\(SCHED_MONTH,SCHEDULE_PEOPLE,rows\|\|\[\],weekRows\|\|\[\],lv\|\|\[\]\)/);
  const cl=html.match(/async function computeLeaveDays\([\s\S]*?\n\}/)[0];assert.ok(!/auto|자동/.test(cl));
});
