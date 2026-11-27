// 2026-11-27 월말 근태 — 매니저 의견 1차: 근무조별 지각 · 반차·연차 자동 반영 · 관리자 표시 · 연차(일)/반차(회) · 열람 권한 · 월 마감 결재 · 수정 기록
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8');
const summary=html.match(/\/\* attendance-monthly-summary:start \*\/[\s\S]*?\/\* attendance-monthly-summary:end \*\//)?.[0]||'';
const payroll=html.match(/\/\* payroll-payslip:test-start \*\/[\s\S]*?\/\* payroll-payslip:test-end \*\//)[0];
const apply=html.slice(html.indexOf('function applyAttendanceResolutions('),html.indexOf('let MANUAL_DETAIL_OPEN'));
const bounds=html.slice(html.indexOf('function attendanceMonthBounds('),html.indexOf('\n',html.indexOf('function attendanceMonthBounds(')));
const pages=html.slice(html.indexOf('async function fetchAttendancePages('),html.indexOf('\n',html.indexOf('async function fetchAttendancePages(')));
const toMinLine=html.slice(html.indexOf('const toMin=t=>'),html.indexOf('\n',html.indexOf('const toMin=t=>')));
const jongeop=html.slice(html.indexOf('function jongeop('),html.indexOf('\n}\n',html.indexOf('function jongeop('))+3);
const calcRow=html.slice(html.indexOf('function calcRow('),html.indexOf('\n}\n',html.indexOf('function calcRow('))+3);
const plain=x=>JSON.parse(JSON.stringify(x));
const fill=(d,v)=>v?String(d).replace(/\{([a-z_]+)\}/g,(m,n)=>n in v?v[n]:m):d;
function ctx(extra={}){
  const logs=[],c={ME:{id:'m1',name:'매니저',role:'manager'},PROFILES:[],Intl,Date,Map,Set,Number,String,JSON,Math,Promise,
    SETTINGS:{late_cut:'09:40',ot_unit_min:'10','att.shift_group.B.late_cut':'10:00','att.shift_group.C.late_cut':'09:30',jongeop_weekday_evening:'20:00',jongeop_weekday_day:'18:30',jongeop_sat:'17:00',jongeop_sun:'14:00'},
    hubT:(k,d,v)=>fill(d,v),hubFmtDate:v=>String(v).slice(0,10),hubFmtDateTime:v=>String(v),
    esc:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
    nameOf:uid=>uid==='a'?'직원 A':uid,setStatus:s=>logs.push('status:'+s),alert:m=>logs.push('alert:'+m),confirm:m=>{logs.push('confirm:'+m);return c.__confirm!==false;},
    hide(){},show(){},...extra};
  c.logs=logs;vm.createContext(c);vm.runInContext(toMinLine+'\n'+jongeop+'\n'+calcRow+'\n'+apply+bounds+pages+payroll+summary,c);return c;
}
const person=(id,over={})=>({user_id:id,name:id,role:'staff',dept:'진료실',job_group:'clinical_consult',...over});
// 간이 DB: eq·gte·lt·lte·is 필터를 실제로 적용하고, upsert·rpc 호출을 기록
function fakeDb(tables={},{rpc={},upsertError=null,monthRow=null}={}){
  const upserts=[],rpcs=[],calls=[];
  return {upserts,rpcs,calls,
    async rpc(name,args){rpcs.push([name,args]);const r=rpc[name];return typeof r==='function'?r(args):(r||{data:[],error:null});},
    from(table){
      calls.push(table);const f=[],q={select(){return q;},eq(k,v){f.push(r=>r[k]===v);return q;},gte(k,v){f.push(r=>String(r[k])>=v);return q;},lt(k,v){f.push(r=>String(r[k])<v);return q;},lte(k,v){f.push(r=>String(r[k])<=v);return q;},is(k,v){f.push(r=>(r[k]??null)===v);return q;},order(){return q;},
        async limit(n){return {data:(tables[table]||[]).filter(r=>f.every(fn=>fn(r))).sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))).slice(0,n),error:null};},
        async range(a,b){return {data:(tables[table]||[]).filter(r=>f.every(fn=>fn(r))).slice(a,b+1),error:null};},
        async maybeSingle(){if(table==='att_months')return {data:monthRow,error:null};return {data:(tables[table]||[]).filter(r=>f.every(fn=>fn(r)))[0]||null,error:null};},
        async upsert(rows,opts){upserts.push({table,rows:plain(rows),opts});return {error:upsertError};}};
      return q;}};
}
const T=(h,m)=>h*60+m;

