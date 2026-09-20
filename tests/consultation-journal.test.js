const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'db', 'consultation_journal_draft.sql');
const htmlPath = path.join(root, 'hr.html');
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
const html = fs.readFileSync(htmlPath, 'utf8');

function loadConsultationHelpers() {
  const match = html.match(/\/\* consultation-journal:test-start \*\/([\s\S]*?)\/\* consultation-journal:test-end \*\//);
  assert.ok(match, '상담일지 테스트용 순수 함수 블록이 있어야 합니다.');
  const context = {};
  require('node:vm').runInNewContext(`${match[1]}\nthis.helpers={consultationCanAccess,consultationMaskPhone,consultationSafeSearch,consultationPageRange,consultationRequestError,consultationApplyFilterState,consultationServerQueryPlan};`, context);
  return context.helpers;
}

test('상담일지 SQL은 최소 필드, 감사시각, 허용 상담 구분만 선언한다', () => {
  assert.ok(fs.existsSync(sqlPath), '상담일지 SQL 초안이 없습니다.');
  assert.match(sql, /create table if not exists public\.consultation_journals/i);
  for (const column of ['patient_name', 'contact_phone', 'source_sheet', 'consulted_on', 'status', 'consultation_note', 'next_action', 'created_at', 'updated_at']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.match(sql, /check\s*\(\s*source_sheet\s+in\s*\([\s\S]*교정[\s\S]*확정[\s\S]*미확정\s*및\s*부분확정[\s\S]*홈페이지[\s\S]*카카오,네이버예약,당근[\s\S]*원본/i);
  assert.match(sql, /create index if not exists consultation_journals_consulted_on_idx/i);
  assert.match(sql, /new\.updated_at\s*:=\s*now\(\)/i);
});

test('상담일지는 anon과 일반 직원에게 닫고 manager·owner만 조회·입력·수정한다', () => {
  assert.match(sql, /alter table public\.consultation_journals enable row level security/i);
  assert.match(sql, /revoke all privileges on table public\.consultation_journals from anon/i);
  assert.match(sql, /revoke all privileges on table public\.consultation_journals from authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.consultation_journals to authenticated/i);
  for (const action of ['select', 'insert', 'update']) {
    const policy = sql.match(new RegExp(`create policy consultation_journals_${action}[\\s\\S]*?;`, 'i'));
    assert.ok(policy, `${action} RLS 정책이 있어야 합니다.`);
    assert.match(policy[0], /my_role\(\)\s+in\s*\('manager',\s*'owner'\)/i);
  }
  assert.doesNotMatch(sql, /create policy consultation_journals_delete/i);
});

test('UUID를 식별자로 쓰고 sequence 권한 없이 감사 필드 변조를 트리거로 거부한다', () => {
  assert.match(sql, /id\s+uuid\s+primary key\s+default gen_random_uuid\(\)/i);
  assert.doesNotMatch(sql, /generated always as identity|consultation_journals_id_seq|on sequence/i);
  for (const immutable of ['new\.id is distinct from old\.id', 'new\.author_id is distinct from old\.author_id', 'new\.created_at is distinct from old\.created_at']) {
    assert.match(sql, new RegExp(immutable, 'i'));
  }
});

test('원본 헤더의 비용과 두 개의 메모 열을 분리해 최소 필드로 검증한다', () => {
  assert.match(sql, /quoted_amount numeric\(14,2\)[\s\S]*check \(quoted_amount is null or quoted_amount >= 0\)/i);
  assert.match(sql, /instruction_note text check \(instruction_note is null or char_length\(trim\(instruction_note\)\) <= 1000\)/i);
  assert.match(sql, /special_note text check \(special_note is null or char_length\(trim\(special_note\)\) <= 1000\)/i);
  assert.doesNotMatch(sql, /decision_reason/i);
  assert.match(html, /id="cjAmount"[\s\S]*min="0"[\s\S]*step="0\.01"/i);
  assert.match(html, /<label>지시\/혹은 기타사항<\/label><textarea id="cjInstruction" maxlength="1000"><\/textarea>/i);
  assert.match(html, /<label>특이사항<\/label><textarea id="cjSpecial" maxlength="1000"><\/textarea>/i);
});

test('익명 하네스는 권한·짧은 연락처 마스킹·검색 정화·페이지 범위·오류 표기를 검증한다', () => {
  const helpers = loadConsultationHelpers();
  assert.equal(helpers.consultationCanAccess('anon'), false);
  assert.equal(helpers.consultationCanAccess('staff'), false);
  assert.equal(helpers.consultationCanAccess('manager'), true);
  assert.equal(helpers.consultationMaskPhone('12345'), '12•45');
  assert.equal(helpers.consultationMaskPhone('1234567'), '12•••67');
  assert.equal(helpers.consultationMaskPhone('1234'), '');
  assert.equal(helpers.consultationSafeSearch("<img src=x onerror=alert(1)> 홍길동%"), 'img srcx onerroralert1 홍길동');
  const page = helpers.consultationPageRange(2, 20);
  assert.equal(page.from, 40);
  assert.equal(page.to, 59);
  assert.equal(helpers.consultationRequestError('create', { message: 'denied' }), '상담일지 저장 실패: denied');
  assert.equal(helpers.consultationRequestError('update', { message: 'denied' }), '상담일지 수정 실패: denied');
  assert.equal(helpers.consultationRequestError('list', { message: 'denied' }), '상담일지 불러오기 실패: denied');
});

test('server_search_filter_survives_render: 버튼 입력은 렌더 전 상태에 저장되고 서버 쿼리 계획까지 보존된다', () => {
  const helpers = loadConsultationHelpers();
  const state = helpers.consultationApplyFilterState({ query: '', sheet: '', status: '', page: 3 }, { query: ' 홍길동% ', sheet: '홈페이지', status: '미확정' });
  assert.equal(state.query, '홍길동');
  assert.equal(state.sheet, '홈페이지');
  assert.equal(state.status, '미확정');
  assert.equal(state.page, 0);
  const plan = helpers.consultationServerQueryPlan(state, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), { query: '홍길동', sheet: '홈페이지', status: '미확정', from: 0, to: 19 });
  assert.match(html, /function consultationApplyFilters\(\)\{CONSULTATION_FILTERS=consultationApplyFilterState\(CONSULTATION_FILTERS/);
  assert.match(html, /const currentQuery=CONSULTATION_FILTERS\.query,currentSheet=CONSULTATION_FILTERS\.sheet,currentStatus=CONSULTATION_FILTERS\.status/);
});

test('직원허브는 별도 상단 탭 없이 실장·원장 전용 상담 화면과 오류 경로를 제공한다', () => {
  assert.doesNotMatch(html, /\{key:'consult'/);
  assert.match(html, /상담일지 열기/);
  assert.match(html, /else if\(TAB==='consult'\)await renderConsultationJournal\(m\)/);
  assert.match(html, /function canManageConsultation\(\)\{return consultationCanAccess\(ME\.role\);\}/);
  assert.match(html, /상담일지 접근 권한이 없습니다/);
  assert.match(html, /상담일지 불러오기 실패:/);
  assert.match(html, /상담일지 저장 실패:/);
  assert.match(html, /상담일지 수정 실패:/);
  assert.match(html, /const CONSULTATION_SHEETS=\['교정','확정','미확정 및 부분확정','홈페이지','카카오,네이버예약,당근','원본'\]/);
  assert.match(html, /const queryPlan=consultationServerQueryPlan\(CONSULTATION_FILTERS,CONSULTATION_PAGE_SIZE\)/);
  assert.match(html, /\.range\(queryPlan\.from,queryPlan\.to\)/);
  assert.match(html, /data-consultation-id=/);
  const feature = html.match(/\/\* ── 상담일지:[\s\S]*?\/\* ── 근로계약서/)[0];
  assert.doesNotMatch(feature, /Number\(row\.id\)|limit\(200\)|consultation_note,next_action,created_at,updated_at\)\.order/);
  assert.match(html, /esc\(row\.patient_name\|\|'\'\)/);
});
