const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const hr = fs.readFileSync('hr.html', 'utf8');

function block(start, end) {
  const a = hr.indexOf(start);
  const b = hr.indexOf(end, a);
  assert.notEqual(a, -1, `missing marker: ${start}`);
  assert.notEqual(b, -1, `missing marker: ${end}`);
  return hr.slice(a + start.length, b);
}

function schedulePrintHarness(details = [{ open: false }, { open: true }, { open: false, unrelated: true }]) {
  const events = new Map();
  let printed = 0;
  const classes = new Set();
  const styles = [];
  const scheduleDetails = details.filter(item => !item.unrelated);
  const context = {
    document: {
      body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
      querySelectorAll: selector => {
        assert.equal(selector, '#main details.schedule-role-cell');
        return scheduleDetails;
      },
      createElement: () => ({remove: () => styles.pop(), textContent: ''}),
      head: {appendChild: style => styles.push(style)}
    },
    window: {
      addEventListener: (name, fn) => { const list = events.get(name) || []; list.push(fn); events.set(name, list); },
      removeEventListener: (name, fn) => events.set(name, (events.get(name) || []).filter(handler => handler !== fn)),
      print: () => { printed++; dispatch('beforeprint'); }
    },
  };
  function dispatch(name) { for (const handler of [...(events.get(name) || [])]) handler(); }
  vm.runInNewContext(`${block('/* schedule-print:test-start */', '/* schedule-print:test-end */')};this.api={printCalendar,printSchedule};`, context);
  return { context, api: context.api, classes, details, scheduleDetails, styles, events, dispatch, get printed() { return printed; } };
}

test('schedule print expands role details and restores mixed original states after printing', () => {
  const h = schedulePrintHarness();
  h.api.printSchedule();
  assert.equal(h.printed, 1);
  assert.equal(h.classes.has('schedule-printing'), true);
  assert.equal(h.styles.length, 1);
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [true, true]);
  assert.equal(h.details[2].open, false, 'unrelated details must remain untouched');
  h.dispatch('afterprint');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [false, true]);
  assert.equal(h.classes.has('schedule-printing'), false);
  assert.equal(h.styles.length, 0);
});

test('Ctrl+P beforeprint reentry preserves the first snapshot and duplicate afterprint is harmless', () => {
  const h = schedulePrintHarness();
  h.dispatch('beforeprint');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [true, true]);
  h.dispatch('beforeprint');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [true, true]);
  h.dispatch('afterprint');
  h.dispatch('afterprint');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [false, true]);
  assert.equal(h.classes.has('schedule-printing'), false, 'browser menu print does not need the app print class');
});

test('missing afterprint falls back on focus after the print dialog closes', () => {
  const h = schedulePrintHarness();
  h.dispatch('beforeprint');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [true, true]);
  h.dispatch('focus');
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [false, true]);
});

test('beforeprint syncs selected print labels from the live checkbox state', () => {
  const labels = [true, false].map(checked => {
    const classes = new Set();
    return { checked, classes, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) }, querySelector: () => ({ checked }) };
  });
  const detail = { open: false, querySelectorAll: selector => { assert.equal(selector, '.schedule-check'); return labels; } };
  const h = schedulePrintHarness([detail]);
  h.dispatch('beforeprint');
  assert.equal(labels[0].classes.has('schedule-selected'), true);
  assert.equal(labels[1].classes.has('schedule-selected'), false);
});

