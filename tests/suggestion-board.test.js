const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* suggestion-board:test-start \*\/([\s\S]*?)\/\* suggestion-board:test-end \*\//);
const render = html.match(/\/\* suggestion-board:render-start \*\/([\s\S]*?)\/\* suggestion-board:render-end \*\//);

function loadContext() {
  assert.ok(block, '건의함 테스트 경계가 없습니다.');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.summarizeSuggestions=summarizeSuggestions;this.canLikeSuggestion=canLikeSuggestion;this.toggleSuggestionLike=toggleSuggestionLike;this.winnerVisibility=winnerVisibility;`, context);
  return context;
}

function campaign(overrides = {}) {
  return { starts_at: '2026-09-01', ends_at: '2026-09-30', ...overrides };
}

test('건의함 순수 함수 테스트 경계와 공개 탭 계약이 있다', () => {
  assert.ok(block, '건의함 테스트 경계가 없습니다.');
  assert.match(html, /\{key:'suggestions',label:'💡 건의함'/);
  assert.match(html, /TAB==='suggestions'/);
});

test('게시글 수·좋아요 수·사람별 집계를 계산한다', () => {
  const context = loadContext();
  const result = context.summarizeSuggestions([
    { id: 1, campaign_id: 10, user_id: 'u1' }, { id: 2, campaign_id: 10, user_id: 'u1' }, { id: 3, campaign_id: 10, user_id: 'u2' }
  ], [{ suggestion_id: 1, campaign_id: 10 }, { suggestion_id: 1, campaign_id: 10 }, { suggestion_id: 2, campaign_id: 10 }, { suggestion_id: 99, campaign_id: 9 }], 10);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    totalPosts: 3,
    totalLikes: 3,
    byUser: { u1: { posts: 2, likes: 3 }, u2: { posts: 1, likes: 0 } }
  });
});

test('캠페인당 한 직원의 여러 게시글을 모두 집계한다', () => {
  const context = loadContext();
  const result = context.summarizeSuggestions([
    { id: 1, campaign_id: 10, user_id: 'u1' }, { id: 2, campaign_id: 10, user_id: 'u1' }
  ], [{ suggestion_id: 1, campaign_id: 10 }, { suggestion_id: 2, campaign_id: 10 }], 10);
  assert.equal(result.totalPosts, 2);
  assert.equal(result.byUser.u1.posts, 2);
  assert.equal(result.byUser.u1.likes, 2);
});

test('자기 글·종료 캠페인·이미 좋아요에는 좋아요를 허용하지 않는다', () => {
  const context = loadContext();
  assert.equal(context.canLikeSuggestion({ user_id: 'u1' }, 'u1', campaign(), false, '2026-09-15'), false);
  assert.equal(context.canLikeSuggestion({ user_id: 'u2' }, 'u1', campaign({ ends_at: '2026-08-31' }), false, '2026-09-15'), false);
  assert.equal(context.canLikeSuggestion({ user_id: 'u2' }, 'u1', campaign(), true, '2026-09-15'), false);
  assert.equal(context.canLikeSuggestion({ user_id: 'u2' }, 'u1', campaign(), false, '2026-09-15'), true);
});

test('좋아요 현재 상태에 따라 insert/delete payload를 결정한다', () => {
  const context = loadContext();
  assert.deepEqual(JSON.parse(JSON.stringify(context.toggleSuggestionLike(7, false))), { action: 'insert', suggestion_id: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(context.toggleSuggestionLike(7, true))), { action: 'delete', suggestion_id: 7 });
});

test('종료 전에는 수상을 숨기고 종료 후에는 최소 공개 필드만 반환한다', () => {
  const context = loadContext();
  const rows = [{ campaign_id: 1, suggestion_id: 7, award_rank: 1, title: '개선안', user_id: 'u1', prize_amount: 50000 }];
  assert.deepEqual(JSON.parse(JSON.stringify(context.winnerVisibility(campaign(), rows, rows, '2026-09-15'))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.winnerVisibility(campaign(), rows, rows, '2026-10-01'))), rows);
});

test('조회 오류·정상 빈 상태·owner 평가·지급 기능 없음 계약이 있다', () => {
  assert.ok(render, 'renderSuggestions 함수를 찾을 수 없습니다.');
  assert.match(render[1], /건의함 정보를 불러오지 못했습니다/);
  assert.match(render[1], /등록된 건의가 없습니다/);
  assert.match(render[1], /ME\.role==='owner'|ME\.role === 'owner'/);
  assert.match(render[1], /지급 기능 없음/);
  assert.match(render[1], /suggestion_awards_public/);
  assert.match(render[1], /게시글 \$\{summary\.totalPosts\}개/);
  assert.match(render[1], /SUGGESTION_EDIT_ID/);
});
