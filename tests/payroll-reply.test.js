const test=require('node:test'),assert=require('node:assert/strict');const p=require('../payroll-reply.js');
function row(ot){return {month:'2026-09',employees:[{userId:'u',name:'합성퇴사자',dept:'진료실',summary:{workedDays:1,overtimeMinutes:ot,holidayMinutes:0,lateMinutes:30,earlyMinutes:15},days:[{date:'2026-09-01',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:ot,holidayMinutes:0,basis:'지문'}]},{userId:'none',name:'기록없음',summary:{workedDays:0},days:[]}]};}
test('포괄 10시간 경계: 9시간50분→0, 10시간10분→0.17, 30분→0.5; 퇴사자 포함·0일 제외',()=>{for(const [m,h] of [[590,0],[610,0.17],[630,0.5]]){const r=p.payrollReplyModel(row(m),[{user_id:'u',effective_from:'2026-01-01',inclusive_overtime_hours:10}],[],[],{});assert.equal(r.monthly.length,1);assert.equal(r.monthly[0].overtime,h);assert.equal(r.monthly[0].overtimeOnly,h);assert.equal(r.monthly[0].late,0.5);assert.equal(r.monthly[0].early,0.25);assert.equal(r.monthly[0].absence,'');}});
test('포괄 미입력은 전체 연장과 확인 표시; 실제 0시간은 미입력과 다르다',()=>{assert.equal(p.payrollReplyModel(row(30),[],[],[],{}).monthly[0].overtime,0.5);assert.ok(p.payrollReplyModel(row(30),[],[],[],{}).monthly[0].inclusiveMissing);assert.equal(p.payrollReplyModel(row(30),[{user_id:'u',effective_from:'2026-01-01',inclusive_overtime_hours:0}],[],[],{}).monthly[0].inclusiveMissing,false);});
test('공휴일 8시간10분→0.17; 야간 21:30~22:30→0.5와 자정 경계',()=>{const m=row(0);m.employees[0].days=[{date:'2026-09-01',clockIn:'09:00',clockOut:'17:10',holidayMinutes:490},{date:'2026-09-02',clockIn:'21:30',clockOut:'22:30',holidayMinutes:0}];const r=p.payrollReplyModel(m,[],[],['2026-09-01'],{}).monthly[0];assert.equal(r.holidayOvertime,0.17);assert.equal(r.night,0.5);assert.equal(p.payrollReplyNight('23:30','06:30',1320,360),390);});
test('회신 엑셀 3시트·U~AC 순서·당월 세후 상여·근거·포괄 미입력 목록',()=>{const r=p.payrollReplyModel(row(30),[],[{month:'2026-09',user_id:'u',amount:500,confirmed:true}],[],{});const x=p.payrollReplyWorkbook(r);assert.equal(x.filename,'급여회신_2026-09.xlsx');assert.deepEqual(x.sheets.map(s=>s.name),['월급제','시급제','근거']);assert.deepEqual(x.sheets[0].rows[0].slice(2,11),['결근일수','근태공제시간','지각시간','연장/휴일근로시간','공휴일 휴일연장시간','야간시간','인센티브','기타 인센티브','인센티브 기준']);assert.equal(x.sheets[0].rows[1][8],500);assert.ok(JSON.stringify(x).includes('포괄 시간 미입력'));});
test('시급제는 wage_info 기준으로 분리하고 기존 시급제 RPC 날짜별 분을 사용한다',()=>{const r=p.payrollReplyModel(row(30),[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}],[],[],{}, {users:[{user_id:'u',days:[{date:'2026-09-01',category:'weekday',minutes:510}]}]});assert.equal(r.monthly.length,0);assert.equal(r.hourly[0].weekdayWork,8);assert.equal(r.hourly[0].weekdayOver,0.5);});

test('포괄 미입력은 월급제 엑셀 마지막 확인필요 칸에 표시하고 근무 0일은 제외',()=>{const m=row(30);m.employees.push({userId:'z',name:'미완료',summary:{workedDays:0},days:[{date:'2026-09-02',clockIn:'',clockOut:''}]});const x=p.payrollReplyWorkbook(p.payrollReplyModel(m));assert.equal(x.sheets[0].rows.length,2);assert.equal(x.sheets[0].rows[0][11],'확인필요');assert.equal(x.sheets[0].rows[1][11],'포괄 시간 미입력');});

