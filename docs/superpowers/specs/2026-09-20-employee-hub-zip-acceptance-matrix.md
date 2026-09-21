# 직원허브 ZIP 근무표 수용 추적표

기준 원문: `직원허브 수정 지침.zip` MD 91~102행. 개인정보·원본 엑셀은 시험 입력으로 사용하지 않는다.

| ID | 요구 | 현재 상태 | 수용 증거 |
|---|---|---|---|
| ZIP-01 | 주간 기본, 주간·월간 전환 | 구현·합성 검증 완료 | 주간/월간 렌더 시험 |
| ZIP-02 | 월~일 주차 블록, 일요일 맨 오른쪽 | 구현·합성 검증 완료 | 날짜 순서 시험 |
| ZIP-03 | 직무·상태 행 중심 배치 | 구현·합성 검증 완료 | 직무 행 수용시험 |
| ZIP-04 | 직무 셀의 복수 체크박스 선택 | 구현·런타임 검증 완료 | checkbox 렌더·저장·큐 시험 |
| ZIP-05 | 승인 연차 선택 차단, 반차 표시 | 구현·런타임 검증 완료 | 날짜별 다일 연차 차단 시험 |
| ZIP-06 | 야간은 전체 직원 선택, 원래 직무 색 유지 | 구현·런타임 검증 완료 | 야간 이중표시·해제→work 시험 |
| ZIP-07 | 모든 승인 직원 초안 편집, chief/owner 공표 | 구현·회귀 검증 완료 | 역할·공표 시험 |
| ZIP-08 | 기존 `schedules` 키·명부·행수 보존 | 운영 사전·사후 동일 확인 | 사전·사후 집계 및 회귀시험 |

Task 0 증거: `tests/schedule-zip-acceptance.test.js`는 기존 개인별 select UI에서 실패한 뒤 새 구조에서 통과했다. Task 1 런타임 증거는 `tests/schedule-roster.test.js`의 합성 하니스와 `tests/fixtures/schedule-role-synthetic.html`이다. 운영 배포·실데이터 화면 검증은 총괄 승인 전까지 보류한다.

## 단계배포 기록

- 배포 커밋: `050bd980b7e2892e5becd37de068720bf3cfad22` (2026-09-20 18:32 KST)
- migration: `unified_schedule_department_compatibility_20260920`
- migration SHA256: `C60118680E255863EA120C1A67C794D2BB090F51AF46E7132439EF94A40740DA`
- 사전·사후 집계: `schedule_people=21`, `schedules=281`, `schedule_weeks=10`, `holidays=9`, `leave_requests=27`; 부서별 `Dr.=3`, `미지정=18`
- 롤백: 기존 5개 허용값만 남기는 `schedule_people_department_check` 재생성 SQL을 보존함.
- 공개 검증: `https://jung-plant.com/hr.html?v=050bd98` HTTP 200, 새 직무표 마커 확인, 정규화 SHA256 로컬과 일치.
- 미검증 경계: 실제 로그인·저장·역할별 운영 동작, 실제 직원 데이터 조작·알림은 수행하지 않음.

### Task 2 통합 캘린더 단계배포 기록 (2026-09-20)

- 배포 커밋: `49780b33325d5150876c9032d3eb52e73419a6e6`; 이후 기록 커밋: `52a9a1b`.
- 시험: 관련 62/62, 전체 18개 파일 143/143, `git diff --check` 통과.
- 라이브 확인: `https://jung-plant.com/hr.html?v=49780b3` 로그인 화면 정상 로드.
- 미검증 경계: 인증 후 역할별 실제 화면·실제 직원 입력/승인은 자격증명과 실데이터 없이 미검증.
- DB 영향: Task 2 migration 및 운영 DB 행 변경 없음.
- 롤백: 프론트 직전 정본 `23a84f0e5be81561d2e297e16a322ca7d77f8433`으로 재배포; DB 롤백 없음.

## 2026-09-21 승계 갱신 — 이전 근무표 이력 보존

