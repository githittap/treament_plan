/* 병원 휴진·단축 진료 → 구글 특별 영업시간 연동(T8 9차 B): 화면 순수 함수·글 키 등록·「단축」을 휴일로 세지 않는 계산 + PGlite DB 시험 */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const hr = read('hr.html'), texts = read('hub-texts.js'), payroll = read('payroll-reply.js');
const pkg = process.env.PGLITE_PACKAGE_ROOT || 'Z:/09_claude-output/_tmp/pglite-0.5.8/node_modules/@electric-sql/pglite';

const block = hr.match(/\/\* holiday-gbp:test-start \*\/[\s\S]*?\/\* holiday-gbp:test-end \*\//)?.[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext('function hubT(k,d,v){return v?String(d).replace(/\\{([a-z_]+)\\}/g,(m,n)=>Object.prototype.hasOwnProperty.call(v,n)?String(v[n]):m):String(d);}' + block +
  ';this.toRow=holidayGbpFormToRow;this.label=holidayGbpLabel;this.kindLabel=holidayGbpKindLabel;this.err=holidayGbpErrText;this.act=holidayGbpActionLabel;this.res=holidayGbpResultLabel;this.saveKey=holidayGbpSaveErrKey;this.sent=holidayGbpSentText;this.live=holidayGbpSyncLive;', ctx);

test('입력 검증: 날짜·사유 필수, 단축은 시각 둘 필수·여는 시각이 더 빨라야 하고 휴진류는 시각을 비움', () => {
  const ok = { date: '2026-12-01', kind: '지정휴일', name: ' 학회 ', open: '09:00', close: '13:00', sync: true };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.toRow(ok))), { row: { date: '2026-12-01', name: '학회', kind: '지정휴일', open_time: null, close_time: null, sync_gbp: true } });
  assert.equal(ctx.toRow({ ...ok, date: '' }).error, 'err_date');
  assert.equal(ctx.toRow({ ...ok, name: '  ' }).error, 'err_reason');
  const short = { ...ok, kind: '단축' };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.toRow(short).row)), { date: '2026-12-01', name: '학회', kind: '단축', open_time: '09:00', close_time: '13:00', sync_gbp: true });
  assert.equal(ctx.toRow({ ...short, open: '' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...short, close: '' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...short, open: '13:00', close: '13:00' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...short, open: '14:00', close: '13:00' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...short, open: '09:00:00', close: '13:00:00' }).row.open_time, '09:00', 'DB의 HH:MM:SS도 HH:MM으로');
  assert.equal(ctx.toRow({ ...ok, kind: '공휴일', sync: false }).row.sync_gbp, false);
  assert.equal(ctx.toRow({ ...ok, kind: '엉터리' }).row.kind, '지정휴일', '모르는 종류는 휴진으로(DB 제약 위반 방지)');
});

test('공휴일 진료 방식(365치과): 평소=구글 안 보냄 · 단축=시각+보냄 · 휴진=시각 없음+보냄', () => {
  const base = { date: '2026-12-25', kind: '공휴일', name: '성탄절', open: '10:00', close: '14:00', sync: true };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.toRow({ ...base, mode: 'normal' }).row)), { date: '2026-12-25', name: '성탄절', kind: '공휴일', open_time: null, close_time: null, sync_gbp: false });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.toRow({ ...base, mode: 'short' }).row)), { date: '2026-12-25', name: '성탄절', kind: '공휴일', open_time: '10:00', close_time: '14:00', sync_gbp: true });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.toRow({ ...base, mode: 'closed' }).row)), { date: '2026-12-25', name: '성탄절', kind: '공휴일', open_time: null, close_time: null, sync_gbp: true });
  assert.equal(ctx.toRow({ ...base, mode: 'short', open: '' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...base, mode: 'short', open: '15:00' }).error, 'err_time');
  assert.equal(ctx.toRow({ ...base, mode: undefined }).row.sync_gbp, false, '모르는 방식은 평소 진료(안 보냄)');
  assert.equal(ctx.label({ name: '성탄절', kind: '공휴일', open_time: '10:00:00', close_time: '14:00:00' }), '성탄절 10:00~14:00');
  assert.equal(ctx.saveKey({ message: 'holiday_public_lead_only' }), 'err_public_lead');
  assert.match(ctx.err('err_gone'), /이미 바뀌었거나 지워진/);
});

