const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const render = html.match(/\/\* work-documents:render-start \*\/([\s\S]*?)\/\* work-documents:render-end \*\//);
const guide = html.match(/\/\* work-documents-guide:test-start \*\/([\s\S]*?)\/\* work-documents-guide:test-end \*\//);

test('업무자료 안에 직원용 설명서 카드와 내부 열기·닫기가 있다', () => {
  assert.ok(render, '업무자료 렌더 경계가 없습니다.');
  assert.match(render[1], /직원 허브 사용 설명서/);
  assert.match(render[1], /업무자료 설명서 열기/);
  assert.match(render[1], /showWorkDocumentsGuide\(\)/);
  assert.match(render[1], /closeWorkDocumentsGuide\(\)/);
  assert.match(render[1], /업무자료\s*\|\s*직원 허브 사용 설명서/);
});

test('설명서는 직원 업무 동선과 권한 차이만 안내하고 민감한 원장 정보는 포함하지 않는다', () => {
  assert.ok(guide, '직원 설명서 테스트 경계가 없습니다.');
  const text=guide[1];
  for(const phrase of ['홈에서 할 일 확인','근무표 확인','연차 신청','승인된 연차는 캘린더 안의 연차 보기에서 확인합니다.','공휴일 표시는 병원 휴무 의미가 아닐 수 있습니다','결재 문서','공지 확인','업무자료 보기','건의함','내 서류함','직원 서류함','체결된 근로계약서','권한 차이']){
    assert.match(text, new RegExp(phrase));
  }
  assert.doesNotMatch(text, /환자명|환자 정보|급여 금액|입금 내역|원장 전용 화면/);
});
