const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const roster = html.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//)[1];
const calendar = html.match(/\/\* ── 캘린더 ── \*\/([\s\S]*?)\/\* ── 연차현황 ── \*\//)[1];
function context() {
  const c = { PROFILES: [], esc: s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'), render() {},
    today: () => '2026-10-01', dstr: d => d.toISOString().slice(0,10), mondayStr: () => '2026-09-28' };
  vm.createContext(c);
  vm.runInContext(roster + '\n' + calendar + ';this.state=()=>[CAL_SELECTED_DATE,CAL_DETAIL_DATE];', c);
  return c;
}
test('P7: 직무가 비어도 캘린더와 이름표는 근무표의 부서 대체 분류를 따른다', () => {
  const c = context();
  for (const [department,label] of [['진료실','진료·상담'],['상담','진료·상담'],['행정','소독·행정'],['소독실','소독·행정'],['기공실','기공'],['데스크','데스크']]) {
    const person = {id:'p', name:'직원', department, profile_user_id:'u'};
    const profiles = new Map([['u',{job_group:null}]]);
    assert.equal(c.schedulePersonLabel(person, profiles), '직원 · '+label);
    assert.deepEqual(Array.from(c.scheduleCalendarIndex([{person_id:'p',week_start:'2026-09-28',day:4,shift:'work'}],[person],[],profiles)['2026-10-01'].departments[label]), ['직원']);
  }
  assert.equal(c.schedulePersonLabel({name:'직원',department:'진료실'},new Map()), '직원 · 진료·상담');
  assert.equal(c.schedulePersonLabel({name:'직원',department:'진료실',job_group:'lab'},new Map()), '직원 · 기공');
});
test('P7: 주간 숫자 단추의 실제 onclick 실행이 이름 팝업을 연다', () => {
  const c=context(), date='2026-10-01', r=c.emptyCalendarRoster();r.departments['데스크']=['직원'];
  const rendered=c.renderCalendarWeekTable([date],{[date]:r},{},{},new Map());
  const onclick=rendered.match(/onclick="([^"]+)"/)[1];
  let calls=0;c.render=()=>calls++;
  const button={tagName:'BUTTON'};c.event={target:{closest:()=>button},currentTarget:button};
  vm.runInContext(onclick,c);
  assert.deepEqual(Array.from(c.state()),[date,date]);assert.equal(calls,1);
});
test('P7: 월간 캘린더는 월요일부터 일요일이고 10월 1일은 목요일 칸이다', async () => {
  const c=context();
  Object.assign(c,{SCHEDULE_PEOPLE:[],nameOf:()=>'',isLead:()=>false,hubFillHtml:s=>s,
    sb:{from(){const q={select(){return q},gte(){return q},lte(){return q},eq(){return q},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q}}});
  vm.runInContext("CAL_PERIOD='month';CAL_MONTH='2026-10';",c);
  const m={};await c.renderCalendar(m);
  assert.deepEqual([...m.innerHTML.matchAll(/class="cal-dow[^\"]*">([^<]+)/g)].map(x=>x[1]), ['월','화','수','목','금','토','일']);
  const grid=m.innerHTML.split('<div class="cal-grid">')[1];
  assert.equal((grid.split("selectCalendarDay('2026-10-01'")[0].match(/class="cal-cell out"/g)||[]).length,3);
});