test('schedule cells mark selected names and keep empty and leave summaries', () => {
  const start = hr.indexOf('function scheduleRoleCell(');
  const end = hr.indexOf('\nasync function toggleScheduleRoleMember', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = {
    scheduleDayForDate: () => 1,
    scheduleRolePeople: (_role, people) => people,
    scheduleRoleColor: () => 'role-dr',
    schedulePersonLabel: person => person.name,
    esc: value => String(value),
    leaveDisplayText: value => value
  };
  vm.runInNewContext(`${hr.slice(start, end)};this.render=scheduleRoleCell;`, context);
  const people = [
    { id: 1, name: '가상 Dr 정원장', department: 'Dr.', active: true, included_in_schedule: true },
    { id: 2, name: '가상 미선택 Dr', department: 'Dr.', active: true, included_in_schedule: true }
  ];
  const rows = [{ person_id: 1, week_start: '2026-09-21', day: 1, shift: 'work' }];
  const markup = context.render('Dr.', '2026-09-21', '2026-09-21', people, rows, {}, true);
  assert.match(markup, /schedule-check role-dr schedule-selected/);
  assert.match(markup, /가상 Dr 정원장/);
  assert.match(markup, /가상 미선택 Dr/);
  assert.match(markup, /Dr\. · 1명/);
  const empty = context.render('Dr.', '2026-09-21', '2026-09-21', people, [], {}, true);
  assert.match(empty, /Dr\. · 0명/);
  assert.doesNotMatch(empty, /schedule-selected/);
  assert.match(context.render('연차·반차', '2026-09-21', '2026-09-21', [], [], { fixture: { date: '2026-09-21', label: '연차' } }, true), /schedule-leave-list">연차/);
});

test('calendar printing does not expand schedule details', () => {
  const h = schedulePrintHarness();
  h.api.printCalendar();
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [false, true]);
  h.dispatch('afterprint');
  assert.equal(h.classes.has('calendar-printing'), false);
});

test('schedule print lifecycle cleans up if window.print throws', () => {
  const h = schedulePrintHarness();
  h.context.window.print = () => { h.dispatch('beforeprint'); throw new Error('print unavailable'); };
  assert.throws(() => h.api.printSchedule(), /print unavailable/);
  assert.deepEqual(h.scheduleDetails.map(detail => detail.open), [false, true]);
  assert.equal(h.classes.has('schedule-printing'), false);
  assert.equal(h.styles.length, 0);
});

test('schedule and calendar print lifecycles both clear their class after afterprint', () => {
  const h = schedulePrintHarness();
  h.api.printSchedule();
  h.dispatch('afterprint');
  assert.equal(h.classes.has('schedule-printing'), false);
  assert.equal(h.styles.length, 0);
  h.api.printCalendar();
  h.dispatch('afterprint');
  assert.equal(h.classes.has('calendar-printing'), false);
});

test('monthly and weekly schedule renders expose PDF and print actions with whole-month print CSS', () => {
  assert.match(hr, /schedule-actions[\s\S]*printSchedule\('pdf'\)/);
  assert.match(hr, /schedule-actions[\s\S]*printSchedule\('print'\)/);
  assert.match(hr, /schedule-printing[\s\S]*overflow:\s*visible/);
  assert.match(hr, /schedule-week-block[\s\S]*page-break-inside:\s*avoid/);
  assert.match(hr, /schedule-check:not\(\.schedule-selected\)\{display:none!important\}/);
  assert.match(hr, /schedule-check input\{display:none!important\}/);
  assert.match(hr, /schedule-check-list\{display:contents!important/);
  assert.match(hr, /@page\s*\{[^}]*size:\s*A4\s+landscape/);
  assert.doesNotMatch(hr.slice(0, hr.indexOf('</head>')), /@page\s*\{[^}]*size:\s*A4\s+landscape/);
  assert.match(hr, /schedule-printing[\s\S]*createElement\(['"]style['"]\)/);
  for (const className of ['calendar-printing','leave-printing','payslip-printing']) assert.match(hr, new RegExp(className));
});

test('deputy sees only the contract tab while existing roles keep their role-based tabs', () => {
  const menu = block('/* menu-restructure:test-start */', '/* menu-restructure:test-end */');
  const ctx = { ME: {}, TAB_OVERRIDES: {}, TAB_ROLES: {}, TABS: [
    {key:'home',roles:['staff','manager','chief','owner']},
    {key:'att',roles:['staff','manager','chief','owner']},
    {key:'contract',roles:['staff','manager','chief','owner']},
    {key:'owner',roles:['owner']},
  ], MENU: [] };
  vm.runInNewContext(`${menu};this.visible=visibleTabKeys;`, ctx);
  for (const role of ['staff', 'manager', 'chief', 'owner']) {
    ctx.ME = { id: 'u', role, confidAccess: true };
    assert.ok([...ctx.visible()].length >= 2, role);
  }
  ctx.ME = { id: 'u', role: 'deputy', confidAccess: true };
  assert.deepEqual([...ctx.visible()], ['contract']);
});

test('role migration and rollback explicitly allow deputy without widening contract-only access', () => {
  const sql = fs.readFileSync('db/deputy_contract_only_draft.sql', 'utf8');
  const rollback = fs.readFileSync('db/deputy_contract_only_rollback.sql', 'utf8');
  assert.match(sql, /role\s+in\s*\([^)]*'deputy'/i);
  assert.match(sql, /p_value\s+not\s+in\s*\([^)]*'deputy'/i);
  assert.match(sql, /deputy_contract_only_block/);
  assert.match(sql, /rollback/i);
  assert.match(sql, /contracts_select_deputy_self/);
  for (const table of ['schedule_people','deposits','attendance_manual_entries','attendance_manual_revisions','attendance_issue_resolutions','leave_application_documents']) assert.match(sql, new RegExp(table));
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /enable row level security/i);
  assert.match(rollback, /contracts_select_scoped/);
  assert.match(rollback, /invalid profile role/);
  const pdfMigration = fs.readFileSync('db/20260924_deputy_contract_pdf_role_access.sql', 'utf8');
  const pdfRollback = fs.readFileSync('db/20260924_deputy_contract_pdf_role_access_rollback.sql', 'utf8');
  assert.match(pdfMigration, /record_contract_pdf_signature[\s\S]*deputy/);
  assert.match(pdfRollback, /record_contract_pdf_signature/);
  assert.match(fs.readFileSync('db/attendance_issue_resolution_release.sql', 'utf8'), /deputy cannot submit attendance issues/);
  assert.match(fs.readFileSync('db/attendance_manual_v2.sql', 'utf8'), /deputy cannot submit manual attendance/);
  assert.match(fs.readFileSync('db/20260924_deputy_hr_docs_contract_only.sql', 'utf8'), /hr-docs[\s\S]*contracts\//);
  assert.match(fs.readFileSync('supabase/functions/contract-pdf-sign/index.ts', 'utf8'), /record_contract_pdf_signature_with_use/);
});
