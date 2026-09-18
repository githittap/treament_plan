# Task 7B 근무표 보조 조회 실패 차단 보고서

## 보완 내용

- `renderSched` 진입 시 `schedule_weeks` 조회의 `error`를 확인한다.
- 주차 조회 실패 시 `근무표 주차 정보`를 오류 대상으로 밝히고, escape된 `error.message`를 포함한 오류 카드만 렌더한다.
- `leave_requests` 조회의 `error`도 동일하게 확인하고, 실패 시 `연차 정보`를 대상으로 명시한 오류 카드만 렌더한다.
- 두 오류 경로 모두 편집 `select`, `data-person-id`, `지난주 복사` 버튼을 만들기 전에 조기 반환한다.

## TDD 증거

- RED: 실제 `renderSched` 함수를 VM에서 실행하는 주차 오류/연차 오류 테스트 2개가 오류 대상 문구를 찾지 못하고, 편집표가 노출되어 실패함을 확인했다.
- GREEN: 기존 `schedules` 오류 경로와 신규 주차/연차 오류 경로 3개가 모두 통과했다.

## 검증

- 전체 Node 회귀 테스트: 66개 통과, 0개 실패.
- `hr.html` 인라인 JavaScript: 2개 블록 구문 검사 통과.
- `git diff --check`: 오류 없음(CRLF 변환 예고만 출력).

## 변경 파일

- `hr.html`
- `tests/schedule-roster.test.js`
- `.superpowers/sdd/task-7b-report.md`

라이브 배포는 수행하지 않았다.
