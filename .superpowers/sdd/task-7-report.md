# Task 7 근무표 화면 보완 보고서

## 구현 범위

- 연차 캘린더의 중복 판정 키를 표시 이름에서 연결 명부 `person_id`(미연결은 `user_id`)로 변경했다. 동명이인은 모두 표시되고 같은 사람의 중복 연차 행만 제거된다.
- `loadSchedulePeople` 실패 시 명부를 빈 배열로 안전하게 초기화하고, 오류 문구를 전역 상태에 유지해 모든 탭 상단에 노출한다. 성공 재로드 시 오류 상태를 해제한다.
- `onAuthed` 초기화를 공유 Promise로 직렬화했다. 명부 실패는 이름·내비게이션·다른 탭 렌더를 막지 않고, 완전 초기화 플래그를 남기지 않아 재호출로 복구할 수 있다. 치명적 오류도 `_inited=false`로 복구하고, click 리스너는 한 번만 등록한다.
- `schedules` 주차 조회 오류를 검사해 오류 카드를 표시하고, 해당 렌더에서 편집 셀과 복사 버튼이 나오지 않도록 중단했다.
- 전주 복사는 기존 전주 빈 데이터 검사 후 `copy_schedule_week` RPC를 `{p_source_week, p_target_week}`로 호출한다. 클라이언트의 `schedules` upsert/delete는 사용하지 않으며 RPC 실패는 상태와 알림으로 노출한다.

## TDD 증거

- RED: `node --test --test-isolation=none tests/schedule-roster.test.js`
  - 기존 29개 통과, 신규 회귀 경로 6개 실패를 확인했다.
  - 실패 원인은 동명이인 소실, 명부/치명 오류의 초기화 중단, 중복 호출 조기 반환, 조회 오류 후 편집 노출, RPC 미호출이었다.
- GREEN: 전용 테스트 36개 전부 통과(성공/실패 RPC 경로 포함).

## 검증

- 전체 Node 테스트: 64개 통과, 0개 실패.
- `hr.html` 인라인 JavaScript: 2개 블록 `new Function` 구문 검사 통과.
- `git diff --check`: 오류 없음(CRLF 변환 예고만 출력).

## 변경 파일

- `hr.html`
- `tests/schedule-roster.test.js`
- `.superpowers/sdd/task-7-report.md`