이 아래 내용은 위 ZIP-01~08 및 Task 2의 과거 수용 기록을 대체하지 않는다. 현재 직원허브 전체 범위와 실제 배포 상태를 연결하기 위한 최신 표식이다.

| 범위 | 상태 | 보존할 경계 |
|---|---|---|
| A. 최초 `직원허브 수정 지침.zip` | Task 0~5 구현·검증 및 관련 배포 완료 | 원본 ZIP·엑셀의 실제 행은 개발·시험·기록에 반입하지 않음 |
| B. 후속 `허브관련 2차.zip` | 4차 UI에 흡수·최종 수정·사용자 승인·배포 완료 | 새 요구가 기존 수용기준을 바꾸면 별도 수용표 갱신 |
| C. `직원허브 3차.zip` 피드백 | 4차 UI에 흡수·최종 수정·사용자 승인·배포 완료 | 확정된 4차 이후 요구만 새 범위로 분리 |
| D. 4차 UI 및 캘린더 보완 | 이 worktree에서 통합되어 기능 배포 기준 `0f3226b`까지 배포 | 인증 후 실제 입력·저장·재조회만 미검증 |
| 후속 상담일지 요구 | 기본·`harden_consultation_journals` migration 운영 적용, RLS 8/8 PASS·Sol PASS | Advisor security WARN 0건; 신규 빈 테이블 unused-index INFO만 남음 |

- 기능 배포 기준: `0f3226b` (2026-09-21 직접 push 완료). 인수인계 최신본의 정본은 기록 커밋을 포함한 `origin/main` HEAD를 따른다.
- 이 수용표 및 인수인계의 로컬 기록 커밋은 아직 `origin/main`에 포함하지 않는다. push 뒤에는 HEAD와 문서 최신본을 함께 확인한다.
- 최초 ZIP의 승인된 추가형 구현·시험·DB/RLS/Storage·단계배포는 단계별 재승인 없이 진행한다. 원본 삭제, 대량 이관/수정, 보안 완화, 새 비용, 자격증명 입력, 실제 직원 메일·push·알림, 외부 공개만 별도 승인 게이트다.
- 상담일지의 최종 접근 경계는 `manager`·`owner` 허용, `staff`·`chief` 및 anon 거부다. 초기 구현계획의 역할 서술과 다를 경우 실제 운영 적용·RLS 시험 결과를 우선한다.
- 이어서 할 Task 6~11, 운영 적용 조건, 시험 명령과 보호사항은 [직원허브 인수인계](../HANDOFF-employee-hub-2026-09-21.md)에 고정한다.

## Task 6 로컬 검증 기록 (2026-09-21)

- 공지 첨부·예치금 권한 분리 기능은 `2e1de31`, PGlite 합성시험은 `ffb58fb`에 있다. 공지는 승인·활성 직원의 자기 작성자/UUID 경로, 예치금은 데스크·chief·owner 조회로 분리했다.
- `NOTICE_ATTACHMENTS_ACCEPTANCE_PASS`, `PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS`, `hr.html` 인라인 JS 구문검사, `git diff --check`가 로컬에서 통과했다.
- 이 단계는 운영 DB/Storage migration, 실제 파일 업로드·역할별 저장/재조회, push, 배포를 포함하지 않는다. 원본 ZIP의 시간상 최초 업로드와 승인 구현 정본은 다르며, 상세 인벤토리는 [원본 ZIP 인벤토리](2026-09-21-employee-hub-source-zip-inventory.md)를 따른다.
- 후속 Sol 재검증: 보완 `4e346cf`, 검증 `28529d0`. 본인 tmp DELETE 성공·타인/비tmp/타버킷 거부, cleanup의 이번 요청 경로 한정, apply→rollback 정책 식·버킷·권한 왕복, 신규 빈 버킷 제거, 객체 존재 시 중단·보존을 고정 PGlite 0.5.8에서 확인했다. 운영 미적용·push 미수행 경계는 그대로다.
