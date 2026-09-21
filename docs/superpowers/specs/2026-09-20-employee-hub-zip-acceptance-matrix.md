# 직원허브 ZIP 근무표 수용 추적표

## 최신 승계 표식 — Task11 문서화 완료 및 다음 범위 (2026-09-22)

Task10 기록 커밋 `41327995d523e6583db14db4840e5628052d20e0`는 `origin/main` push 완료이며 최신 GitHub Pages run `35666985589` success다. 기능 배포 `eeac4f2`·run `35640892992`는 역사 증거로 보존한다. Task11 결과보고서 정본은 `Z:\11_codex\00_결과보고서\직원허브_구현결과보고서_2026-09-22.html`(SHA256 `7AACA57558B9D6F6CEE9EB35E4781C1205CEA4217DF70BB5F5AC7E0C48A748F4`), 사용설명서 정본은 `Z:\11_codex\03_병원운영·전산\직원허브_수정지침_시안\직원허브_사용설명서.docx`(SHA256 `9CB2DB42EB8C78E2E43F4375C7E5F7F3CD47EB14A4234434BB9AA4B3F81E2B07`)다.

Sol High 독립검증은 HTML/content/OOXML/a11y/privacy PASS다. 번들 LibreOffice 부재로 사용설명서 전 페이지 PNG visual QA는 미실행인 조건부 인도이며, 실제 4역할 로그인·저장/재조회와 실제 직원 데이터·메일·Push·생체정보는 미검증·금지다. 최초 `직원허브 수정 지침.zip`의 외부자료 없이 가능한 승인 범위는 종료했고, 다음은 아직 열지 않은 `직원허브 5차.zip` 원본 보존·해시·인벤토리·요구 대조다. `상담문의 등 일원화.zip`은 직원허브 5차 완료 뒤 별도 후속이다.

## 최신 승계 표식 — Task10 배포·공개 smoke 완료 (2026-09-22)

Task10은 `main`=`eeac4f2d9827f01764be66f8616717b732623fd0` 배포와 GitHub Pages run `35640892992` build/deploy success로 완료했다. `jung-plant.com/hr.html?v=eeac4f2` HTTP 200(498479 bytes), GitHub Pages 501015 bytes에서 `push_subscriptions`·`WORK_DOC_GUIDE_OPEN`·`consultation_journals` 표식을 확인했고, 로그인 UI의 CDP reload Runtime.exception·Network.loadingFailed·Log error/warn은 0건이었다(form 권고 verbose 5건만). 직접 JS 24/24·PGlite 9/9·인라인 구문·`git diff --check`도 PASS다. 실제 4역할 로그인·저장/재조회와 실제 데이터·메일·Push·생체정보는 시험 계정/자격증명 없이 미검증이며, 프론트 롤백 기준은 `4865f89`, DB 롤백은 별도 증거 게이트다. 다음은 Task11 설명서다.

## 최신 승계 표식 — Task7·Task8 운영 완료 (2026-09-22)

Task7 `employee_hub_push_subscriptions_v6_20260922`와 Task8 `employee_hub_attendance_owner_chief_gate_20260922`의 운영 적용·검증을 완료했다. Task7은 PG17.6 rows=0, RLS, policy 4개, trigger 1개, constraints 5개, canonical=`4f7a3ffc459b04e0a3c87ea8dfda8c28`, advisor 0건이다. Task8은 marker=1, FORCE RLS·역할 SELECT 없음, `prosrc=08d9fa62fcc82616dd9f7cb3f8ebafac`, chief gate=true·old bypass=false, entries=8·history=9 보존 및 Task7 canonical 유지다. Task9는 기존 `hr.html` workdocs 탭의 사용 설명서·열기/닫기·메뉴별 안내·권한 차이를 확인해 완료했으며 work-documents 4/4, guide 2/2, home-work-docs 1/1 PASS다. 새 상단탭·민감정보는 없고 통합 `node --test` spawn EPERM은 코드 실패가 아니다. 실제 직원 Push·실기기·VAPID는 미수행·금지이며 `직원허브 5차.zip`은 미열람이다. 다음은 Task10 역할별 단계배포·최종인수 → Task11 설명서다.

## Task 6 최신 수용 게이트 — Sol High FAIL (2026-09-21)

Task 6은 **로컬 구현 있으나 최종 Sol High FAIL·배포 차단**이다. 기존 수용·배포 이력은 보존하며 이 게이트를 최신 상태로 적용한다.

| 항목 | 현재 판정 | 다음 수용 조건 |
|---|---|---|
| Supabase `foldername` path 조건 | FAIL | `uid/tmp/file` → `[uid,tmp]` 길이 2를 실제 의미로 고정하고 migration 조건 수정 |
| 실제 업로드/cleanup DELETE | FAIL/미검증 경계 붕괴 | RLS 거부 원인 수정 후 실제 의미 반영 시험에서 통과 |
| 성공 첨부 보존 | FAIL | tmp 밖 확정 경로 이동 또는 서버 확정 절차, 타인·게시·비tmp DELETE 차단 |
| 기존 PGlite helper | 무효 | 파일명을 foldername에 포함하지 않는 helper로 교체해 RED/GREEN 재시험 |

검증 집계: Node 23/23, 기존 PGlite 7/7은 helper 오모사로 Storage 판정 무효, 실제 helper 의미 반영 시험 FAIL, 인라인 2 PASS, `git diff --check` PASS. push·운영 적용·Opus 미실행.

재검증 순서는 실제 Supabase foldername 의미 고정 → RED(길이 2·게시 첨부 DELETE 거부) → GREEN(path 수정·tmp 밖 확정·DELETE 차단) → PGlite/정적/전체 회귀 → Sol High PASS → 사용자 승인 Opus 읽기전용 외부 검사 → push/운영 적용 판단이다.

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
- Sol High 재검증 FAIL 보완 `7ee01fd`: INSERT의 `author_id`·`author`·`created_at`·`updated_at`을 서버값으로 고정하고, UPDATE의 작성자·작성시각 불변과 서버 `updated_at`을 강제했다. rollback snapshot은 PUBLIC·anon·authenticated ACL을 모두 회수하고 RLS를 활성화했다. PGlite 보완 시험은 통과했으나 **Sol High 최종 재검증 대기** 상태이다. 운영 미적용·push 미수행 경계는 그대로다.
