const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');

test('D장 출퇴근 입력은 저녁 추가근무·합계·요일·비고·반차를 제공한다', () => {
  for (const marker of ['manualEveningOvertimeRaw', 'manualOvertimeTotal', 'manualWeekday', 'manualNote', 'manualHalfDay']) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(html, /저녁 추가근무/);
  assert.match(html, /추가근무 합계/);
  assert.match(html, /비고/);
  assert.match(html, /반차/);
});

test('D장 출퇴근은 시·분 선택 UI와 날짜 상세 패널을 사용한다', () => {
  assert.match(html, /id="manualClockInHour"/);
  assert.match(html, /id="manualClockInMinute"/);
  assert.match(html, /id="manualClockOutHour"/);
  assert.match(html, /id="manualClockOutMinute"/);
  assert.match(html, /manualAttendanceDayDetail/);
  assert.match(html, /toggleManualAttendanceDetail/);
});

test('세 종류 추가근무 입력 변경이 실제 합계를 즉시 갱신한다', () => {
  const start = html.indexOf('function overtimeDraftMinutes');
  const end = html.indexOf('function normalizeManualClockTime', start);
  const nodes = {
    '#manualLunchOvertimeRaw': {value: '9'}, '#manualClockoutOvertimeRaw': {value: '10'},
    '#manualEveningOvertimeRaw': {value: '19'}, '#manualOvertimeTotal': {textContent: ''},
  };
  const context = {$: id => nodes[id]};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.updateManualOvertimeTotal=updateManualOvertimeTotal;`, context);
  context.updateManualOvertimeTotal();
  assert.equal(nodes['#manualOvertimeTotal'].textContent, '20분');
  nodes['#manualLunchOvertimeRaw'].value = '20';
  context.updateManualOvertimeTotal();
  assert.equal(nodes['#manualOvertimeTotal'].textContent, '40분');
});

test('실제 input/change 인라인 핸들러를 이벤트 dispatch해 세 입력의 합계가 변경된다', () => {
  const start = html.indexOf('function overtimeDraftMinutes');
  const end = html.indexOf('function normalizeManualClockTime', start);
  const nodes = new Map([
    ['#manualLunchOvertimeRaw', {value: '0'}], ['#manualClockoutOvertimeRaw', {value: '0'}],
    ['#manualEveningOvertimeRaw', {value: '0'}], ['#manualOvertimeTotal', {textContent: '0분'}],
  ]);
  const context = {$: id => nodes.get(id)};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.updateManualOvertimeTotal=updateManualOvertimeTotal;`, context);
  for (const [id, value] of [['manualLunchOvertimeRaw', '10'], ['manualClockoutOvertimeRaw', '20'], ['manualEveningOvertimeRaw', '30']]) {
    const match = html.match(new RegExp(`<input id="${id}"[^>]*oninput="([^"]+)"[^>]*onchange="([^"]+)"`));
    assert.ok(match, `${id} input/change handler가 없습니다.`);
    const listeners = {};
    const element = nodes.get('#' + id);
    element.addEventListener = (type, handler) => { (listeners[type] ||= []).push(handler); };
    element.dispatchEvent = event => { for (const handler of listeners[event.type] || []) handler.call(element, event); };
    for (const type of ['input', 'change']) listeners[type] = [new vm.Script(`(function(){${match[type === 'input' ? 1 : 2]}})`).runInContext(context)];
    element.value = value;
    element.dispatchEvent({type: 'input'});
    assert.notEqual(nodes.get('#manualOvertimeTotal').textContent, '0분');
    element.dispatchEvent({type: 'change'});
  }
  assert.equal(nodes.get('#manualOvertimeTotal').textContent, '60분');
});

test('저장된 반차가 편집 선택값과 날짜 상세에 복원된다', () => {
  const start = html.indexOf('let MANUAL_DETAIL_OPEN');
  const end = html.indexOf('function manualCalendarDate', start);
  const source = html.slice(start, end);
  const context = {today: () => '2026-09-24', esc: value => String(value), $: () => null};
  vm.createContext(context);
  vm.runInContext(`${source};this.manualAttendanceFormHtml=manualAttendanceFormHtml;`, context);
  const output = context.manualAttendanceFormHtml([{work_date: '2026-09-24', half_day: '오후 반차', manual_note: '오후 진료'}]);
  assert.match(output, /<option selected>오후 반차<\/option>/);
  assert.match(output, /오후 반차 · 오후 진료/);
});

test('10분 단위 기존 계산 로직과 경계값 9·10·19를 보존한다', () => {
  const fn = html.match(/function overtimeDraftMinutes\(raw\)\{[\s\S]*?\n}/)?.[0];
  assert.ok(fn);
  assert.match(fn, /Math\.floor\(n\/10\)\*10/);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${fn};this.overtimeDraftMinutes=overtimeDraftMinutes;`, context);
  assert.deepEqual([9, 10, 19].map(n => context.overtimeDraftMinutes(String(n))), [0, 10, 10]);
});

test('저녁 추가근무는 기존 evening boolean과 별도 분 단위 저장 초안과 롤백을 가진다', () => {
  const sql = fs.readFileSync(path.join(root, 'db', 'attendance_manual_evening_overtime_draft.sql'), 'utf8');
  assert.match(sql, /evening_overtime_raw_text/);
  assert.match(sql, /evening_overtime_min/);
  assert.match(sql, /manual_note/);
  assert.match(sql, /half_day/);
  assert.match(sql, /submit_manual_attendance_d/);
  assert.ok(fs.existsSync(path.join(root, 'db', 'attendance_manual_evening_overtime_rollback.sql')));
});
