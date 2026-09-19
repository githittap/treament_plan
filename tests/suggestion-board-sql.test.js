const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlPath = path.join(__dirname, '..', 'db', 'suggestion_board.sql');
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';

test('건의함 SQL 정본이 존재한다', () => {
  assert.ok(fs.existsSync(sqlPath), 'db/suggestion_board.sql이 없습니다.');
});

test('네 테이블과 RLS를 정의한다', () => {
  for (const table of ['suggestion_campaigns', 'suggestions', 'suggestion_likes', 'suggestion_reviews']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('authenticated 최소 grant와 anon 차단을 명시한다', () => {
  assert.match(sql, /grant[\s\S]+to authenticated/i);
  assert.match(sql, /revoke all[\s\S]+from anon/i);
  assert.doesNotMatch(sql, /grant[\s\S]+to anon/i);
});

test('기간·auth.uid·UPDATE USING/WITH CHECK·자기 글 좋아요 금지를 정책에 둔다', () => {
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /starts_at[\s\S]{0,180}current_date|current_date[\s\S]{0,180}starts_at/i);
  assert.match(sql, /create policy[\s\S]+for update[\s\S]+using[\s\S]+with check/i);
  assert.match(sql, /suggestion_likes[\s\S]+user_id[\s\S]+auth\.uid\(\)/i);
});

test('캠페인별 수상 순위 중복을 막고 공개 view에서 민감 필드를 제외한다', () => {
  assert.match(sql, /unique index[\s\S]+campaign_award_rank[\s\S]+where[\s\S]+award_rank is not null/i);
  const view = sql.match(/create or replace view public\.suggestion_awards_public[\s\S]+?;\s*$/i);
  assert.ok(view, '수상 공개 view가 없습니다.');
  assert.doesNotMatch(view[0], /originality_score|review_note|reviewer_id/i);
});

test('초기 캠페인은 테이블이 비어 있을 때만 삽입한다', () => {
  assert.match(sql, /insert into public\.suggestion_campaigns[\s\S]+where not exists[\s\S]+suggestion_campaigns/i);
});