test('9월15일부터 시급: 1일 월급 근무분과 20일 시급 근무분은 각각 남음',()=>{
 const m=row(0);m.employees[0].days=[{date:'2026-09-01',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:90,lateMinutes:30,earlyMinutes:15},{date:'2026-09-20',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:120,lateMinutes:60,earlyMinutes:30}];m.employees[0].summary={overtimeMinutes:210,lateMinutes:90,earlyMinutes:45};
 const wages=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:false,inclusive_overtime_hours:1},{user_id:'u',effective_from:'2026-09-15',hourly_enabled:true,inclusive_overtime_hours:100}];
 const r=p.payrollReplyModel(m,wages,[],[],{}, {users:[{user_id:'u',days:[{date:'2026-09-20',category:'weekend',minutes:540}]}]});
 assert.equal(r.monthly.length,1);assert.equal(r.hourly.length,1);assert.equal(r.monthly[0].overtimeOnly,0.5);assert.equal(r.monthly[0].late,0.5);assert.equal(r.monthly[0].early,0.25);assert.equal(r.monthly[0].inclusive,1);assert.equal(r.hourly[0].weekendWork,8);assert.equal(r.hourly[0].weekendOver,1);
});
test('시급에서 월급으로 변경해도 이전 시급분·이후 월급분을 날짜별 분리',()=>{
 const m=row(0);m.employees[0].days=[{date:'2026-09-01',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:60},{date:'2026-09-20',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:120}];
 const r=p.payrollReplyModel(m,[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true},{user_id:'u',effective_from:'2026-09-15',hourly_enabled:false,inclusive_overtime_hours:1}]);
 assert.equal(r.monthly[0].overtimeOnly,1);assert.equal(r.hourly[0].weekdayWork,8);assert.equal(r.hourly[0].weekdayOver,1);assert.equal(r.hourly[0].weekendWork,0);
});

test('토요일 9시간: 기본·추가 날짜 구분·대체 계산은 같은 주말 8+1시간',()=>{
 const m=row(0);m.employees[0].days=[{date:'2026-09-05',clockIn:'09:00',clockOut:'18:00'}];const wages=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}],settings={categories:[{code:'weekday',days:[1,2,3,4,5],dates:[]},{code:'weekend',days:[0,6],dates:[]},{code:'public',days:[],dates:['2026-09-05']}]};
 for(const category of ['weekend','public',null]){const data=category?{users:[{user_id:'u',days:[{date:'2026-09-05',category,minutes:540}]}]}:null;const h=p.payrollReplyModel(m,wages,[],[],settings,data).hourly[0];assert.equal(h.weekdayWork,0);assert.equal(h.weekendWork,8);assert.equal(h.weekendOver,1);}
});
test('회신 구분 기본 규칙과 원장 지정은 RPC·대체 경로에 같이 적용',()=>{
 const m=row(0);m.employees[0].days=[{date:'2026-09-05',clockIn:'09:00',clockOut:'18:00'}];const wages=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}];
 for(const c of [{code:'sat',days:[6],dates:[]},{code:'public',days:[],dates:['2026-09-05']},{code:'weekend',days:[0,6],dates:[],reply_column:'weekday'}]){const settings={categories:[c]},data={users:[{user_id:'u',days:[{date:'2026-09-05',category:c.code,minutes:540}]}]};const a=p.payrollReplyModel(m,wages,[],[],settings,data).hourly[0],b=p.payrollReplyModel(m,wages,[],[],settings).hourly[0],kind=c.reply_column||'weekend';assert.equal(a[kind+'Work'],8);assert.equal(a[kind+'Over'],1);assert.deepEqual(a,b);}
});

test('실제 회신 조회는 DB 시급 구분 설정을 받아 RPC 시간을 해당 칸으로 보냄',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),m=row(0);m.employees[0].days=[{date:'2026-09-05',clockIn:'09:00',clockOut:'18:00'}];const calls=[],c={bonusOwner:()=>true,attendanceMonthBounds:()=>({start:'2026-09-01',next:'2026-10-01'}),fetchAttMonthlyData:async()=>m,hubN:(k,d)=>d,hubT:(k,d)=>d,sb:{from:table=>{const q={select:()=>q,eq:()=>q,lt:()=>q,gte:()=>q,then:resolve=>Promise.resolve({data:table==='wage_info'?[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}]:[]}).then(resolve)};return q;},rpc:async name=>{calls.push(name);return {data:name==='wage_hourly_config'?{settings:{categories:[{code:'special',days:[],dates:['2026-09-05'],reply_column:'weekday'}]}}:{users:[{user_id:'u',days:[{date:'2026-09-05',category:'special',minutes:540}]}]}};}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-reply.js','utf8'),c);const r=await c.payrollFetchReply('2026-09');assert.ok(calls.includes('wage_hourly_config'));assert.equal(r.hourly[0].weekdayWork,8);assert.equal(r.hourly[0].weekdayOver,1);assert.equal(r.hourly[0].weekendWork,0);
});

test('출근만 있는 직원·날짜는 합계에서 빼고 근거 확인필요에 남김',()=>{
 const m={month:'2026-09',employees:[{userId:'missing',name:'퇴근누락',days:[{date:'2026-09-03',clockIn:'09:00',clockOut:'',basis:'지문',overtimeMinutes:999}]},{userId:'mix',name:'부분누락',summary:{overtimeMinutes:999},days:[{date:'2026-09-01',clockIn:'09:00',clockOut:'18:00',overtimeMinutes:30},{date:'2026-09-02',clockIn:'09:00',clockOut:'',overtimeMinutes:999}]}]};
 const r=p.payrollReplyModel(m),book=p.payrollReplyWorkbook(r);assert.equal(r.monthly.length,1);assert.equal(r.monthly[0].overtimeOnly,0.5);assert.equal(r.basis.length,3);const d=r.basis.find(d=>d[0]==='퇴근누락');assert.equal(d[2],'2026-09-03');assert.match(d[10],/확인 필요/);assert.ok(JSON.stringify(book.sheets[2]).includes('퇴근누락'));
});

