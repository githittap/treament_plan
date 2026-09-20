const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'db', 'consultation_journal_draft.sql');
const htmlPath = path.join(root, 'hr.html');
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
const html = fs.readFileSync(htmlPath, 'utf8');

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

test('직원허브는 별도 상단 탭 없이 실장·원장 전용 상담 화면과 오류 경로를 제공한다', () => {
  assert.doesNotMatch(html, /\{key:'consult'/);
  assert.match(html, /상담일지 열기/);
  assert.match(html, /else if\(TAB==='consult'\)await renderConsultationJournal\(m\)/);
  assert.match(html, /function canManageConsultation\(\)\{return ME\.role==='manager'\|\|ME\.role==='owner';\}/);
  assert.match(html, /상담일지 접근 권한이 없습니다/);
  assert.match(html, /상담일지 불러오기 실패:/);
  assert.match(html, /상담일지 저장 실패:/);
  assert.match(html, /상담일지 수정 실패:/);
  assert.match(html, /const CONSULTATION_SHEETS=\['교정','확정','미확정 및 부분확정','홈페이지','카카오,네이버예약,당근','원본'\]/);
});
