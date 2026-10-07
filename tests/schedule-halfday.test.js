const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
const date='2026-10-08',week='2026-10-05';
const people=['오전 직원','오후 직원','조퇴 직원','시간 없는 직원','연차 직원','대기 직원','반려 직원'].map((name,i)=>({id:'p'+i,profile_user_id:'u'+i,name,department:'데스크',active:true}));
const leaves=people.map((p,i)=>({user_id:p.profile_user_id,type:i===2?'조퇴':i===4?'연차':'반차',type_note:['09:00~13:00','13:00~18:00','16:00~18:00',null,null,'09:00~13:00','09:00~13:00'][i],status:i===5?'대기':i===6?'반려':'승인',date_from:date,date_to:date}));
const rows=people.map(p=>({person_id:p.id,user_id:p.profile_user_id,week_start:week,day:4,shift:'work'}));
function harness(){
  const c={PROFILES:[],localStorage:{getItem:()=> '1'},document:{getElementById:()=>({focus(){}})},SCHEDULE_PEOPLE:people,nameOf:uid=>people.find(p=>p.profile_user_id===uid)?.name,hubFillHtml:s=>s,hubOptionHtml:(k,v)=>`<option>${v}</option>`,SCHED_WEEK:week,SCHED_MONTH:'2026-10',SCHED_VIEW:'week',SCHEDULE_STATUS_OVERRIDES:{},esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),scheduleNamesVisible:()=>true,scheduleNamesToggleButton:()=>'',isLead:()=>true,isMgr:()=>false,today:()=>date,md:s=>s.slice(5),dstr:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,addDays:(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return c.dstr(d);},hubText:(k,d,v)=>String(d).replace(/\{(\w+)\}/g,(m,n)=>v?.[n]??m)};
  c.sb={from(table){let data=table==='leave_requests'?leaves:table==='schedules'?rows:[{week_start:week,status:'초안'}];const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},in(){return q},lte(){return q},gte(){return q},maybeSingle(){data=data[0];return q},then(resolve){return Promise.resolve({data,error:null}).then(resolve)}};return q}};
  vm.createContext(c);
  for(const [start,end] of [['/* schedule-roster:test-start */','/* schedule-roster:test-end */'],['function mondayStr(','const SHIFTS='],['function scheduleMonthWeeks(','function scheduleDepartmentItems('],['/* ── 캘린더 ── */','/* ── 연차현황 ── */']])vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))),c);
  return c;
}
test('승인된 반차·조퇴의 근무 시간과 읽을 수 없는 범위',()=>{
  const c=harness();
  assert.equal(c.schedulePartialLeave(leaves[0]).timeText,'13:00부터');
  assert.equal(c.schedulePartialLeave(leaves[1]).timeText,'13:00까지');
  assert.equal(c.schedulePartialLeave(leaves[2]).timeText,'16:00까지');
  for(const note of [null,'잘못된 범위','25:00~26:00','18:00~13:00'])assert.equal(c.schedulePartialLeave({...leaves[0],type_note:note}).timeText,'');
  assert.equal(c.schedulePartialLeave(leaves[5]),null);assert.equal(c.schedulePartialLeave(leaves[6]),null);
});
test('주간·월간은 이름 아래 시간, 반차 선택 가능, 하루 연차 잠금 유지',async()=>{
  const c=harness();
  for(const mode of ['week','month']){
    c.SCHED_VIEW=mode;const m={};await c.renderSched(m);
    for(const text of ['13:00부터','13:00까지','16:00까지'])assert.ok(m.innerHTML.includes(text),mode+' '+text);
    const labels=[...m.innerHTML.matchAll(/<label class="schedule-check[^>]*>(.*?)<\/label>/gs)].map(x=>x[1]).filter(x=>x.includes(date));
    for(const name of ['오전 직원','오후 직원','조퇴 직원']){const label=labels.find(x=>x.includes(name));assert.doesNotMatch(label,/disabled/);assert.match(label,/schedule-half-time/);}
    assert.match(labels.find(x=>x.includes('연차 직원')),/disabled/);
    assert.doesNotMatch(labels.find(x=>x.includes('대기 직원')),/schedule-half/);
    assert.doesNotMatch(labels.find(x=>x.includes('반려 직원')),/schedule-half/);
    assert.doesNotMatch(labels.find(x=>x.includes('시간 없는 직원')),/schedule-half-time/);
  }
});
test('직원 날짜 상세와 주간·월간 캘린더에는 반차·조퇴 직원의 근무를 남긴다',async()=>{
  const c=harness();
  for(const period of ['week','month']){
    vm.runInContext(`CAL_PERIOD='${period}';CAL_MONTH='2026-10';CAL_WEEK_START='${week}';CAL_SELECTED_DATE='${date}';CAL_DETAIL_DATE='${date}';`,c);
    const m={};await c.renderCalendar(m);
    for(const text of ['13:00부터','13:00까지','16:00까지'])assert.ok(m.innerHTML.includes(text),period+' '+text);
    assert.match(m.innerHTML,/조퇴 직원/);
    const detail=m.innerHTML.split('calendar-day-detail-section')[1];assert.ok(detail.includes('13:00부터'));
  }
});
test('근무표에 아직 배정되지 않은 직원도 날짜 상세 휴가 목록에 근무 시간이 보인다',()=>{
  const c=harness(),items=c.calendarLeaveIndex(leaves,people,date,date,c.nameOf,true);
  const detail=c.renderCalendarDayDetail(date,c.emptyCalendarRoster(),items[date]);
  for(const text of ['13:00부터','13:00까지','16:00까지'])assert.ok(detail.includes(text),text);
  assert.doesNotMatch(detail,/대기 직원|반려 직원/);
});
test('시간 문구·꼬리표·색은 허브 설정에서 바뀌고 인쇄 CSS에 글자가 남는다',()=>{
  const c=harness();c.hubText=(k,d,v)=>String({'sched.half.tag':'반일','sched.half.early_tag':'일찍 퇴근','sched.half.from':'출근 {time}','sched.half.until':'퇴근 {time}','sched.half.color':'#123456'}[k]??d).replace(/\{(\w+)\}/g,(m,n)=>v?.[n]??m);
  const markup=c.schedulePartialNameHtml('직원',leaves[0]);assert.match(markup,/반일/);assert.match(markup,/출근 13:00/);assert.match(markup,/#123456/);
  assert.match(c.schedulePartialNameHtml('직원',leaves[2]),/일찍 퇴근/);
  assert.match(html,/body\.schedule-printing \.schedule-half-time/);
});
test('실제 허브 설정 엔진의 다섯 키가 주간·월간·직원 상세에 적용된다',async()=>{
  const js=fs.readFileSync('hub-texts.js','utf8'),e={};vm.createContext(e);
  vm.runInContext(js.match(/\/\* hub-texts:test-start \*\/([\s\S]*?)\/\* hub-texts:test-end \*\//)[1],e);
  const values={'sched.half.tag':'반일 근무','sched.half.early_tag':'일찍 마침','sched.half.from':'출근 {time}','sched.half.until':'퇴근 {time}','sched.half.color':'#123456'};
  for(const key of Object.keys(values))assert.ok(e.hubTextDefs().find(d=>d.key===key),key);
  e.hubTextSetOverrides(Object.entries(values).map(([key,value])=>({key,value})));
  const c=harness();c.hubText=e.hubText;
  for(const mode of ['week','month','calendar']){
    const m={};
    if(mode==='calendar'){vm.runInContext(`CAL_PERIOD='week';CAL_MONTH='2026-10';CAL_WEEK_START='${week}';CAL_SELECTED_DATE='${date}';CAL_DETAIL_DATE='${date}';`,c);await c.renderCalendar(m);}
    else{c.SCHED_VIEW=mode;await c.renderSched(m);}
    for(const text of ['반일 근무','일찍 마침','출근 13:00','퇴근 13:00','퇴근 16:00','#123456'])assert.ok(m.innerHTML.includes(text),mode+' '+text);
  }
  e.hubTextSetOverrides([{key:'sched.half.color',value:'red;display:none'}]);
  assert.match(c.schedulePartialNameHtml('직원 <A>',leaves[0]),/직원 &lt;A&gt;/);
  assert.doesNotMatch(c.schedulePartialNameHtml('직원',leaves[0]),/display:none/);
});
