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

test('schedule print reuses the print lifecycle and clears its class after printing', () => {
  const events = {};
  let printed = 0;
  const classes = new Set();
  const styles = [];
  const context = {
    document: { body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } }, createElement: () => ({remove: () => styles.pop(), textContent: ''}), head: {appendChild: style => styles.push(style)} },
    window: { addEventListener: (n, f) => { events[n] = f; }, removeEventListener: n => { delete events[n]; }, print: () => { printed++; } },
  };
  vm.runInNewContext(`${block('/* schedule-print:test-start */', '/* schedule-print:test-end */')};this.api={printCalendar,printSchedule};`, context);
  context.api.printSchedule();
  assert.equal(printed, 1);
  assert.equal(classes.has('schedule-printing'), true);
  assert.equal(styles.length, 1);
  events.afterprint();
  assert.equal(classes.has('schedule-printing'), false);
  assert.equal(styles.length, 0);
  context.api.printCalendar();
  assert.equal(classes.has('calendar-printing'), true);
  events.afterprint();
  assert.equal(classes.has('calendar-printing'), false);
});

test('monthly and weekly schedule renders expose PDF and print actions with whole-month print CSS', () => {
  assert.match(hr, /schedule-actions[\s\S]*printSchedule\('pdf'\)/);
  assert.match(hr, /schedule-actions[\s\S]*printSchedule\('print'\)/);
  assert.match(hr, /schedule-printing[\s\S]*overflow:\s*visible/);
  assert.match(hr, /schedule-week-block[\s\S]*page-break-inside:\s*avoid/);
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
  for (const table of ['schedule_people','deposits','attendance_manual_entries','leave_application_documents']) assert.match(sql, new RegExp(table));
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /enable row level security/i);
  assert.match(rollback, /contracts_select_scoped/);
  assert.match(rollback, /invalid profile role/);
});
