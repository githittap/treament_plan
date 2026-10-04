const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','hr.html'),'utf8');
const summary=html.match(/\/\* attendance-monthly-summary:start \*\/[\s\S]*?\/\* attendance-monthly-summary:end \*\//)?.[0]||'';
const payroll=html.match(/\/\* payroll-payslip:test-start \*\/[\s\S]*?\/\* payroll-payslip:test-end \*\//)[0];
const apply=html.slice(html.indexOf('function applyAttendanceResolutions('),html.indexOf('let MANUAL_DETAIL_OPEN'));
const bounds=html.slice(html.indexOf('function attendanceMonthBounds('),html.indexOf('\n',html.indexOf('function attendanceMonthBounds(')));
const pages=html.slice(html.indexOf('async function fetchAttendancePages('),html.indexOf('\n',html.indexOf('async function fetchAttendancePages(')));
const plain=x=>JSON.parse(JSON.stringify(x));
function ctx(extra={}){const c={ME:{id:'owner',role:'owner'},PROFILES:[],Intl,Date,Map,Set,esc:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),...extra};vm.createContext(c);vm.runInContext(apply+bounds+pages+payroll+summary,c);return c;}
const employee=(id,name=id)=>({user_id:id,name,dept:'진료팀',role:'staff'});
function fixture(){return {month:'2026-09',status:'집계중',employees:[employee('a','직원 A'),employee('b','직원 B'),employee('z','기록 없는 직원')],rows:[
 {id:1,user_id:'a',work_date:'2026-09-01',source:'fp',clock_in:'09:05',clock_out:'18:10',late_min:5,early_min:0,overtime_min:10},
 {id:2,user_id:'a',work_date:'2026-09-02',source:'fp',clock_in:'10:00',clock_out:'18:00',late_min:0,early_min:20,overtime_min:20,is_holiday:true},
 {id:3,user_id:'b',work_date:'2026-09-01',source:'fp',clock_in:'10:00',clock_out:'16:00',late_min:7,early_min:2,overtime_min:4},
 {id:4,user_id:'a',work_date:'2026-08-31',source:'fp',clock_in:'09:00',clock_out:'23:00',late_min:80,overtime_min:300}],manualRows:[
 {id:10,user_id:'a',work_date:'2026-09-01',status:'원장확정',clock_in:'09:00',clock_out:'18:30',overtime_min:30,evening_overtime_min:15},
 {id:11,user_id:'b',work_date:'2026-09-01',status:'원장확정',clock_in:'10:00',clock_out:'16:00',overtime_min:4,evening_overtime_min:40},
 {id:12,user_id:'a',work_date:'2026-09-03',status:'대기',clock_in:'09:00',clock_out:'18:00',late_min:99,overtime_min:200},
 {id:13,user_id:'a',work_date:'2026-09-03',status:'실장승인',clock_in:'09:00',clock_out:'18:00',late_min:99,overtime_min:200}],resolutions:[
 {user_id:'a',work_date:'2026-09-01',source:'issue_adjustment',approved_at:'2026-09-04T00:00:00Z',clock_in:'09:00',clock_out:'18:30',late_min:0,early_min:3,overtime_min:30},
 {user_id:'a',work_date:'2026-09-02',source:'issue_adjustment',approved_at:null,clock_in:'09:00',clock_out:'23:00',late_min:90,early_min:90,overtime_min:300}]};}

// These fixtures catch cross-employee joins, double counting, and treating pending records as facts.
test('월 요약은 직원·날짜별 승인 보정과 일치하는 확정 저녁 분만 합산한다',()=>{
 const c=ctx();assert.equal(typeof c.attMonthlyModel,'function','월 요약 기능이 있어야 한다');const f=fixture(),before=JSON.stringify(f),m=c.attMonthlyModel(f),a=m.employees.find(x=>x.userId==='a'),b=m.employees.find(x=>x.userId==='b');
 assert.deepEqual(plain(a.summary),{recordedDays:2,workedDays:2,lateCount:0,lateMinutes:0,earlyCount:2,earlyMinutes:23,overtimeMinutes:65,holidayMinutes:480,clockSpanMinutes:1050,clockReviewDays:0,pendingManualDays:1,adjustedDays:1});
 assert.equal(b.summary.lateMinutes,7);assert.equal(b.summary.overtimeMinutes,4,'다른 직원 또는 보정 없는 지문에 저녁 분을 붙이지 않는다');assert.equal(JSON.stringify(f),before,'원본과 확정 자료를 수정하지 않는다');
});
test('자료가 없으면 근무·결근을 추측하지 않고 시각 누락은 검토 건으로 표시한다',()=>{
 const c=ctx();assert.equal(typeof c.attMonthlyModel,'function');const m=c.attMonthlyModel({month:'2026-09',employees:[employee('a'),employee('z')],rows:[{user_id:'a',work_date:'2026-09-01',source:'fp',clock_in:'09:00',clock_out:null,overtime_min:10}]});
 const a=m.employees[0],z=m.employees[1];assert.equal(a.summary.workedDays,0);assert.equal(a.summary.clockReviewDays,1);assert.equal(a.summary.clockSpanMinutes,0);assert.equal(z.summary.recordedDays,0);assert.equal(z.days.length,0);assert.equal('absentDays' in z.summary,false);
});
test('월말 경계·직원별 같은 날짜를 분리하고 원본 없는 승인 수기로 하루를 생성하지 않는다',()=>{
 const c=ctx();assert.equal(typeof c.attMonthlyModel,'function');const m=c.attMonthlyModel({month:'2026-12',employees:[employee('a'),employee('b')],rows:[{user_id:'a',work_date:'2026-12-31',source:'manual',clock_in:'09:00',clock_out:'18:00',overtime_min:20},{user_id:'b',work_date:'2026-12-31',source:'manual',clock_in:'09:00',clock_out:'18:00',overtime_min:20},{user_id:'a',work_date:'2027-01-01',source:'fp',clock_in:'09:00',clock_out:'18:00'}],manualRows:[{user_id:'a',work_date:'2026-12-30',status:'원장확정',clock_in:'09:00',clock_out:'18:00',overtime_min:20,evening_overtime_min:80},{user_id:'a',work_date:'2026-12-31',status:'원장확정',clock_in:'09:00',clock_out:'18:00',overtime_min:20,evening_overtime_min:5}]});
 assert.equal(m.employees[0].summary.recordedDays,1);assert.equal(m.employees[0].summary.overtimeMinutes,25);assert.equal(m.employees[1].summary.overtimeMinutes,20);assert.equal(m.employees[0].days[0].date,'2026-12-31');
});
test('개인 확인용 출력은 선택한 직원만 포함하고 이름·부서 HTML을 이스케이프한다',()=>{
 const c=ctx();assert.equal(typeof c.attMonthlyPersonHtml,'function');const f=fixture();f.employees[0].name='<img src=x onerror=alert(1)>';const m=c.attMonthlyModel(f),out=c.attMonthlyPersonHtml(m,0);
 assert.ok(out.includes('&lt;img'));assert.ok(!out.includes('<img'));assert.ok(!out.includes('직원 B'));assert.ok(out.includes('2026-09-01'));assert.ok(out.includes('확인용'));assert.ok(out.includes('휴게'));assert.ok(!out.includes('급여액'));
});
test('엑셀 모델은 월·기준 상태와 요약·일별 근거를 연결하고 지각 횟수와 총분을 분리한다',()=>{
 const c=ctx();assert.equal(typeof c.attMonthlyExportModel,'function');const x=c.attMonthlyExportModel(c.attMonthlyModel(fixture()));
 assert.equal(x.sheets.length,3);assert.equal(x.sheets[0].rows[1][1],'2026-09');assert.ok(x.sheets[1].rows[0].includes('지각(회)'));assert.ok(x.sheets[1].rows[0].includes('지각(분)'));assert.equal(x.sheets[2].rows.length,4);assert.ok(JSON.stringify(x).includes('승인 보정'));
});
function database({att=[],manual=[],resolutions=[],errorAt='',state='집계중'}={}){const calls=[];return {calls,from(table){calls.push({table,filters:[],ranges:[]});const call=calls.at(-1),q={select(){return q;},gte(k,v){call.filters.push(['gte',k,v]);return q;},lt(k,v){call.filters.push(['lt',k,v]);return q;},eq(k,v){call.filters.push(['eq',k,v]);return q;},order(){return q;},async range(a,b){call.ranges.push([a,b]);const rows=table==='attendance'?att:table==='attendance_manual_entries'?manual:resolutions;return {data:errorAt===table?null:rows.slice(a,b+1),error:errorAt===table?{message:'조회 실패'}:null};},async maybeSingle(){return {data:{status:state},error:errorAt===table?{message:'마감 조회 실패'}:null};}};return q;}};}
test('읽기 로더는 원장만 허용하고 잘못된 달에는 DB를 조회하지 않는다',async()=>{
 const sb=database(),c=ctx({sb,ME:{id:'a',role:'staff'}});assert.equal(typeof c.fetchAttMonthlyData,'function');await assert.rejects(()=>c.fetchAttMonthlyData('2026-09'),/원장/);assert.equal(sb.calls.length,0);c.ME.role='owner';await assert.rejects(()=>c.fetchAttMonthlyData('2026-13'),/월/);assert.equal(sb.calls.length,0);
});
test('월 전체 자료를 페이지로 읽고 직원/날짜를 섞지 않으며 연말 다음달 경계를 사용한다',async()=>{
 const att=Array.from({length:501},(_,i)=>({user_id:'u'+i,work_date:'2026-12-31',source:'fp',clock_in:'09:00',clock_out:'18:00'})),sb=database({att}),c=ctx({sb});assert.equal(typeof c.fetchAttMonthlyData,'function');const m=await c.fetchAttMonthlyData('2026-12');
 assert.equal(m.employees.length,501);for(const call of sb.calls.filter(x=>x.table!=='att_months')){assert.deepEqual(call.filters,[['gte','work_date','2026-12-01'],['lt','work_date','2027-01-01']]);}assert.deepEqual(sb.calls.filter(x=>x.table==='attendance').flatMap(x=>x.ranges),[[0,499],[500,999]]);
});
test('부분 조회 오류와 페이지 상한 도달은 합계·내보내기를 만들지 않는다',async()=>{
 const sb=database({errorAt:'attendance_issue_resolutions'}),c=ctx({sb});assert.equal(typeof c.fetchAttMonthlyData,'function');await assert.rejects(()=>c.fetchAttMonthlyData('2026-09'),/조회 실패/);
 const capped=ctx({sb:database({att:Array.from({length:10000},(_,i)=>({user_id:'u'+i,work_date:'2026-09-01'}))})});await assert.rejects(()=>capped.fetchAttMonthlyData('2026-09'),/상한/);
});
function uiContext(sb){const nodes={'#attMonthlyMonth':{value:'2026-09'},'#attMonthlyResult':{innerHTML:''},'#attMonthlyExport':{disabled:true},'#attMonthlyPersonBody':{innerHTML:''},'#attMonthlyMask':{visible:false}},writes=[];const c=ctx({sb,PROFILES:fixture().employees,$:s=>nodes[s],hide:id=>{nodes['#'+id].visible=false;},show:id=>{nodes['#'+id].visible=true;},XLSX:{utils:{book_new:()=>({}),book_append_sheet(){},aoa_to_sheet:x=>x},writeFile:(...x)=>writes.push(x)}});return {c,nodes,writes};}
test('재조회 실패면 이전 개인 자료를 닫고 내보내기·합계가 이전 값으로 남지 않는다',async()=>{
 const f=fixture(),{c,nodes,writes}=uiContext(database({att:f.rows,manual:f.manualRows,resolutions:f.resolutions}));
 await c.loadAttMonthly();assert.equal(nodes['#attMonthlyExport'].disabled,false);c.openAttMonthlyPerson(0);assert.equal(nodes['#attMonthlyMask'].visible,true);assert.ok(nodes['#attMonthlyPersonBody'].innerHTML.includes('직원 A'));
 c.sb=database({errorAt:'attendance'});await c.loadAttMonthly();assert.equal(nodes['#attMonthlyMask'].visible,false,'실패한 조회 뒤 이전 문서를 인쇄하지 않도록 닫는다');assert.equal(nodes['#attMonthlyExport'].disabled,true);assert.ok(!nodes['#attMonthlyResult'].innerHTML.includes('직원 A'));await c.exportAttMonthly();assert.equal(writes.length,0);
});
test('늦게 도착한 이전 월 응답은 선택한 새 월의 요약·개인 출력을 덮지 않는다',async()=>{
 let finish;const held=new Promise(resolve=>{finish=resolve;}),old=database({att:[{user_id:'a',work_date:'2026-09-01',source:'fp',clock_in:'09:00',clock_out:'18:00'}]}),from=old.from.bind(old);
 old.from=table=>{const q=from(table);if(table==='att_months')q.maybeSingle=()=>held;return q;};const {c,nodes}=uiContext(old),pending=c.loadAttMonthly();nodes['#attMonthlyMonth'].value='2026-10';c.resetAttMonthly();c.sb=database({att:[{user_id:'a',work_date:'2026-10-02',source:'fp',clock_in:'10:00',clock_out:'18:00'}]});await c.loadAttMonthly();finish({data:{status:'집계중'},error:null});await pending;c.openAttMonthlyPerson(0);assert.ok(nodes['#attMonthlyResult'].innerHTML.includes('2026-10'));assert.ok(nodes['#attMonthlyPersonBody'].innerHTML.includes('2026-10-02'));assert.ok(!nodes['#attMonthlyPersonBody'].innerHTML.includes('2026-09-01'));
});
test('월 요약 진입은 원장에게만 노출하고 엑셀 다운로드는 최신 조회 결과를 사용한다',async()=>{
 const f=fixture(),{c,writes}=uiContext(database({att:f.rows,manual:f.manualRows,resolutions:f.resolutions}));assert.ok(c.attMonthlyCardHtml().includes('attMonthlyMonth'));c.ME.role='chief';assert.equal(c.attMonthlyCardHtml(),'');await c.exportAttMonthly();assert.equal(writes.length,0);c.ME.role='owner';await c.exportAttMonthly();assert.equal(writes.length,1);assert.equal(writes[0][1],'월근태요약_2026-09.xlsx');
});