test('표시 글: 종류·동작·결과 이름, 캘린더 단축 표시', () => {
  assert.equal(ctx.kindLabel('지정휴일'), '휴진');
  assert.equal(ctx.kindLabel('단축'), '단축 진료');
  assert.equal(ctx.kindLabel('공휴일'), '공휴일');
  assert.equal(ctx.label({ name: '학회', kind: '단축', open_time: '09:00:00', close_time: '13:00:00' }), '학회 09:00~13:00');
  assert.equal(ctx.label({ name: '학회', kind: '지정휴일' }), '학회');
  assert.equal(ctx.label({ name: '추석', kind: '공휴일', open_time: null, close_time: null }), '추석');
  assert.deepEqual(['set', 'clear', 'noop', 'error'].map(ctx.act), ['등록', '삭제', '변경 없음', '오류']);
  assert.deepEqual(['ok', 'failed', 'skipped'].map(ctx.res), ['성공', '실패', '건너뜀']);
  assert.match(ctx.err('err_save', 'boom'), /boom/);
});

test('화면에 쓰는 글은 전부 hub-texts.js에 같은 기본값으로 등록돼 원장이 고칠 수 있다', () => {
  const used = new Map();
  for (const m of hr.matchAll(/hubT\('(hgbp\.[a-z_]+)','((?:[^'\\]|\\.)*)'/g)) used.set(m[1], m[2]);
  const reg = new Map();
  for (const m of texts.matchAll(/add\('(hgbp\.[a-z_]+)',HG,'(?:[^'\\]|\\.)*','((?:[^'\\]|\\.)*)'/g)) reg.set(m[1], m[2]);
  assert.equal(reg.size, 64);
  assert.ok(used.size >= 30);
  for (const [k, d] of used) { assert.ok(reg.has(k), '미등록 키: ' + k); assert.equal(reg.get(k), d, '기본값 불일치: ' + k); }
  // 동작·결과 이름 등 화면 코드에서 간접으로 쓰는 키도 등록돼 있음
  for (const k of ['hgbp.act_set', 'hgbp.act_clear', 'hgbp.act_noop', 'hgbp.act_error', 'hgbp.res_ok', 'hgbp.res_failed', 'hgbp.res_skipped', 'hgbp.err_exists']) assert.ok(reg.has(k), k);
  assert.match(hr, /hubTextDefsHolidayGbp|hgbpBox/);
  assert.match(texts, /hubTextDefsHolidayGbp\(add\);/);
});

test('입력 권한(원장 11-25): 원장·실장·매니저·데스크 — 카드·저장·삭제 모두 canEditClinicHours 가드, 공휴일 행은 원장·실장만', () => {
  assert.match(hr, /async function renderHolidayGbpCard\(box\)\{\n  if\(!box\|\|!canEditClinicHours\(\)\)return;/);
  assert.match(hr, /async function saveHolidayGbp\(\)\{\n  if\(!canEditClinicHours\(\)\|\|HGBP_BUSY\)return;/);
  assert.match(hr, /async function deleteHolidayGbp\(date\)\{\n  if\(!canEditClinicHours\(\)\|\|HGBP_BUSY\)return;/);
  assert.match(hr, /if\(typeof canEditClinicHours==='function'&&canEditClinicHours\(\)&&m&&typeof m\.appendChild==='function'[^\n]*renderHolidayGbpCard\(hbox\)/);
  assert.match(hr, /const isLead=\(\)=>\['chief','owner'\]\.includes\(ME\.role\);/);
  assert.match(hr, /ME\.department=p\?\.dept\|\|'';ME\.jobGroup=p\?\.job_group\|\|'';/);
  const c = {};
  vm.createContext(c);
  vm.runInContext('var ME={};function isLead(){return ["chief","owner"].includes(ME.role);}' + block + ';this.can=canEditClinicHours;this.kinds=holidayGbpKindsForMe;this.rowOk=holidayGbpRowEditable;this.rowDel=holidayGbpRowDeletable;this.mode=holidayGbpPublicMode;this.setMe=m=>{ME=m;};', c);
  const can = me => { c.setMe(me); return c.can(); };
  assert.deepEqual([
    can({ role: 'owner' }), can({ role: 'chief' }), can({ role: 'manager' }),
    can({ role: 'staff', jobGroup: 'desk' }), can({ role: 'staff', department: '데스크' }),
    can({ role: 'staff', jobGroup: 'clinical_consult', department: '진료실' }), can({ role: 'deputy', jobGroup: 'desk' }), can({ role: 'staff' })
  ], [true, true, true, true, true, false, false, false]);
  c.setMe({ role: 'manager' });
  assert.deepEqual(Array.from(c.kinds()), ['지정휴일', '단축']);
  assert.equal(c.rowOk({ kind: '공휴일' }), true, '매니저도 공휴일의 진료 방식은 고침');
  assert.equal(c.rowDel({ kind: '공휴일' }), false, '공휴일 삭제는 실장·원장만');
  assert.equal(c.rowDel({ kind: '단축' }), true);
  c.setMe({ role: 'staff', jobGroup: 'clinical_consult' });
  assert.equal(c.rowOk({ kind: '단축' }), false);
  c.setMe({ role: 'chief' });
  assert.deepEqual(Array.from(c.kinds()), ['지정휴일', '단축', '공휴일']);
  assert.equal(c.rowOk({ kind: '공휴일' }), true);
  assert.equal(c.rowDel({ kind: '공휴일' }), true);
  assert.deepEqual([c.mode({ sync_gbp: false }), c.mode({ sync_gbp: true, open_time: '10:00:00', close_time: '14:00:00' }), c.mode({ sync_gbp: true })], ['normal', 'short', 'closed']);
  assert.match(hr, /const kindOpts=\(lockPublic\?\['공휴일'\]:holidayGbpKindsForMe\(\)\)\.map\(/);
  assert.match(hr, /const lockPublic=pub&&!isLead\(\);/);
  assert.match(hr, /\$\{holidayGbpRowEditable\(h\)\?`<button class="mini" onclick="editHolidayGbp/);
});

test('월말 입력 알림: 매달 마지막 월요일~말일에만, 다음 달 범위, 설정으로 끔, 「다 넣었음」은 그달만', () => {
  const src = ['holidayGbpRemindDue', 'holidayGbpNextMonthRange'].map(n => hr.match(new RegExp('function ' + n + '\\(day\\)\\{[\\s\\S]*?\\n\\}'))[0]).join('\n');
  const c = {};
  vm.createContext(c);
  vm.runInContext(src + ';this.due=holidayGbpRemindDue;this.next=holidayGbpNextMonthRange;', c);
  // 2026-11: 마지막 월요일 11-30 · 2026-12: 12-28 · 2027-02: 02-22 · 2026-08: 08-31(말일이 월요일)
  assert.deepEqual(['2026-11-29', '2026-11-30'].map(c.due), [false, true]);
  assert.deepEqual(['2026-12-27', '2026-12-28', '2026-12-31', '2027-01-01'].map(c.due), [false, true, true, false]);
  assert.deepEqual(['2027-02-21', '2027-02-22', '2027-02-28'].map(c.due), [false, true, true]);
  assert.deepEqual(['2026-08-30', '2026-08-31'].map(c.due), [false, true]);
  assert.equal(c.due('엉터리'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(c.next('2026-12-28'))), { month: 1, from: '2027-01-01', to: '2027-02-01' });
  assert.deepEqual(JSON.parse(JSON.stringify(c.next('2026-11-30'))), { month: 12, from: '2026-12-01', to: '2027-01-01' });
  const fn = hr.slice(hr.indexOf('async function maybeShowHolidayGbpReminder'), hr.indexOf('function holidayGbpRemindGo'));
  assert.match(fn, /if\(HGBP_REMIND_SHOWN\|\|!canEditClinicHours\(\)\)return;/);
  assert.match(fn, /hubSettingBoolean\('hgbp\.remind_on',true\)/);
  assert.match(fn, /localStorage\.getItem\(holidayGbpRemindKey\(day\)\)/);
  assert.match(fn, /document\.getElementById\('hubIntro'\)/, '첫 화면(3D)이 닫힌 뒤에 띄움');
  assert.match(fn, /\.or\('kind\.neq\.공휴일,sync_gbp\.eq\.true'\)/, '평소 진료 공휴일은 세지 않음');
  assert.match(fn, /holidayGbpSyncLive\(\)\?hubT\('hgbp\.remind_body'[^\n]*:hubT\('hgbp\.remind_body_off'/, '연동이 꺼져 있으면 구글 반영을 약속하지 않음');
  assert.match(fn, /if\(document\.getElementById\('hubIntro'\)\)return;/);
  assert.match(hr, /function holidayGbpRemindGo\(\)\{hide\('hgbpRemindMask'\);if\(typeof CAL_VIEW!=='undefined'\)CAL_VIEW='all';go\('calendar'\);/);
  assert.match(hr, /renderNav\(\);await render\(\);await refreshBadges\(\);\n      if\(typeof maybeShowHolidayGbpReminder==='function'\)maybeShowHolidayGbpReminder\(\);/);
  assert.match(hr, /function holidayGbpRemindDone\(\)\{try\{localStorage\.setItem\(holidayGbpRemindKey\(HGBP_REMIND_DAY\|\|today\(\)\),'1'\);/);
  assert.match(texts, /\{key:'hgbp\.remind_on',[^\n]*def:'true',kind:'bool'\}/);
});

test('수정·삭제가 0행이면 「저장됨」이 아니라 다시 불러오고 알림(Sol 사후 B5)', () => {
  const save = hr.slice(hr.indexOf('async function saveHolidayGbp'), hr.indexOf('async function deleteHolidayGbp'));
  assert.match(save, /\.update\(r\.row\)\.eq\('date',editDate\)\.select\('date'\)/);
  assert.match(save, /if\(editDate&&!\(data&&data\.length\)\)\{[^\n]*holidayGbpErrText\('err_gone'\)/);
  const del = hr.slice(hr.indexOf('async function deleteHolidayGbp'), hr.indexOf('async function deleteHolidayGbp') + 1200);
  assert.match(del, /\.delete\(\)\.eq\('date',date\)\.select\('date'\)/);
  assert.match(del, /if\(!\(data&&data\.length\)\)\{[^\n]*holidayGbpErrText\('err_gone'\)/);
});

test('Sol 2차 고침: 보낼 값 표시 · 공휴일 체크칸 숨김 · 취소 중 저장 · 근태 업로드 날짜 순서 · 카드 이동', () => {
  assert.equal(ctx.sent({ closed: true }), '보낼 값: 휴무');
  assert.equal(ctx.sent({ open_time: '10:00', close_time: '14:00:00' }), '보낼 값: 10:00~14:00');
  assert.equal(ctx.sent({ openTime: { hours: 9, minutes: 30 }, closeTime: { hours: 13 } }), '보낼 값: 09:30~13:00');
  assert.equal(ctx.sent('{"closed":true}'), '보낼 값: 휴무');
  assert.equal(ctx.sent(null), '');
  assert.equal(ctx.sent({ x: 1 }), '{"x":1}');
  assert.match(hr, /\.hgbp-form \[hidden\]\{display:none!important\}/);
  assert.match(hr, /select\('id,holiday_date,action,sent_value,result,error,created_at'\)/);
  const save = hr.slice(hr.indexOf('async function saveHolidayGbp'), hr.indexOf('async function deleteHolidayGbp'));
  assert.match(save, /const form=document\.querySelector\('#hgbpCard \.hgbp-form'\);if\(!form\|\|String\(HGBP_GEN\)!==form\.dataset\.gen\)return;/, '새 폼이 그려지기 전엔 저장 안 함(Sol 3차 B1)');
  assert.match(save, /const gen=HGBP_GEN,editDate=form\.dataset\.edit\|\|null;/, '고칠 날짜는 화면에 보이는 폼에서');
  assert.match(save, /if\(gen!==HGBP_GEN\)\{setStatus\(error\?'error':'saved'\);return;\}/, '늦게 온 응답은 새 편집 화면을 건드리지 않음');
  assert.match(hr, /<div class="hgbp-form" data-edit="\$\{ed\?esc\(ed\.date\):''\}" data-gen="\$\{gen\}">/);
  assert.match(hr, /const gen=\+\+HGBP_GEN;\{const b0=box\.querySelector&&box\.querySelector\('#hgbpSaveBtn'\);if\(b0\)b0\.disabled=true;\}/);
  assert.match(hr, /if\(box\.isConnected===false\|\|gen!==HGBP_GEN\)return;/);
  const del = hr.slice(hr.indexOf('async function deleteHolidayGbp'), hr.indexOf('async function deleteHolidayGbp') + 1500);
  assert.match(del, /const gen=HGBP_GEN;[^\n]*\n  if\(gen!==HGBP_GEN\)\{setStatus/);
  assert.match(hr, /String\(error\.message\|\|''\)\.includes\('leave_days_stale'\)\?hubT\('hgbp\.err_leave_days_stale'/, '연차 일수 재계산 안내');
  assert.match(save, /if\(editDate&&!\(data&&data\.length\)\)/);
  assert.ok(!/if\(HGBP_EDIT&&!\(data/.test(save), '응답 판정에 바뀔 수 있는 HGBP_EDIT를 쓰지 않음');
  assert.match(hr, /is_holiday:holi\.has\(r\.ds\)\};\}\)\.sort\(\(a,b\)=>a\.work_date<b\.work_date\?-1:a\.work_date>b\.work_date\?1:0\);/);
  assert.match(hr, /function holidayGbpRemindGo\(\)\{[^\n]*setInterval\(/);
  const fixc = read('db/holiday_fix_20261125c.sql');
  assert.match(fixc, /where y\.d is not null order by y\.d\n  loop\n    perform pg_advisory_xact_lock/);
  assert.match(texts, /\{key:'gbp\.sync_live',[^\n]*미리보기/);
});

test('연동 주기 문구: 매일이 아니라 매월 1일·원장 지시 때(원장 11-25)', () => {
  const sec = texts.slice(texts.indexOf('function hubTextDefsHolidayGbp'), texts.indexOf('function hubTextDefs()'));
  assert.ok(!/매일/.test(sec), 'hgbp 글에 「매일」이 남지 않음');
  assert.match(sec, /매월 1일/);
  assert.ok(!/매일/.test(hr.slice(hr.indexOf('async function renderHolidayGbpCard'), hr.indexOf('function moreHolidayGbp'))));
  assert.ok(!/매일 1회|매일 `gbp_special_hours_due/.test(read('docs/gbp-special-hours-contract.md')));
});

test('「단축」은 쉬는 날이 아님: 연차 일수·휴일근무 표시·노무사 회신 공휴일 집합에서 뺀다', () => {
  assert.match(hr, /async function computeLeaveDays[\s\S]*?holiSet=new Set\(\(await sb\.from\('holidays'\)\.select\('date,kind'\)\)\.data\?\.filter\(h=>h\.kind!=='단축'\)/);
  assert.match(hr, /const holi=new Set\(\(await sb\.from\('holidays'\)\.select\('date,kind'\)\)\.data\?\.filter\(h=>h\.kind!=='단축'\)/);
  assert.match(payroll, /select\('date,name,kind'\)\.gte\('date',start\)\.lt\('date',next\)/);
  assert.match(payroll, /\(results\[3\]\.data\|\|\[\]\)\.filter\(r=>r\.kind!=='단축'\)\.map\(r=>r\.date\)/);
  // 캘린더 날짜 색(빨간 날)은 휴진·공휴일일 때만
  assert.match(hr, /const dCls=info\.holidays\.some\(h=>h\.kind!=='단축'\)\?'hol':/);
  assert.match(hr, /holiday:h\.kind!=='단축'/);
});

test('캐시 방지 버전: 바뀐 payroll-reply.js는 새 쿼리 버전으로, 달력·첫 화면은 새 칸이 없어도 옛 칸으로 다시 읽음', () => {
  const v = hr.match(/<script src="payroll-reply\.js\?v=(\d+)"><\/script>/)?.[1];
  assert.ok(v && Number(v) > 2026101110, 'payroll-reply.js 버전을 올려야 함: ' + v);
  assert.equal((hr.match(/holidayRead\('date,name,kind,open_time,close_time'\)\.then\(r=>r\.error\?holidayRead\('date,name,kind'\):r\)/g) || []).length, 2, '달력·첫 화면 둘 다 새 칸 읽기 실패 시 옛 칸으로 재시도');
  assert.ok(!/sb\.from\('holidays'\)\.select\('date,name,kind,open_time,close_time'\)/.test(hr), '새 칸을 직접 고르는 읽기는 카드(실장·원장)뿐');
});

test('DB 초안: 마이그레이션·롤백·시드가 짝으로 있고 서비스 롤만 기록을 쓴다', () => {
  const sql = read('db/holiday_gbp_sync.sql'), rb = read('db/holiday_gbp_sync_rollback.sql'), seed = read('db/holidays_2027_public_seed.sql');
  assert.match(sql, /grant execute on function public\.gbp_special_hours_log_write\([^)]*\) to service_role;/);
  assert.match(sql, /revoke all on function public\.gbp_special_hours_log_write\([^)]*\) from public, anon, authenticated;/);
  assert.match(sql, /using \(public\.my_role\(\) in \('chief','owner'\)\)/);
  assert.match(sql, /create policy employee_hub_access_gate on public\.gbp_special_hours_sync_log\s+as restrictive for all to authenticated\s+using \(public\.employee_hub_access_allowed\(\)\)/);
  assert.ok(!/_install_employee_hub_access_gate/.test(sql.replace(/--[^\n]*/g, '')), '없어진 도우미 함수에 기대지 않음');
  assert.match(sql, /if fresh then\s+update public\.holidays set sync_gbp=false/);
  assert.match(read('db/holidays_2027_public_seed_rollback.sql'), /sync_gbp=false and updated_by is null/);
  for (const f of ['db/leave_edit_records.sql', 'db/under_year_monthly_leave_20261003.sql']) assert.match(read(f), /h\.date=d::date and h\.kind is distinct from '단축'\)/, f);
  assert.match(sql, /h\.kind is distinct from ''단축''/);
  assert.match(rb, /drop table if exists public\.gbp_special_hours_sync_log/);
  assert.ok(!/insert into public\.holidays[^;]*,true/i.test(seed), '시드는 구글 전송을 켜지 않음');
  assert.equal((seed.match(/\('2027-\d\d-\d\d'/g) || []).length, 24);
});

test('PGlite: 단축 일수 계산·제약·RLS·기록 권한·2027 시드·롤백', { skip: !fs.existsSync(path.join(pkg, 'dist/index.js')) && 'PGLITE_PACKAGE_ROOT 없음' }, () => {
  const log = execFileSync(process.execPath, ['tests/sql/pglite-holiday-gbp-sync.mjs'], { cwd: root, env: { ...process.env, PGLITE_PACKAGE_ROOT: pkg }, encoding: 'utf8', timeout: 120000 });
  assert.match(log, /PGLITE_HOLIDAY_GBP_SYNC_PASS/);
  assert.equal((log.match(/PGLITE_HOLIDAY_GBP_SCENARIO_PASS/g) || []).length, 9, 'B1·B2·B4·E1·F1·F2·F3·F4·F5 시나리오 9개 통과');
});

test('B1·B2 오류 코드는 화면 글로 바뀐다(저장·삭제 둘 다)', () => {
  assert.equal(ctx.saveKey({ message: 'holiday_conflicts_leave', code: 'P0001' }), 'err_leave_conflict');
  assert.equal(ctx.saveKey({ message: 'holiday_month_closed' }), 'err_month_closed');
  assert.equal(ctx.saveKey({ code: '23505', message: 'duplicate key' }), 'err_exists');
  assert.equal(ctx.saveKey({ message: 'boom' }), 'err_save');
  assert.equal(ctx.saveKey(null), 'err_save');
  assert.match(ctx.err('err_leave_conflict'), /날짜 바꾸기/);
  assert.match(ctx.err('err_month_closed'), /확정/);
  assert.match(hr, /msg\.textContent=holidayGbpErrText\(holidayGbpSaveErrKey\(error\),error\.message\)/);
  const del = hr.match(/async function deleteHolidayGbp[\s\S]*?\n\}/)[0];
  assert.match(del, /holidayGbpSaveErrKey\(error\)/, '삭제가 막혀도 사유가 보임');
  const sql = read('db/holiday_gbp_sync.sql');
  assert.match(sql, /raise exception 'holiday_conflicts_leave'/);
  assert.match(sql, /raise exception 'holiday_month_closed'/);
  assert.match(sql, /create trigger holidays_guard_status_change after insert or update or delete on public\.holidays/);
});

test('B3 구글 자동 반영을 약속하지 않음: gbp.sync_live 꺼짐이 기본, 꺼짐이면 「아직 연결 전」·「보낼 대상으로 표시」', () => {
  assert.equal(ctx.live(), false, '설정 함수가 없거나 값이 없으면 꺼짐');
  assert.match(texts, /\{key:'gbp\.sync_live',[^\n]*def:'false',kind:'bool'\}/);
  assert.match(hr, /const live=holidayGbpSyncLive\(\);/);
  assert.match(hr, /live\?`<div class="hint">\$\{esc\(hubT\('hgbp\.notice_on'/);
  assert.match(texts, /add\('hgbp\.notice_off',HG,'[^']*','구글 자동 반영은 아직 연결 전입니다 — 지금은 기록만 됩니다\./);
  assert.match(texts, /add\('hgbp\.f_sync_off',HG,'[^']*','구글에 보낼 대상으로 표시'\)/);
  assert.match(hr, /live\?hubT\('hgbp\.f_sync','[^']*'\):hubT\('hgbp\.f_sync_off'/);
  assert.ok(!/자동으로 반영됩니다/.test(hr + texts), '자동 반영 단정 문구 없음');
  // 켜지면(설정 true) 켜짐으로 읽힘
  const c2 = {}; vm.createContext(c2);
  vm.runInContext("function hubSettingBoolean(k,d){return k==='gbp.sync_live'?true:d;}" + block + ';this.live=holidayGbpSyncLive;', c2);
  assert.equal(c2.live(), true);
  const doc = read('docs/gbp-special-hours-contract.md');
  assert.match(doc, /gbp\.sync_live/);
  assert.match(doc, /\*\*첫 가동 순서[^\n]*/);
  assert.match(doc, /스위치가 꺼져 있는 동안에는 `set`·`clear`를 절대 하지 않음/);
});

test('B4 롤백은 백업 표를 먼저 만들고 복원 SQL이 짝으로 있음', () => {
  const rb = read('db/holiday_gbp_sync_rollback.sql'), rs = read('db/holiday_gbp_sync_restore.sql');
  assert.ok(rb.indexOf('holidays_gbp_backup_20261123') < rb.indexOf('drop table if exists public.gbp_special_hours_sync_log'), '백업이 삭제보다 먼저');
  assert.match(rb, /gbp_special_hours_sync_log_backup_20261123/);
  assert.ok(!/drop table[^;]*backup_20261123/.test(rb), '백업 표는 지우지 않음');
  assert.match(rs, /holidays_gbp_backup_20261123/);
  assert.match(read('docs/gbp-special-hours-contract.md'), /holiday_gbp_sync_restore\.sql/);
});

test('B5 목록 「더 보기」: 60줄 상한을 넘는 일정도 끝까지 열 수 있음', () => {
  assert.match(hr, /\.limit\(HGBP_LIMIT\+1\)/, '한 줄 더 읽어 뒤가 있는지 확인');
  assert.match(hr, /const hasMore=rows\.length>HGBP_LIMIT;if\(hasMore\)rows=rows\.slice\(0,HGBP_LIMIT\);/);
  assert.match(hr, /function moreHolidayGbp\(\)\{HGBP_LIMIT\+=HGBP_PAGE;/);
  assert.match(hr, /onclick="moreHolidayGbp\(\)"/);
  assert.ok(!/\.limit\(60\)/.test(hr.slice(hr.indexOf('async function renderHolidayGbpCard'), hr.indexOf('function moreHolidayGbp'))));
});