test('같은 09:55 출근이 A조 15분 · B조 0분 · C조 25분 — 지각 기준은 직원 조에서 나옴',()=>{
  const c=ctx({PROFILES:[person('a'),person('b',{dept:'기공팀',job_group:'lab'}),person('c',{dept:'데스크',job_group:'desk',att_shift_group:'C'})]});
  const row=u=>({user_id:u,ds:'2026-11-03',ci:T(9,55),co:T(18,30),evening:false});
  assert.equal(c.calcRow(row('a')).late,15);assert.equal(c.calcRow(row('b')).late,0);assert.equal(c.calcRow(row('c')).late,25);
  assert.equal(c.calcRow({user_id:null,ds:'2026-11-03',ci:T(9,55),co:null,evening:false}).late,15,'아직 매핑 안 된 줄은 A조 기준');
  assert.equal(c.calcRow({user_id:'a',ds:'2026-11-03',ci:null,co:null}).late,0);
});
test('조가 비었을 때 자동 배정: 시간제 C · 실장 B · 기공(직무·부서) B · 소독·행정 B · 그 밖 A, 직접 정한 조가 우선',()=>{
  const c=ctx(),auto=(p,h)=>c.attShiftGroupOf(p,h?new Set(h):new Set());
  assert.equal(auto(person('t'),['t']),'C');assert.equal(auto(person('t',{role:'chief'}),['t']),'C','시간제가 실장보다 먼저');
  assert.equal(auto(person('x',{role:'chief',dept:'',job_group:null})),'B');
  assert.equal(auto(person('x',{dept:'기공실',job_group:null})),'B');assert.equal(auto(person('x',{dept:'기공팀',job_group:null})),'B');assert.equal(auto(person('x',{dept:'',job_group:'lab'})),'B');
  assert.equal(auto(person('x',{dept:'',job_group:'sterilization_admin'})),'B');
  assert.equal(auto(person('x',{job_group:'clinical_consult'})),'A');assert.equal(auto(person('x',{dept:'데스크',job_group:'desk'})),'A');assert.equal(auto(person('x',{dept:'',job_group:null})),'A');
  assert.equal(auto(person('x',{job_group:'lab',att_shift_group:'A'})),'A','직접 정한 조가 우선');
  assert.equal(auto(person('x',{job_group:'lab',att_shift_group:'Z'})),'B','잘못된 값은 무시하고 자동');
});
test('지각 기준 시각은 허브 설정을 읽고, 값이 틀리면 기본값 · A조는 옛 late_cut을 이어받음',()=>{
  const c=ctx({PROFILES:[person('a'),person('b',{job_group:'lab',dept:'기공팀'})]});
  const at=u=>c.calcRow({user_id:u,ds:'2026-11-03',ci:T(10,15),co:null}).late;
  assert.equal(at('a'),35);assert.equal(at('b'),15);
  c.SETTINGS['att.shift_group.B.late_cut']='10:10';assert.equal(at('b'),5);
  c.SETTINGS['att.shift_group.B.late_cut']='abc';assert.equal(at('b'),15,'모양이 틀리면 B 기본 10:00');
  c.SETTINGS.late_cut='09:50';assert.equal(at('a'),25,'A조 값이 없으면 late_cut');
  c.SETTINGS['att.shift_group.A.late_cut']='10:00';assert.equal(at('a'),15,'A조 값이 있으면 그 값');
  assert.equal(c.attGroupLateCut('C'),'09:30');
});
test('연장·조퇴 계산은 그대로(종업 시각 기준) — 연장 10분 단위 버림, 일찍 가면 조퇴',()=>{
  const c=ctx({PROFILES:[person('a')]}),r=(co,evening)=>c.calcRow({user_id:'a',ds:'2026-11-03',ci:T(9,0),co,evening});
  assert.deepEqual(plain(r(T(18,39))),{late:0,ot:0,early:0});assert.deepEqual(plain(r(T(18,40))),{late:0,ot:10,early:0});assert.deepEqual(plain(r(T(19,49))),{late:0,ot:70,early:0});
  assert.deepEqual(plain(r(T(17,50))),{late:0,ot:0,early:40});assert.equal(r(T(19,30),true).early,30,'야간조는 종업 20:00');
});
const dbForRules=({leaves=[],marks=[],hourly=[],holidays=[]}={})=>fakeDb({leave_requests:leaves,attendance_day_marks:marks,holidays},{rpc:{att_hourly_user_ids:{data:hourly,error:null}}});
const L=(over)=>({user_id:'a',status:'승인',type:'연차',type_note:null,date_from:'2026-11-03',date_to:'2026-11-03',days:1,...over});
const M=(mark,date,over)=>({id:Math.floor(Math.random()*1e6),user_id:'a',work_date:date,mark,removed_at:null,...over});
test('반차: 「10:00~13:00」→ 지각 0(조퇴는 그대로) · 「13:00~18:00」→ 조퇴 0 · 시간대 비면 둘 다 0 · 연차 날 둘 다 0',async()=>{
  const sb=dbForRules({leaves:[L({date_from:'2026-11-03',date_to:'2026-11-03'}),L({type:'반차',type_note:'10:00~13:00',date_from:'2026-11-04',date_to:'2026-11-04',days:0.5}),L({type:'반차',type_note:'13:00~18:00',date_from:'2026-11-05',date_to:'2026-11-05',days:0.5}),L({type:'반차',type_note:'14:00~18:00',date_from:'2026-11-09',date_to:'2026-11-09',days:0.5}),L({type:'반차',type_note:'',date_from:'2026-11-06',date_to:'2026-11-06',days:0.5}),L({type:'반차',type_note:null,date_from:'2026-11-10',date_to:'2026-11-10',days:0.5}),L({date_from:'2026-11-11',date_to:'2026-11-11',status:'대기'}),L({user_id:'b',date_from:'2026-11-12',date_to:'2026-11-12'})]});
  const c=ctx({sb,PROFILES:[person('a'),person('b')]});await c.loadAttRuleContext('2026-11-01','2026-11-30');
  const day=(ds,u='a')=>c.calcRow({user_id:u,ds,ci:T(10,30),co:T(15,0),evening:false});
  assert.deepEqual(plain(day('2026-11-03')),{late:0,ot:0,early:0},'연차 날');
  assert.deepEqual(plain(day('2026-11-04')),{late:0,ot:0,early:210},'오전 반차(10:00~13:00): 지각 0, 조퇴는 그대로');
  assert.deepEqual(plain(day('2026-11-05')),{late:50,ot:0,early:0},'오후 반차(13:00~18:00): 조퇴 0, 지각은 그대로');
  assert.equal(day('2026-11-09').early,0,'14:00~18:00 도 오후 반차');
  assert.deepEqual(plain(day('2026-11-06')),{late:0,ot:0,early:0},'시간대가 비면 둘 다 0');assert.deepEqual(plain(day('2026-11-10')),{late:0,ot:0,early:0},'type_note 없음도 둘 다 0');
  assert.deepEqual(plain(day('2026-11-11')),{late:50,ot:0,early:210},'대기 중 휴가는 적용 안 함');
  assert.deepEqual(plain(day('2026-11-12')),{late:50,ot:0,early:210},'다른 직원 휴가는 적용 안 함');assert.deepEqual(plain(day('2026-11-12','b')),{late:0,ot:0,early:0});
});
test('연차 며칠에 걸친 신청은 날마다 펼쳐 적용(달 경계 넘어도)',async()=>{
  const sb=dbForRules({leaves:[L({date_from:'2026-11-30',date_to:'2026-12-02',days:3})]});const c=ctx({sb,PROFILES:[person('a')]});await c.loadAttRuleContext('2026-12-01','2026-12-31');
  for(const ds of ['2026-12-01','2026-12-02'])assert.equal(c.calcRow({user_id:'a',ds,ci:T(10,30),co:T(15,0)}).late,0,ds);
  assert.equal(c.calcRow({user_id:'a',ds:'2026-12-03',ci:T(10,30),co:T(15,0)}).late,50);
});
test('관리자 표시 6종이 각각 맞게 적용되고, 지운 표시는 적용 안 됨',async()=>{
  const cases=[['annual',0,0],['official',0,0],['am_half',0,210],['late_ok',0,210],['pm_half',50,0],['early_ok',50,0]];
  for(const [mark,late,early] of cases){
    const c=ctx({sb:dbForRules({marks:[M(mark,'2026-11-03')]}),PROFILES:[person('a')]});await c.loadAttRuleContext('2026-11-01','2026-11-30');
    assert.deepEqual([c.calcRow({user_id:'a',ds:'2026-11-03',ci:T(10,30),co:T(15,0)}).late,c.calcRow({user_id:'a',ds:'2026-11-03',ci:T(10,30),co:T(15,0)}).early],[late,early],mark);
    assert.deepEqual([c.calcRow({user_id:'a',ds:'2026-11-04',ci:T(10,30),co:T(15,0)}).late,c.calcRow({user_id:'a',ds:'2026-11-04',ci:T(10,30),co:T(15,0)}).early],[50,210],mark+' 다른 날은 그대로');
  }
  const gone=ctx({sb:dbForRules({marks:[M('annual','2026-11-03',{removed_at:'2026-11-05T00:00:00Z'})]}),PROFILES:[person('a')]});await gone.loadAttRuleContext('2026-11-01','2026-11-30');
  assert.deepEqual([gone.calcRow({user_id:'a',ds:'2026-11-03',ci:T(10,30),co:T(15,0)}).late,gone.calcRow({user_id:'a',ds:'2026-11-03',ci:T(10,30),co:T(15,0)}).early],[50,210],'지운 표시');
  const both=ctx({sb:dbForRules({marks:[M('late_ok','2026-11-03'),M('early_ok','2026-11-03')]}),PROFILES:[person('a')]});await both.loadAttRuleContext('2026-11-01','2026-11-30');
  assert.deepEqual(plain(both.calcRow({user_id:'a',ds:'2026-11-03',ci:T(10,30),co:T(15,0)})),{late:0,ot:0,early:0},'지각 인정 + 조퇴 인정 같이 켜면 둘 다 0');
});
test('시간제 직원은 시간제 명단(RPC)으로 C조, 읽기에 실패하면 이유를 남기고 기본 기준으로 계속',async()=>{
  const sb=dbForRules({hourly:['h1']});const c=ctx({sb,PROFILES:[person('h1',{job_group:'desk'})]});await c.loadAttRuleContext('2026-11-01','2026-11-30');
  assert.equal(c.calcRow({user_id:'h1',ds:'2026-11-03',ci:T(9,55),co:null}).late,25);assert.deepEqual(plain(sb.rpcs[0]),['att_hourly_user_ids',{p_date:'2026-11-30'}]);
  const bad=ctx({sb:fakeDb({},{rpc:{att_hourly_user_ids:{data:null,error:{message:'권한 없음'}}}}),PROFILES:[person('h1',{job_group:'desk'})]});const r=await bad.loadAttRuleContext('2026-11-01','2026-11-30');
  assert.match(r.error,/권한 없음/);assert.equal(bad.calcRow({user_id:'h1',ds:'2026-11-03',ci:T(9,55),co:null}).late,15,'못 읽으면 직무 기준 자동 조');
});
test('연차(일)·반차(회): 월 경계(11/30~12/2 연차 3일 → 11월 1일·12월 2일), 승인 휴가 + 관리자 표시, 같은 날 겹치면 한 번',()=>{
  const c=ctx(),count=(args)=>plain(Object.fromEntries(c.attLeaveCounts(args)));
  const lv=[L({date_from:'2026-11-30',date_to:'2026-12-02',days:3})];
  assert.deepEqual(count({leaves:lv,month:'2026-11'}),{a:{annual:1,half:0}});assert.deepEqual(count({leaves:lv,month:'2026-12'}),{a:{annual:2,half:0}});
  assert.deepEqual(count({leaves:lv,month:'2026-12',holidays:new Set(['2026-12-01'])}),{a:{annual:1,half:0}},'달 경계에 걸친 신청은 공휴일을 뺀 날수');
  assert.deepEqual(count({leaves:[L({date_from:'2026-11-09',date_to:'2026-11-11',days:2})],month:'2026-11'}),{a:{annual:2,half:0}},'한 달 안의 신청은 신청 일수(공휴일·휴무 반영된 값)');
  assert.deepEqual(count({leaves:[L({status:'대기'}),L({type:'조퇴',type_note:'13:00~15:00'})],month:'2026-11'}),{},'승인된 연차·반차만');
  const half=[L({type:'반차',type_note:'10:00~13:00',date_from:'2026-11-04',date_to:'2026-11-04',days:0.5}),L({type:'반차',type_note:'13:00~18:00',date_from:'2026-11-05',date_to:'2026-11-05',days:0.5})];
  assert.deepEqual(count({leaves:half,month:'2026-11'}),{a:{annual:0,half:2}});
  // 관리자 표시: 새 날은 더하고, 휴가와 겹치는 날은 한 번만
  assert.deepEqual(count({leaves:[...lv,...half],marks:[M('annual','2026-11-30'),M('annual','2026-11-10'),M('am_half','2026-11-04'),M('pm_half','2026-11-12'),M('am_half','2026-11-20'),M('pm_half','2026-11-20'),M('official','2026-11-13'),M('late_ok','2026-11-14'),M('annual','2026-12-05')],month:'2026-11'}),{a:{annual:2,half:4}});
  assert.deepEqual(count({marks:[M('annual','2026-11-10',{removed_at:'2026-11-11T00:00:00Z'})],month:'2026-11'}),{},'지운 표시는 안 셈');
});
const att=(user,date,over)=>({user_id:user,work_date:date,source:'fp',clock_in:'09:55',clock_out:'18:30',late_min:0,early_min:0,overtime_min:0,evening:false,is_holiday:false,...over});
test('월 요약 모델: 조별 지각이 반영되고, 연차·반차 날은 지각·조퇴 0, 저장값과 다른 날 수를 알려 줌',()=>{
  const c=ctx(),employees=[person('a'),person('b',{job_group:'lab',dept:'기공팀'}),person('c',{att_shift_group:'C'})];
  const rows=[att('a','2026-11-03',{late_min:15}),att('b','2026-11-03',{late_min:15}),att('c','2026-11-03',{late_min:15}),att('a','2026-11-04',{late_min:15,clock_in:'10:30',clock_out:'15:00',early_min:210}),att('a','2026-11-05',{source:'manual',clock_in:'10:30',clock_out:'15:00',late_min:50,early_min:210})];
  const rules={hourlyIds:new Set(),leaves:[L({type:'반차',type_note:'10:00~13:00',date_from:'2026-11-04',date_to:'2026-11-04',days:0.5}),L({date_from:'2026-11-05',date_to:'2026-11-05'})],marks:[],holidays:new Set()};
  const m=c.attMonthlyModel({month:'2026-11',rows,manualRows:[],resolutions:[],employees,rules}),by=u=>m.employees.find(e=>e.userId===u);
  assert.equal(by('a').group,'A');assert.equal(by('b').group,'B');assert.equal(by('c').group,'C');assert.equal(by('a').lateCut,'09:40');assert.equal(by('b').lateCut,'10:00');
  assert.deepEqual([by('a').days[0].lateMinutes,by('b').days[0].lateMinutes,by('c').days[0].lateMinutes],[15,0,25],'같은 09:55: A 15 · B 0 · C 25');
  assert.equal(by('a').days[1].lateMinutes,0,'오전 반차 날 지각 0');assert.equal(by('a').days[1].earlyMinutes,210,'오전 반차 날 조퇴는 그대로');
  assert.equal(by('a').days[2].lateMinutes,0,'연차 날은 수기 줄도 지각 0');assert.equal(by('a').days[2].earlyMinutes,0);
  assert.match(by('a').days[1].basis,/오전 반차/);assert.match(by('a').days[2].basis,/연차/);
  assert.equal(by('a').summary.annualDays,1);assert.equal(by('a').summary.halfDays,1);
  assert.equal(by('b').summary.staleDays,1,'B조는 저장값(15)과 지금 기준(0)이 달라 다시 계산 필요');assert.equal(by('c').summary.staleDays,1);assert.equal(by('a').summary.staleDays,1,'오전 반차 날은 저장 지각 15 → 0');
  assert.equal(by('b').summary.lateCount,0);
  const x=c.attMonthlyExportModel(m);assert.ok(x.sheets[1].rows[0].includes('연차(일)')&&x.sheets[1].rows[0].includes('반차(회)'));
  const ra=x.sheets[1].rows.find(r=>r[0]==='a');assert.equal(ra[ra.length-2],1);assert.equal(ra[ra.length-1],1);
  assert.ok(x.sheets[2].rows.some(r=>r[0]==='a'&&String(r[10]).includes('오전 반차')),'일별근거 「기준」에 휴가 이름');assert.ok(x.sheets[2].rows.some(r=>String(r[10]).startsWith('승인 휴가: 연차')));
});
test('규칙 자료가 없는 월 요약은 예전 그대로(저장된 지각 분을 그대로 합산)',()=>{
  const c=ctx(),m=c.attMonthlyModel({month:'2026-11',rows:[att('a','2026-11-03',{late_min:15})],employees:[person('a')]});
  assert.equal(m.employees[0].summary.lateMinutes,15);assert.equal('annualDays' in m.employees[0].summary,false);assert.equal(m.employees[0].group,undefined);
});
test('월 요약 조회 로더는 승인 휴가·관리자 표시·시간제 명단을 같이 읽고 조 이름·휴가 목록을 모델에 넣음',async()=>{
  const sb=fakeDb({attendance:[att('h1','2026-11-03',{late_min:25})],leave_requests:[L({user_id:'h1',date_from:'2026-11-10',date_to:'2026-11-10'})],attendance_day_marks:[M('late_ok','2026-11-03',{user_id:'h1',id:7}),M('annual','2026-11-04',{user_id:'h1',id:8,removed_at:'2026-11-05T00:00:00Z'})],holidays:[]},{rpc:{att_hourly_user_ids:{data:['h1'],error:null}}});
  const c=ctx({sb,PROFILES:[person('h1',{job_group:'desk'})]}),m=await c.fetchAttMonthlyData('2026-11'),p=m.employees[0];
  assert.equal(p.group,'C');assert.equal(p.days[0].lateMinutes,0,'지각 인정 표시');assert.deepEqual(plain(p.marks),[{id:7,date:'2026-11-03',mark:'late_ok',note:''}]);assert.equal(p.leaves[0].from,'2026-11-10');assert.equal(p.summary.annualDays,1);
  assert.ok(sb.calls.includes('leave_requests')&&sb.calls.includes('attendance_day_marks'));
});
test('월 요약은 매니저·실장·원장에게 보이고 직원에게는 안 보임(카드·조회·인쇄·엑셀)',async()=>{
  for(const role of ['manager','chief','owner']){const c=ctx({ME:{id:'x',role},sb:fakeDb()});assert.ok(c.attMonthlyCardHtml().includes('attMonthlyMonth'),role);assert.equal((await c.fetchAttMonthlyData('2026-11')).month,'2026-11');assert.ok(c.attCloseCardHtml().includes('attCloseMonth'),role+' 월 마감 카드');}
  const s=ctx({ME:{id:'x',role:'staff'},sb:fakeDb()});assert.equal(s.attMonthlyCardHtml(),'');assert.equal(s.attCloseCardHtml(),'');await assert.rejects(()=>s.fetchAttMonthlyData('2026-11'),/매니저·실장·원장/);assert.equal(s.attEditLogCardHtml(),'');
  const owner=ctx({ME:{id:'o',role:'owner'}});assert.ok(owner.attEditLogCardHtml().includes('attEditLogBox'),'수정 기록 카드는 원장만');
  for(const role of ['manager','chief'])assert.equal(ctx({ME:{id:'x',role}}).attEditLogCardHtml(),'',role+'에게 수정 기록 카드는 안 보임');
  // 코드에 옛 원장 전용 검사가 남아 있지 않음(수정 기록 두 곳만 원장)
  const owners=summary.match(/ME\.role!==['"]owner['"]/g)||[];assert.equal(owners.length,2,'원장 전용 검사는 수정 기록 카드·조회 2곳뿐');
});
test('개인 확인용 자료: 편집 모드에서만 표시 선택칸(인쇄 때 숨김 표지), 확정된 달에는 편집칸 없음',()=>{
  const c=ctx(),employees=[person('a')],rules={hourlyIds:new Set(),leaves:[L({type:'반차',type_note:'13:00~18:00',date_from:'2026-11-05',date_to:'2026-11-05',days:0.5})],marks:[{id:5,user_id:'a',work_date:'2026-11-03',mark:'early_ok',note:null}]};
  const m=c.attMonthlyModel({month:'2026-11',rows:[att('a','2026-11-03')],employees,rules,status:'집계중'});
  const view=c.attMonthlyPersonHtml(m,0),edit=c.attMonthlyPersonHtml(m,0,{edit:true});
  assert.ok(!view.includes('att-mark-ctl')&&!view.includes('addAttMark'),'읽기 전용 출력에는 편집칸 없음');
  assert.ok(edit.includes('addAttMark(0,&#39;2026-11-03&#39;)')||edit.includes("addAttMark(0,'2026-11-03')"));assert.ok(edit.includes('removeAttMark(5,0)'));assert.ok(edit.includes('att-mark-ctl'));
  assert.ok(view.includes('조퇴 인정')&&view.includes('13:00~18:00'),'표시·휴가 내용은 출력에도 보임');assert.ok(view.includes('연차 0일 · 반차 1회'));
  m.status='확정';assert.ok(!c.attMonthlyPersonHtml(m,0,{edit:true}).includes('addAttMark'),'확정된 달에는 편집칸 없음');
  assert.match(html,/@media print\{\.att-mark-ctl\{display:none!important\}\}/);
});
async function uiCtx(sbArg,extra={}){
  const nodes={'#attMonthlyMonth':{value:'2026-11'},'#attMonthlyResult':{innerHTML:''},'#attMonthlyExport':{disabled:true},'#attMonthlyPersonBody':{innerHTML:''},'#attMonthlyMask':{visible:false}};
  const c=ctx({sb:sbArg,$:s=>nodes[s],hide:id=>{nodes['#'+id].visible=false;},show:id=>{nodes['#'+id].visible=true;},...extra});return {c,nodes};
}
test('근무조 바꾸기: 서버 함수(att_set_shift_group)로만 저장하고 직원 목록과 요약을 새로 읽음 · 실패하면 알림',async()=>{
  const sb=fakeDb({attendance:[att('a','2026-11-03')]},{rpc:{att_hourly_user_ids:{data:[],error:null}}}),{c,nodes}=await uiCtx(sb,{PROFILES:[person('a')]});
  await c.loadAttMonthly();assert.ok(nodes['#attMonthlyResult'].innerHTML.includes('changeAttShiftGroup'));assert.ok(nodes['#attMonthlyResult'].innerHTML.includes('연차(일)'));
  assert.equal(await c.changeAttShiftGroup('a','C'),true);assert.deepEqual(plain(sb.rpcs.find(r=>r[0]==='att_set_shift_group')),['att_set_shift_group',{p_user:'a',p_group:'C'}]);assert.equal(c.PROFILES[0].att_shift_group,'C');
  assert.ok(nodes['#attMonthlyResult'].innerHTML.includes('C조(시간제)'));assert.equal((await c.fetchAttMonthlyData('2026-11')).employees[0].days[0].lateMinutes,25);
  assert.equal(await c.changeAttShiftGroup('a',''),true);assert.equal(c.PROFILES[0].att_shift_group,null,'빈 값 = 자동');
  const bad=await uiCtx(fakeDb({},{rpc:{att_set_shift_group:{data:null,error:{message:'권한 없음'}},att_hourly_user_ids:{data:[],error:null}}}),{PROFILES:[person('a')]});
  assert.equal(await bad.c.changeAttShiftGroup('a','B'),false);assert.ok(bad.c.logs.some(l=>l.startsWith('alert:')&&l.includes('권한 없음')));assert.equal(bad.c.PROFILES[0].att_shift_group,undefined);
  const staff=await uiCtx(fakeDb(),{ME:{id:'s',role:'staff'}});assert.equal(await staff.c.changeAttShiftGroup('a','B'),false);
});
test('관리자 표시 넣기·지우기: 서버 함수(att_mark_add·att_mark_remove)로만 하고 직원 확인용 자료를 다시 열어 줌',async()=>{
  const sb=fakeDb({attendance:[att('a','2026-11-03')]},{rpc:{att_hourly_user_ids:{data:[],error:null}}}),{c,nodes}=await uiCtx(sb,{PROFILES:[person('a')]});
  await c.loadAttMonthly();
  nodes['#attMarkSel_0_2026-11-03']={value:''};assert.equal(await c.addAttMark(0,'2026-11-03'),false,'표시를 안 골랐으면 아무것도 안 함');assert.equal(sb.rpcs.filter(r=>r[0]==='att_mark_add').length,0);
  nodes['#attMarkSel_0_2026-11-03']={value:'late_ok'};assert.equal(await c.addAttMark(0,'2026-11-03'),true);assert.deepEqual(plain(sb.rpcs.find(r=>r[0]==='att_mark_add')),['att_mark_add',{p_user:'a',p_date:'2026-11-03',p_mark:'late_ok',p_note:null}]);
  nodes['#attMarkDate_0']={value:'2026-11-20'};nodes['#attMarkDateSel_0']={value:'annual'};assert.equal(await c.addAttMark(0),true);assert.equal(sb.rpcs.filter(r=>r[0]==='att_mark_add').at(-1)[1].p_date,'2026-11-20','아래 날짜칸으로도 추가');
  assert.equal(await c.removeAttMark(9,0),true);assert.deepEqual(plain(sb.rpcs.find(r=>r[0]==='att_mark_remove')),['att_mark_remove',{p_id:9}]);assert.equal(nodes['#attMonthlyMask'].visible,true,'표시를 바꾼 뒤 확인용 자료를 다시 열어 줌');
  const bad=await uiCtx(fakeDb({attendance:[att('a','2026-11-03')]},{rpc:{att_mark_add:{data:null,error:{message:'month is final'}},att_hourly_user_ids:{data:[],error:null}}}),{PROFILES:[person('a')]});
  await bad.c.loadAttMonthly();bad.nodes['#attMarkSel_0_2026-11-03']={value:'annual'};assert.equal(await bad.c.addAttMark(0,'2026-11-03'),false);assert.ok(bad.c.logs.some(l=>l.includes('month is final')));
});
const recalcTables=(over={})=>({attendance:[
  att('a','2026-11-03',{late_min:15}),                                  // A조 15분 그대로 → 안 바뀜
  att('b','2026-11-03',{late_min:15}),                                  // B조: 15 → 0
  att('c','2026-11-03',{late_min:15}),                                  // C조: 15 → 25
  att('a','2026-11-04',{late_min:15,clock_in:'09:55',clock_out:'19:00',overtime_min:0}), // 연차 날: 지각 15 → 0, 연장 0 → 30
  att('b','2026-11-05',{source:'manual',late_min:50,clock_in:'11:00'}), // 수기 줄은 안 건드림
  att('a','2026-11-06',{clock_in:'09:00',clock_out:'09:00',late_min:0,early_min:0})],
  leave_requests:[L({date_from:'2026-11-04',date_to:'2026-11-04'})],attendance_day_marks:[],holidays:[],...over});
const recalcProfiles=[person('a'),person('b',{job_group:'lab',dept:'기공팀'}),person('c',{att_shift_group:'C'})];
test('이 달 다시 계산: 지문 줄의 지각·조퇴·연장만 새 기준으로 저장, 지문 시각·수기 줄은 그대로, 바뀐 줄 수를 기록',async()=>{
  const sb=fakeDb(recalcTables(),{rpc:{att_hourly_user_ids:{data:[],error:null}}}),c=ctx({sb,PROFILES:recalcProfiles});
  const r=await c.attRecalcMonth('2026-11');
  assert.equal(r.total,5,'지문 줄만(수기 제외)');assert.equal(r.changed,4);
  const rows=sb.upserts.flatMap(u=>u.rows);assert.equal(sb.upserts[0].table,'attendance');assert.deepEqual(plain(sb.upserts[0].opts),{onConflict:'user_id,work_date'});
  const find=(u,d)=>rows.find(x=>x.user_id===u&&x.work_date===d);
  assert.equal(find('a','2026-11-03'),undefined,'A조 15분은 그대로라 저장하지 않음');
  assert.equal(find('b','2026-11-03').late_min,0);assert.equal(find('c','2026-11-03').late_min,25);
  assert.deepEqual([find('a','2026-11-04').late_min,find('a','2026-11-04').overtime_min,find('a','2026-11-04').early_min],[0,30,0],'연차 날 지각 0 · 연장은 새로 계산(19:00 − 18:30)');
  for(const x of rows){assert.equal(x.source,'fp');}assert.equal(find('b','2026-11-05'),undefined,'수기 줄은 건드리지 않음');
  assert.equal(find('b','2026-11-03').clock_in,'09:55','지문 시각은 그대로');assert.equal(find('b','2026-11-03').clock_out,'18:30');
  assert.equal(find('a','2026-11-06').early_min,570,'출근=퇴근 09:00 줄은 조퇴(18:30까지 570분)로 다시 계산');
  const log=sb.rpcs.find(x=>x[0]==='att_log_recalc');assert.equal(log[1].p_month,'2026-11');assert.equal(log[1].p_total,5);assert.equal(log[1].p_changed,4);assert.ok(log[1].p_detail.sample.length>0);
});
test('이 달 다시 계산: 확정된 달·권한 없는 사람·잘못된 달은 거절하고 아무것도 저장 안 함',async()=>{
  const fin=fakeDb(recalcTables(),{monthRow:{status:'확정'},rpc:{att_hourly_user_ids:{data:[],error:null}}});await assert.rejects(()=>ctx({sb:fin,PROFILES:recalcProfiles}).attRecalcMonth('2026-11'),/확정된 달/);assert.equal(fin.upserts.length,0);
  const staff=fakeDb(recalcTables());await assert.rejects(()=>ctx({sb:staff,ME:{id:'s',role:'staff'}}).attRecalcMonth('2026-11'),/매니저·실장·원장/);assert.equal(staff.upserts.length,0);
  await assert.rejects(()=>ctx({sb:fakeDb()}).attRecalcMonth('2026-13'),/월/);
  const failing=fakeDb(recalcTables(),{upsertError:{message:'쓰기 실패'},rpc:{att_hourly_user_ids:{data:[],error:null}}});await assert.rejects(()=>ctx({sb:failing,PROFILES:recalcProfiles}).attRecalcMonth('2026-11'),/쓰기 실패/);assert.equal(failing.rpcs.filter(x=>x[0]==='att_log_recalc').length,0,'저장이 실패하면 기록도 안 남김');
  const again=fakeDb(recalcTables(),{rpc:{att_hourly_user_ids:{data:[],error:null}}});const c=ctx({sb:again,PROFILES:recalcProfiles});await c.attRecalcMonth('2026-11');
  // 이미 맞춰진 자료로 다시 돌리면 바뀐 줄 0
  const done=fakeDb({...recalcTables(),attendance:sbRowsAfter(again)},{rpc:{att_hourly_user_ids:{data:[],error:null}}});const r2=await ctx({sb:done,PROFILES:recalcProfiles}).attRecalcMonth('2026-11');assert.equal(r2.changed,0);assert.equal(done.upserts.length,0);
});
function sbRowsAfter(db){const changed=new Map(db.upserts.flatMap(u=>u.rows).map(x=>[x.user_id+'|'+x.work_date,x]));return recalcTables().attendance.map(r=>changed.get(r.user_id+'|'+r.work_date)||r);}
test('이 달 다시 계산 화면: 확인창 → 결과 글(몇 줄 중 몇 줄) · 취소하면 아무것도 안 함',async()=>{
  const sb=fakeDb(recalcTables(),{rpc:{att_hourly_user_ids:{data:[],error:null}}}),msg={textContent:''},nodes={'#attCloseMonth':{value:'2026-11'},'#attRecalcMsg':msg};
  const c=ctx({sb,PROFILES:recalcProfiles,$:s=>nodes[s]});c.__confirm=false;assert.equal(await c.runAttRecalc(),null);assert.equal(sb.upserts.length,0);
  c.__confirm=true;const r=await c.runAttRecalc();assert.equal(r.changed,4);assert.match(msg.textContent,/5줄 중 4줄이 바뀌었습니다/);
  nodes['#attCloseMonth'].value='2026-13';await c.runAttRecalc();assert.match(msg.textContent,/다시 계산하지 못했습니다/);
});
test('월 마감 달 기본값: 오늘이 10일 이하면 지난달, 아니면 이번 달(연초는 작년 12월)',()=>{
  const c=ctx(),d=s=>new Date(s+'T12:00:00+09:00');
  assert.equal(c.attCloseDefaultMonth(d('2026-11-10')),'2026-10');assert.equal(c.attCloseDefaultMonth(d('2026-11-11')),'2026-11');assert.equal(c.attCloseDefaultMonth(d('2026-11-01')),'2026-10');assert.equal(c.attCloseDefaultMonth(d('2027-01-05')),'2026-12');assert.equal(c.attCloseDefaultMonth(d('2026-12-31')),'2026-12');
});
test('월 마감 결재 화면: 앞 단계가 없으면 다음 단추가 눌리지 않고, 역할이 맞는 단계만 켜짐 · 되돌리기는 원장만',()=>{
  const btn=(h,a)=>h.match(new RegExp('<button[^>]*onclick="attCloseStep\\(\''+a+'\'\\)"'))?.[0]||'';
  const view=(role,row)=>ctx({ME:{id:'x',role}}).attCloseStateHtml('2026-11',row);
  let h=view('manager',null);assert.ok(!/disabled/.test(btn(h,'manager_check')));assert.ok(/disabled/.test(btn(h,'chief_check')));assert.ok(/disabled/.test(btn(h,'owner_confirm')));assert.ok(h.includes('미집계'));
  h=view('chief',null);assert.ok(/disabled/.test(btn(h,'manager_check')));assert.ok(/disabled/.test(btn(h,'chief_check')),'매니저 확인 전에는 실장 단추가 안 눌림');
  const r1={status:'매니저확인',manager_checked_by:'이매니저',manager_checked_at:'2026-11-27T01:00:00Z'};
  h=view('manager',r1);assert.ok(/disabled/.test(btn(h,'manager_check')),'이미 한 단계는 다시 못 누름');assert.ok(h.includes('이매니저'));
  h=view('chief',r1);assert.ok(!/disabled/.test(btn(h,'chief_check')));assert.ok(/disabled/.test(btn(h,'owner_confirm')));
  h=view('owner',r1);assert.ok(/disabled/.test(btn(h,'chief_check')),'원장은 실장 단계를 대신 못 함');assert.ok(/disabled/.test(btn(h,'owner_confirm')),'실장 확인 전에는 원장 확정이 안 눌림');assert.ok(h.includes('attCloseStep(\'revert\')'),'원장은 되돌리기');
  assert.ok(!view('chief',r1).includes("attCloseStep('revert')")&&!view('manager',r1).includes("attCloseStep('revert')"),'되돌리기는 원장만');
  h=view('owner',{status:'실장확인',chief_checked_by:'박실장'});assert.ok(!/disabled/.test(btn(h,'owner_confirm')));
  h=view('owner',{status:'확정',closed_by:'원장'});assert.ok(/disabled/.test(btn(h,'owner_confirm')));assert.ok(h.includes("attCloseStep('revert')"));
  assert.ok(!view('owner',null).includes("attCloseStep('revert')"),'되돌릴 단계가 없으면 되돌리기 없음');
});
test('월 마감 결재 동작: 서버 함수(att_month_step)만 부르고, 거절되면 알림 · 확인창에서 취소하면 안 보냄 · 지난달도 가능',async()=>{
  const row={status:'집계중'},sb=fakeDb({},{rpc:{att_month_step:args=>({data:{status:'매니저확인'},error:null})},monthRow:row}),box={innerHTML:''},nodes={'#attCloseMonth':{value:'2026-10'},'#attCloseBox':box};
  const c=ctx({sb,$:s=>nodes[s]});
  c.__confirm=false;assert.equal(await c.attCloseStep('manager_check'),false);assert.equal(sb.rpcs.length,0);
  c.__confirm=true;assert.equal(await c.attCloseStep('manager_check'),true);assert.deepEqual(plain(sb.rpcs[0]),['att_month_step',{p_month:'2026-10',p_action:'manager_check'}],'지난달(2026-10)도 보냄');assert.ok(box.innerHTML.includes('attCloseStep'),'처리 뒤 상태를 다시 그림');
  assert.ok(c.logs.some(l=>l.startsWith('confirm:2026-10 근태를 「매니저 확인」')));
  c.logs.length=0;assert.equal(await c.attCloseStep('owner_confirm'),true);assert.ok(c.logs.some(l=>l.includes('근태를 확정할까요?')),'원장 확정은 옛 확정 확인창 글을 그대로 씀');
  const bad=ctx({sb:fakeDb({},{rpc:{att_month_step:{data:null,error:{message:'step out of order (status=집계중)'}}},monthRow:row}),$:s=>nodes[s]});assert.equal(await bad.attCloseStep('chief_check'),false);assert.ok(bad.logs.some(l=>l.startsWith('alert:')&&l.includes('step out of order')));
  const staff=ctx({sb,ME:{id:'s',role:'staff'},$:s=>nodes[s]});assert.equal(await staff.attCloseStep('manager_check'),false);
  assert.ok(!/closeMonth\(/.test(html),'옛 「이번 달 확정」 직접 쓰기 함수는 없음');
});
test('근태 수정 기록(원장만): 이번 달·지난달 목록에서 누가·무엇을 했는지 한 줄로 보임',async()=>{
  const log=[
    {id:1,created_at:'2026-11-27T01:00:00Z',actor_name:'이매니저',actor_role:'manager',action:'mark_add',user_id:'a',work_date:'2026-11-03',detail:{mark:'late_ok'}},
    {id:2,created_at:'2026-11-27T02:00:00Z',actor_name:'이매니저',actor_role:'manager',action:'mark_remove',user_id:'a',work_date:'2026-11-03',detail:{mark:'late_ok'}},
    {id:3,created_at:'2026-11-27T03:00:00Z',actor_name:'박실장',actor_role:'chief',action:'group_change',user_id:'a',detail:{from:null,to:'B'}},
    {id:4,created_at:'2026-11-27T04:00:00Z',actor_name:'박실장',actor_role:'chief',action:'recalc',month:'2026-11',detail:{total:200,changed:31}},
    {id:5,created_at:'2026-11-27T05:00:00Z',actor_name:'원장',actor_role:'owner',action:'month_step',month:'2026-10',detail:{action:'owner_confirm',from:'실장확인',to:'확정'}}];
  const box={innerHTML:''},sb=fakeDb({attendance_edit_log:log}),c=ctx({ME:{id:'o',role:'owner'},sb,$:s=>s==='#attEditLogBox'?box:null});
  const rows=await c.loadAttEditLog(new Date('2026-11-28T12:00:00+09:00'));assert.equal(rows.length,5);
  assert.match(box.innerHTML,/이매니저 표시 추가 — 2026-11-03 직원 A · 지각 인정/);assert.match(box.innerHTML,/이매니저 표시 삭제/);assert.match(box.innerHTML,/박실장 근무조 변경 — 직원 A · 자동 → B/);assert.match(box.innerHTML,/이 달 다시 계산 — 2026-11 · 200줄 중 31줄 바뀜/);assert.match(box.innerHTML,/월 마감 원장 확정 — 2026-10 · 실장확인 → 확정/);
  const mgr=ctx({ME:{id:'m',role:'manager'},sb,$:s=>s==='#attEditLogBox'?box:null});box.innerHTML='';assert.equal(await mgr.loadAttEditLog(new Date('2026-11-28T12:00:00+09:00')),null);assert.equal(box.innerHTML,'','매니저·실장은 기록을 못 읽음');
  const empty=ctx({ME:{id:'o',role:'owner'},sb:fakeDb({attendance_edit_log:[]}),$:s=>s==='#attEditLogBox'?box:null});await empty.loadAttEditLog(new Date('2026-11-28T12:00:00+09:00'));assert.match(box.innerHTML,/수정 기록 없음/);
});
test('화면: 엑셀 올리기 미리보기·저장이 같은 계산(calcRow)을 쓰고, 미리보기 전에 조·휴가 자료를 읽음 · 휴일근무 안내 한 줄',()=>{
  assert.match(html,/function calcRow\(r\)\{[^\n]*\n[^\n]*attCalcDay\(/);assert.ok(!html.slice(html.indexOf('function calcRow('),html.indexOf('function renderXlTable')).includes('SETTINGS.late_cut'),'calcRow가 옛 단일 기준을 더 안 읽음');
  assert.match(html,/await loadAttRuleContext\(xlRows\[0\]\.ds,xlRows\[xlRows\.length-1\]\.ds\)/);
  assert.ok(html.includes('휴일근무 = 법정공휴일만(주말·근무표 휴무는 휴일근무가 아님).'));
  assert.match(summary,/'att\.shift_group\.'\+g\+'\.late_cut'/);
});
test('허브 설정: 근무조별 지각 기준 3개가 「🕘 근태 기준」에 시각 입력으로 등록되고 기본값이 화면 기본과 같음',()=>{
  const text=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8'),block=text.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0],c={};vm.createContext(c);vm.runInContext(block+';this.defs=HUB_SETTING_DEFS;',c);
  const defs=plain(c.defs).filter(d=>/^att\.shift_group\./.test(d.key));
  assert.deepEqual(defs.map(d=>[d.key,d.def,d.kind,d.screen]),[['att.shift_group.A.late_cut','09:40','time','🕘 근태 기준'],['att.shift_group.B.late_cut','10:00','time','🕘 근태 기준'],['att.shift_group.C.late_cut','09:30','time','🕘 근태 기준']]);
  const code=html.match(/let SETTINGS = \{[\s\S]*?\n\};/)[0];assert.ok(code.includes("'att.shift_group.B.late_cut':'10:00'")&&code.includes("'att.shift_group.C.late_cut':'09:30'"));
});
test('SQL 파일: 근무조 칸 · 표시/수정 기록 표 · 결재 함수 · 매니저 읽기 · 되돌리기 파일이 있음',()=>{
  const sql=fs.readFileSync(path.join(root,'db','att_rules_20261127.sql'),'utf8'),rb=fs.readFileSync(path.join(root,'db','att_rules_20261127_rollback.sql'),'utf8');
  for(const re of [/add column if not exists att_shift_group text/,/att_shift_group in \('A','B','C'\)/,/'att\.shift_group\.A\.late_cut'/,/manager_checked_by/,/chief_checked_at/,/'매니저확인','실장확인','확정'/,/create table if not exists public\.attendance_day_marks/,/removed_by uuid/,/create table if not exists public\.attendance_edit_log/,/function public\.att_month_step\(p_month text,p_action text\)/,/function public\.att_mark_add/,/function public\.att_mark_remove/,/function public\.att_set_shift_group/,/function public\.att_log_recalc/,/function public\.att_hourly_user_ids/,/'manager','chief','owner'/])assert.match(sql,re);
  assert.match(sql,/drop policy if exists att_months_update_owner/);assert.match(sql,/attendance_edit_log_select_owner[\s\S]*my_role\(\)='owner'/);
  for(const re of [/drop function if exists public\.att_month_step/,/drop table if exists public\.attendance_day_marks/,/drop column if exists att_shift_group/,/create policy att_months_update_owner/,/att_months_status_check check \(status in \('집계중','확정'\)\)/])assert.match(rb,re);
});
test('SQL 동작(PGlite): 결재 순서·역할·되돌리기·기록 · 표시 넣기/지우기 · 근무조 · 열람 권한',()=>{
  if(!process.env.PGLITE_PACKAGE_ROOT)return;
  const r=spawnSync(process.execPath,['tests/sql/pglite-att-rules-20261127.mjs'],{cwd:root,env:process.env,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/PGLITE_ATT_RULES_PASS/);
});
