const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '..', '치료계획.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function loadTestHelpers() {
  const match = html.match(/\/\* implant-recorder:test-start \*\/([\s\S]*?)\/\* implant-recorder:test-end \*\//);
  assert.ok(match, '임플란트 기록 테스트용 순수 함수 블록이 있어야 한다');
  const context = {};
  vm.runInNewContext(`${match[1]}\nthis.implantRecorderLineOf = implantRecorderLineOf;`, context);
  return context.implantRecorderLineOf;
}

test('임플란트 행위와 장착 그룹에 새 선택값이 포함된다', () => {
  assert.match(html, /const IMPLANT_ACTIONS = \['발치','GBR','상악동거상'\]/);
  assert.match(html, /const IMPLANT_INSTALLS = \['베이스5\.5','베이스4\.5'\]/);
  assert.match(html, /<div[^>]*>장착<\/div>/);
});

test('메모 측정에 IST + SCAN이 있고 최종 출력은 IST & SCAN.으로 보존된다', () => {
  assert.match(html, /const measures = \['IST \+ SCAN','ISQ \+ SCAN'/);
  assert.match(html, /'IST \+ SCAN':'IST & SCAN\.'/);

  const lineOf = loadTestHelpers();
  const line = lineOf({
    date: '2026-09-19',
    type: 'GBR',
    teeth: ['26'],
    months: null,
    memoMeasure: 'IST + SCAN',
    memoForce: null,
    memoEtc: ''
  }, () => '');
  assert.equal(line, '2026-09-19 (GBR #26) IST & SCAN.');
});

test('행위와 장착은 기존 단일 선택 기록 방식으로 출력된다', () => {
  const lineOf = loadTestHelpers();
  const line = lineOf({
    date: '2026-09-19',
    type: '베이스4.5',
    teeth: [],
    months: null,
    memoMeasure: null,
    memoForce: null,
    memoEtc: ''
  }, () => '');
  assert.equal(line, '2026-09-19 (베이스4.5)');
});
