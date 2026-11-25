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
  ';this.toRow=holidayGbpFormToRow;this.label=holidayGbpLabel;this.kindLabel=holidayGbpKindLabel;this.err=holidayGbpErrText;this.act=holidayGbpActionLabel;this.res=holidayGbpResultLabel;this.saveKey=holidayGbpSaveErrKey;this.live=holidayGbpSyncLive;', ctx);

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
  assert.equal(reg.size, 48);
  assert.ok(used.size >= 30);
  for (const [k, d] of used) { assert.ok(reg.has(k), '미등록 키: ' + k); assert.equal(reg.get(k), d, '기본값 불일치: ' + k); }
  // 동작·결과 이름 등 화면 코드에서 간접으로 쓰는 키도 등록돼 있음
  for (const k of ['hgbp.act_set', 'hgbp.act_clear', 'hgbp.act_noop', 'hgbp.act_error', 'hgbp.res_ok', 'hgbp.res_failed', 'hgbp.res_skipped', 'hgbp.err_exists']) assert.ok(reg.has(k), k);
  assert.match(hr, /hubTextDefsHolidayGbp|hgbpBox/);
  assert.match(texts, /hubTextDefsHolidayGbp\(add\);/);
});

test('실장·원장만: 카드·저장·삭제 모두 isLead 가드, 직원 화면에는 카드 없음', () => {
  assert.match(hr, /async function renderHolidayGbpCard\(box\)\{\n  if\(!box\|\|!isLead\(\)\)return;/);
  assert.match(hr, /async function saveHolidayGbp\(\)\{\n  if\(!isLead\(\)\)return;/);
  assert.match(hr, /async function deleteHolidayGbp\(date\)\{\n  if\(!isLead\(\)\)return;/);
  assert.match(hr, /if\(isLead\(\)&&m&&typeof m\.appendChild==='function'[^\n]*renderHolidayGbpCard\(hbox\)/);
  assert.match(hr, /const isLead=\(\)=>\['chief','owner'\]\.includes\(ME\.role\);/);
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
  assert.equal((log.match(/PGLITE_HOLIDAY_GBP_SCENARIO_PASS/g) || []).length, 3, 'B1·B2·B4 시나리오 3개 통과');
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
  assert.match(doc, /T2는 매일 실행 작업이 실제로 돌고[^\n]*켬/);
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
