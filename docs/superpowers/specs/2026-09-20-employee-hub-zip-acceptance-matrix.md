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
