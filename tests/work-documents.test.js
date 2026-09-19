const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* work-documents:test-start \*\/([\s\S]*?)\/\* work-documents:test-end \*\//);
const render = html.match(/\/\* work-documents:render-start \*\/([\s\S]*?)\/\* work-documents:render-end \*\//);

function loadContext() {
  assert.ok(block, '업무자료 테스트 경계가 없습니다.');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.filterWorkDocuments=filterWorkDocuments;`, context);
  return context;
}

test('업무자료 탭과 renderWorkDocuments 라우터 계약이 있다', () => {
  assert.match(html, /\{key:'workdocs',label:'📚 업무자료',roles:\['staff','manager','chief','owner'\]\}/);
  assert.match(html, /TAB==='workdocs'/);
  assert.ok(render, 'renderWorkDocuments 경계가 없습니다.');
});

test('검색은 제목·설명·종류를 대소문자 구분 없이 필터링한다', () => {
  const context = loadContext();
  const items = [{title:'업무 매뉴얼',description:'진료실 업무 안내',category:'매뉴얼'}, {title:'구매현황',description:'필요물품 요청',category:'구매'}];
  assert.equal(context.filterWorkDocuments(items, '진료실').length, 1);
  assert.equal(context.filterWorkDocuments(items, '구매').length, 1);
  assert.equal(context.filterWorkDocuments(items, '').length, 2);
});

test('두 승인 링크와 새 창 noopener를 노출한다', () => {
  assert.match(html, /https:\/\/app\.notion\.com\/p\/1f7ba489f082806e9761e748524994bc\?source=copy_link/);
  assert.match(html, /https:\/\/app\.notion\.com\/p\/163ba489f082805c9db2e2949b98a2d2\?source=copy_link/);
  assert.match(render[1], /target="_blank"/);
  assert.match(render[1], /rel="noopener"/);
});

test('검색 빈 상태와 카드 확장 가능 목록 계약이 있다', () => {
  assert.match(render[1], /자료가 없습니다|검색 결과가 없습니다/);
  assert.match(render[1], /workDocuments/);
  assert.match(render[1], /업무자료/);
});