test('금 23시→토 08시: RPC·대체 경로 모두 평일 1·주말 8·오버 0',()=>{
 const m={month:'2026-10',employees:[{userId:'u',name:'가짜',days:[{date:'2026-10-09',clockIn:'23:00',clockOut:'08:00'}]}]},w=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}],data={users:[{user_id:'u',days:[{date:'2026-10-09',category:'weekday',minutes:60},{date:'2026-10-10',category:'weekend',minutes:480}]}]};
 const fallback=p.payrollReplyModel(m,w).hourly[0],rpc=p.payrollReplyModel(m,w,[],[],{},data).hourly[0];assert.deepEqual(fallback,rpc);assert.equal(fallback.weekdayWork,1);assert.equal(fallback.weekendWork,8);assert.equal(fallback.weekdayOver+fallback.weekendOver,0);
});
test('9월30일 23시→10월1일 02시: 9월 1시간만, 10월 이월 구간 2시간',()=>{
 const d={date:'2026-09-30',clockIn:'23:00',clockOut:'02:00'},w=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true}];
 const sep=p.payrollReplyModel({month:'2026-09',employees:[{userId:'u',name:'가짜',days:[d]}]},w).hourly[0];assert.equal(sep.weekdayWork,1);
 const oct=p.payrollReplyModel({month:'2026-10',employees:[{userId:'u',name:'가짜',days:[],carryDays:[d]}]},w).hourly[0];assert.equal(oct.weekdayWork,2);
});
test('자정 구간 날짜 급여형태·날짜 우선 구분·하루 합산을 적용',()=>{
 const m={month:'2026-10',employees:[{userId:'u',name:'가짜',days:[{date:'2026-10-09',clockIn:'23:00',clockOut:'08:00'},{date:'2026-10-10',clockIn:'18:00',clockOut:'20:00'}]}]},w=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:true},{user_id:'u',effective_from:'2026-10-10',hourly_enabled:false}];
 assert.equal(p.payrollReplyModel(m,w).hourly[0].weekdayWork,1);assert.equal(p.payrollReplyModel(m,w).hourly[0].weekendWork,0);
 const settings={categories:[{code:'weekday',days:[1,2,3,4,5],dates:[]},{code:'weekend',days:[0,6],dates:[]},{code:'special',days:[],dates:['2026-10-10'],reply_column:'weekday'}]},h=p.payrollReplyModel(m,w.slice(0,1),[],[],settings).hourly[0];
 assert.equal(h.weekdayWork,9);assert.equal(h.weekdayOver,2);assert.equal(h.weekendWork,0);
 const changed=[{user_id:'u',effective_from:'2026-01-01',hourly_enabled:false},{user_id:'u',effective_from:'2026-10-10',hourly_enabled:true}];const first=p.payrollReplyModel(m,changed).hourly[0];assert.equal(first.weekdayWork,0);assert.equal(first.weekendWork,8);assert.equal(first.weekendOver,2);
});

test('미확정 상여 금액은 회신 인센티브 대신 글자로 표시하고 근거 확인필요에 남김',()=>{
 const entry={month:'2026-09',user_id:'u',amount:100,confirmed:false},r=p.payrollReplyModel(row(30),[],[entry]);
 assert.equal(r.monthly[0].bonus,'미확정');assert.equal(r.monthly[0].bonusUnconfirmed,true);
 const book=p.payrollReplyWorkbook(r);assert.equal(book.sheets[0].rows[1][8],'미확정');assert.ok(book.sheets[2].rows.some(r=>r[0]==='합성퇴사자'&&String(r[10]).includes('상여 미확정')));
 const confirmed=p.payrollReplyModel(row(30),[],[{...entry,confirmed:true}]);assert.equal(confirmed.monthly[0].bonus,100);assert.equal(confirmed.monthly[0].bonusUnconfirmed,false);
 assert.equal(p.payrollReplyModel(row(30)).monthly[0].bonus,'');assert.equal(p.payrollReplyModel(row(30),[],[{...entry,confirmed:true,amount:0}]).monthly[0].bonus,0);
});
test('미확정 글은 허브 글 설정으로 바뀌고 실제 상여금은 노출하지 않음',()=>{
 const model=p.payrollReplyModel(row(30),[],[{month:'2026-09',user_id:'u',amount:100,confirmed:false}],[],{text:(k,d)=>k==='bonus_unconfirmed'?'확정 대기':k==='bonus_review'?'상여 재확인':d});
 assert.equal(model.monthly[0].bonus,'확정 대기');assert.ok(model.basis.some(r=>String(r[10]).includes('상여 재확인')));
});
