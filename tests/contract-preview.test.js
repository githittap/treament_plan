const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'contract-preview.html'), 'utf8');
const hrHtml = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');
const block = html.match(/\/\* contract-preview:test-start \*\/([\s\S]*?)\/\* contract-preview:test-end \*\//);

test('역할별 수행업무와 무기한 계약 상태 도우미가 있다', () => {
  assert.ok(block, '계약서 미리보기 도우미 블록이 없습니다.');
});

if (block) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${block[1]};this.ROLE_DUTIES=ROLE_DUTIES;this.indefiniteContractState=indefiniteContractState;`, context);

  test('마케터 역할은 확장된 수행업무를 자동 반환한다', () => {
    assert.match(context.ROLE_DUTIES.마케터, /광고심의/);
    assert.match(context.ROLE_DUTIES.마케터, /내부 사이니지/);
  });

  test('종료일이 있으면 기간의 정함 없음을 해제하고 비활성화한다', () => {
    assert.deepEqual({ ...context.indefiniteContractState('2026-12-31') }, { checked: false, disabled: true });
    assert.deepEqual({ ...context.indefiniteContractState('') }, { checked: false, disabled: false });
  });
}

test('근무표 입력은 월~일과 주간·야간·별도 구분 및 고정 공휴일 문구를 제공한다', () => {
  assert.match(html, /월/);
  assert.match(html, /일/);
  assert.match(html, /주간/);
  assert.match(html, /야간/);
  assert.match(html, /별도/);
  assert.match(html, /공휴일 근무 포함/);
});

test('직원 계약 미리보기는 공통 분류를 참고 정보로만 표시하고 계약 문구는 건드리지 않는다', () => {
  assert.match(hrHtml, /function contractEmployeeJobGroupInfo\(/, '직원 계약 미리보기 분류 안내 함수가 있어야 한다');
  const preview = hrHtml.match(/function previewContract\(\)\{[\s\S]*?\n\}/);
  assert.ok(preview, '직원 계약 미리보기 함수가 있어야 한다');
  assert.match(preview[0], /contractEmployeeJobGroupInfo/);
  assert.match(preview[0], /mergeContractHtml\(d\.template,d\.fields\)/, '저장될 계약서 HTML은 기존 입력값으로만 합쳐야 한다');
  assert.match(hrHtml, /model\.label/, 'NULL 분류도 공통 모델의 미지정 라벨을 참고 표시해야 한다');
});

test('계약 분류 안내는 연결 명부의 Dr.를 우선하고 일반 직원은 프로필 분류를 따른다', () => {
  const modelBlock = hrHtml.match(/\/\* schedule-roster:test-start \*\/([\s\S]*?)\/\* schedule-roster:test-end \*\//);
  const helper = hrHtml.match(/function contractEmployeeJobGroupInfo\(employeeId\)\{[\s\S]*?\n\}/);
  assert.ok(modelBlock && helper, '공통 모델 및 계약 분류 helper가 있어야 한다');
  const context = {
    PROFILES: [
      { user_id: 'doctor', dept: '진료실', job_group: 'desk' },
      { user_id: 'staff', dept: '데스크', job_group: 'clinical_consult' },
      { user_id: 'unlinked', dept: '진료실', job_group: null }
    ],
    SCHEDULE_PEOPLE: [
      { id: 'doctor-row', profile_user_id: 'doctor', department: 'Dr.', job_group: null },
      { id: 'staff-row', profile_user_id: 'staff', department: '진료실', job_group: 'desk' }
    ],
    esc: value => String(value)
  };
  vm.createContext(context);
  vm.runInContext(`${modelBlock[1]}; this.employeeJobGroupModel=employeeJobGroupModel;`, context);
  vm.runInContext(`${helper[0]}; this.contractInfo=contractEmployeeJobGroupInfo;`, context);
  assert.equal(context.contractInfo('doctor'), '', 'Dr. 명부 행은 직무 분류를 노출하지 않는다');
  assert.match(context.contractInfo('staff'), /진료·상담/, '일반 연결 직원은 profile.job_group 값을 우선한다');
  assert.match(context.contractInfo('unlinked'), /미지정/, '연결 명부가 없는 NULL profile은 미지정으로 안내한다');
});
