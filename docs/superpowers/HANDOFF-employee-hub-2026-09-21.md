# 직원허브 현재 인수인계

## 최신 인계 — 직원허브 5차 원본 대조·운영 반영 완료 (2026-09-22)

- 원본: `C:\Users\elusi\Downloads\직원허브 5차.zip`, SHA256 `A177836684189BFAA4D0733F1EFF8D39B58B9F5FE71791E1F551DCD7C0EC5E3A`, 항목 4(MD 1, PNG 3). 7개 원본 모두 `Z:\11_codex\03_병원운영·전산\직원허브_원본ZIP`에 비파괴 복사됐고 이름별 SHA256이 Downloads 원본과 일치하며 Downloads 원본은 보존됐다.
- 완료: 근무표·수기근태·결근/미기록 후보·재직상태/접속차단은 구현·검증·운영 반영까지 완료했다. 세부 운영 증거와 rollback 경계는 아래 각 범위 기록을 보존한다.
- 남은 문자 그대로의 항목은 실제 Auth 계정 영구삭제 하나이며, 현재 기록보존형 영구 접속차단으로 안전 대체 중이다. 다음 활성 범위는 `상담문의 등 일원화.zip`이다.

## 직원허브 5차 — 재직상태·접속차단 운영 반영 (2026-09-22)

- 재직상태/접속차단 및 단계형 A/B/C·ACL 보정은 commit `6bffb86`까지 운영 반영 완료로 인계받았다. Pages run `35690778571` success, 공개 HTTP 200·배포 마커 확인까지 완료됐다. 이후 결근/미기록 후보 기준 변경은 로컬 커밋만 하며 운영 DB·push·deploy는 하지 않는다.

## 직원허브 5차 — 결근/미기록 후보 기준 운영 반영 (2026-09-22)

- 범위: `app_settings`에 `absence_confirm_after_minutes=0`, `absence_exclude_pending_manual=true`를 `ON CONFLICT DO NOTHING`으로 seed하고 기존 owner RLS를 이용해 원장만 화면에서 저장한다. rollback 전용 비공개 snapshot 테이블은 migration 전 두 키의 존재·값·label·updated_at만 보관하며 authenticated를 포함한 공개 역할에 권한을 주지 않는다.
- 판정: 서울 기준 오늘은 시업+지연 뒤에만, 과거는 즉시 후보로 한다. 입사일 전, 비재직 유효일 이후, 승인 leave_requests(반차 포함), 실제 attendance, 설정된 대기/실장승인/원장확정 수기근태는 제외한다. 설정 조회 실패·비정상 응답 또는 시업 설정 오류의 오늘 후보는 fail-closed다. 같은 직원·날짜의 수기근태는 복수 행 중 제외 상태가 하나라도 있으면 순서와 무관하게 제외한다.
- rollback: snapshot상 migration 전에 있던 키는 값·label·updated_at을 그대로 보존하고, 실제 추가한 기본값만 제거한다. 기존/사후 사용자 값 또는 snapshot 불일치면 예외로 중단·보존하며 성공 때 marker도 제거한다.
- postflight ACL 보완: marker는 RLS enabled/no policy만으로는 `PUBLIC` 상속 privilege를 완전히 막지 못할 수 있다. 본 migration은 `PUBLIC`·`anon`·`authenticated`에서 모두 revoke하며, 이미 marker가 있는 환경에는 `db/absence_candidate_settings_acl_hardening.sql`을 적용한다. 이 SQL은 marker 존재 시 ACL만 회수하고, marker가 없으면 no-op이다. marker 제거는 기존 rollback과 호환한다. PGlite에서 anon/authenticated/PUBLIC privilege false, RLS enabled·policy 0, 임시 SELECT grant에도 anon 0행을 확인했다.
- 운영 적용: migration `employee_hub_absence_candidate_settings_20260922` success, ACL hardening `employee_hub_absence_candidate_settings_acl_hardening_20260922` success. postflight는 keys `absence_confirm_after_minutes=0`·`absence_exclude_pending_manual=true`, snapshot=2, PUBLIC·anon·authenticated privilege=false, policy=0, profiles=21, 승인 leave_requests=28을 확인했다. attendance_manual_entries는 작업 중 외부 입력으로 9→14 증가했으므로 migration이 수정한 것으로 기록하지 않는다.
- 배포: `main` commit `3efbff9` push, GitHub Pages run `35693355918` success. 공개 `https://jung-plant.com/hr.html?v=3efbff9`는 HTTP 200·509621 bytes이며 CandidateText·ConfirmDelay·ManualExclude·LoadGuard 표식=true다. 실제 역할별 설정 저장·후보 조회는 아직 별도 실계정 운영 검증 범위다.

## 직원허브 5차 — 1단계 배포·2단계 운영 적용 (2026-09-22)

- 1단계 근무표는 `8cc9030d300a39b43190831785cdfa9405b78239`가 `origin/main` push, Pages run `35672912570` success, `https://jung-plant.com/hr.html?v=8cc9030` HTTP 200·근무표계획/월간 기본 표식 확인까지 완료했다. Sol High: 관련 57/57, 전체 JS 24파일, 인라인 2, diff-check PASS.
- 2단계 수기근태 migration `employee_hub_attendance_manual_v2_20260922`는 PG17.6에 성공 적용했다. 사전/사후 `manual_entries=8`·`revisions=8`·`attendance=0` 보존, 분리 4열, v2 `prosrc` MD5 `958c29dd1eedaa5d02c071363fc12e72`, SECURITY DEFINER=true·search_path 빈 값, anon/public EXECUTE=false·authenticated=true를 확인했다. lunch 20+clockout 30=총 50·대기 상태 트랜잭션 ROLLBACK 뒤 행 수도 동일하다. authenticated SECURITY DEFINER advisor 경고 1건은 auth.uid+활성/승인/역할 검사와 제한 grant를 둔 의도된 RPC이며, 다른 경고는 기존 범위다. Sol 최종 JS 25·PGlite 10·인라인 2·diff-check, 0분 rollback·연속 키보드 focus PASS다.

## 최신 인계 — Task11 문서화 완료 및 다음 범위 (2026-09-22)

- Task10 기록 커밋 `41327995d523e6583db14db4840e5628052d20e0`를 `origin/main`에 push했고 최신 GitHub Pages run `35666985589` success를 확인했다. 기능 배포 `eeac4f2`·run `35640892992`는 과거 증거로 보존한다.
- Task11 결과보고서 정본: `Z:\11_codex\00_결과보고서\직원허브_구현결과보고서_2026-09-22.html`, SHA256 `7AACA57558B9D6F6CEE9EB35E4781C1205CEA4217DF70BB5F5AC7E0C48A748F4`.
- Task11 사용설명서 정본: `Z:\11_codex\03_병원운영·전산\직원허브_수정지침_시안\직원허브_사용설명서.docx`, SHA256 `9CB2DB42EB8C78E2E43F4375C7E5F7F3CD47EB14A4234434BB9AA4B3F81E2B07`. Sol High HTML/content/OOXML/a11y/privacy PASS이나 번들 LibreOffice 부재로 전 페이지 PNG visual QA는 미실행인 조건부 인도 경계다.
- 최초 `직원허브 수정 지침.zip`의 외부자료 없이 가능한 승인 범위 구현·운영적용·배포·문서화는 종료했다. 실제 4역할 로그인·저장/재조회와 실제 직원 데이터·메일·Push·생체정보는 미검증·금지로 남긴다.
- 다음 활성 범위가 아직 열지 않은 `직원허브 5차.zip` 원본 보존·해시·인벤토리·요구 대조라는 과거 기록은 최신 상단 상태로 대체됨이다. `상담문의 등 일원화.zip`이 다음 활성 범위다.

## 최신 인계 — Task10 배포·공개 smoke 완료 (2026-09-22)

- 배포 정본: `main`=`eeac4f2d9827f01764be66f8616717b732623fd0`; GitHub Pages run `35640892992` build/deploy success. `jung-plant.com/hr.html?v=eeac4f2` HTTP 200(498479 bytes), GitHub Pages 501015 bytes이며 두 공개본에서 `push_subscriptions`·`WORK_DOC_GUIDE_OPEN`·`consultation_journals` 표식을 확인했다.
- 앱 내 로그인 UI를 열어 CDP reload를 확인했고 Runtime.exception·Network.loadingFailed·Log error/warn은 0건, 비밀번호 입력칸 form 권고 verbose 5건만 있었다. 직접 JS 24/24·PGlite 9/9·인라인 구문·`git diff --check`도 PASS다.
- 실제 4역할 로그인·저장/재조회와 실제 데이터·메일·Push·생체정보는 자격증명/시험 계정 없이 미검증이다. 다음은 Task11 설명서이며, 프론트 롤백은 `4865f89`; DB 롤백은 기존 별도 증거 게이트를 유지한다.

## 최신 인계 — Task7·Task8 운영 적용·검증 완료 (2026-09-22)

- Task7 `employee_hub_push_subscriptions_v6_20260922` 성공: PG17.6, rows=0, RLS, policy 4개, trigger 1개, constraints 5개, canonical=`4f7a3ffc459b04e0a3c87ea8dfda8c28`, 관련 advisor 0건.
- Task8 `employee_hub_attendance_owner_chief_gate_20260922` 성공: marker 1건, FORCE RLS·역할 SELECT 없음, corrected function `prosrc=08d9fa62fcc82616dd9f7cb3f8ebafac`, chief gate=true·old bypass=false, `attendance_manual_entries=8`·history=9 보존 및 Task7 canonical 유지. private marker no-policy INFO는 의도된 deny-all이다.
- Task9 메뉴 도움말 완료: 기존 `hr.html` workdocs 탭 안 사용 설명서·열기/닫기·메뉴별 안내·권한 차이를 확인했다. 새 상단탭·민감정보는 없고 work-documents 4/4, guide 2/2, home-work-docs 1/1 PASS다. 통합 `node --test` spawn EPERM은 코드 실패가 아니다.
- Task10 역할별 단계배포·최종인수 → Task11 설명서와 `직원허브 5차.zip` 미열람이라는 과거 상태는 최신 상단 상태로 대체됨이다. 실제 직원 Push·실기기·VAPID는 미수행·금지이며, `상담문의 등 일원화`는 다음 활성 후속이다.

## 최신 인계 — Sol High 7차 Minor 1 기록 보완, 8차 최종 문서 대조 대기 (2026-09-22)

- Sol High 7차는 코드 안전성 PASS였으나 overview/todos의 6차 대기 두 줄이 stale이라 Minor 1 FAIL했다. 이번 기록-only 보완으로 그 두 줄을 현재 상태에 맞췄다.
- Task7/Task8 production은 미적용이며, 다음은 Sol High 8차 최종 문서 대조 PASS 후 Supabase PG17 읽기 전용 preflight → Task7 적용/검증 → Task8 적용/검증이다.

## 최신 인계 — Sol High 6차 Minor 1 기록 보완, 7차 최종 문서 대조 대기 (2026-09-22)

- `e607ff6`은 PGlite `Error.message`의 오류 8건을 exact equality로 고정했고 전체 JS/PGlite 시험은 PASS했다.
- Sol High 6차는 기능·전체 시험 PASS였으나 해당 커밋이 기록에 반영되지 않아 Minor 1 FAIL했다. 이번 기록-only 보완은 그 누락만 해소하며 코드·시험·SQL은 수정하지 않는다.
- Task7/Task8 production은 미적용이고, 다음은 Sol High 7차 최종 문서 대조다.

## 최신 인계 — Sol High 5차 Minor 2 보완, 6차 재검증 대기 (2026-09-22)

- Sol High 5차 독립검증은 기능·독립 시험은 PASS였으나 기록 미동기와 targeted JSON 4종 및 `95c296d` 복원 4건의 오류가 부분 match여서 Minor 2 FAIL했다.
- PGlite가 실제 `Error`를 던지고 `message`를 반환함을 확인해, 8건 기대 오류를 한 `exact` 상수의 전체 문자열 `assert.equal`로 고정했다. 접두·접미 변경도 실패하며, preflight 삭제 변형은 여전히 없다.
- Task7/Task8 production은 미적용이고, 다음은 Sol High 6차 독립 재검증 PASS다.

## 최신 인계 — Sol High 4차 FAIL 보완, 재검증 대기 (2026-09-22)

- Sol High 4차 재검증은 Important 1 FAIL했다. `4dec81f`의 targeted same-name JSON CHECK 4종은 PASS였으나 빈 DB·existing profile 없음·유효 row·endpoint CHECK(true)에서 원본 rollback이 오류 후 기존 객체/행을 보존하는 회귀 4건이 삭제되어 있었다.
- 보완은 `behaviorRollback`·`checkBehaviorRollback`·`onlyJsonProbe`를 되살리지 않고 원본 `rollbackError(db)`와 각 fresh fixture에서 정확한 오류, private schema/public table, 유효 row 1건 보존을 확인한다.
- Task7/Task8 production은 미적용이며, 다음은 같은 Sol 독립 재검증 PASS다.

## 최신 인계 — Sol High 3차 FAIL 보존, 4차 재검증 대기 (2026-09-22)

- Sol High 3차 재검증은 HEAD `771ccf5`에서 Important 1·Minor 1 FAIL했다. 운영 SQL 새 결함은 없고 tests/sql `onlyJsonProbe`/`checkBehaviorRollback`이 원본 rollback preflight를 제거해 정확한 목표 증거가 부족했으며 기록도 과장됐다. 기존 FAIL 이력과 함께 보존한다.
- `4dec81f`는 테스트만 수정했다. preflight 삭제 변형 제거, same-name targeted CHECK 4종의 원본 `rollbackError(db)`·각 정확 오류·private schema/public table 보존을 추가했다. 상위 Task7/Task8/push 재실행 PASS다.
- 현재는 Sol High 4차 재검증 대기이며 Task7/Task8 production 미적용이다. 로컬 회귀 PASS와 독립 재검증 PASS를 구분한다.

## 최신 인계 — Sol High 2차 FAIL 보존, 3차 재검증 대기 (2026-09-22)

- Sol High 2차 재검증은 HEAD `c38964a`에서 Important 2·Minor 1 FAIL했다. endpoint regex의 backslash 2개가 dotted FCM을 거부했고 JSON drift probes는 endpoint check에서 먼저 실패한 위양성이며 기록 상세도 모순됐다. Task7 원본 rollback/policy drift 및 Task8 default/self-spoof는 PASS였다. 첫·둘째 FAIL 이력은 아래 기록과 함께 보존한다.
- `a521d1b`는 dot escape 실제 1개, FCM/Mozilla dotted 허용시험, JSON drift 4종의 독립 fresh fixture/정확한 목표 probe 및 원본 rollback reject·객체 보존을 추가했다. 상위 재실행 Task7/Task8/push PASS다.
- 현재는 Sol High 3차 재검증 대기이며 Task7/Task8 production 미적용이다. 로컬 회귀 PASS와 독립 재검증 PASS를 구분한다.

## 최신 인계 — Sol High 첫 FAIL 보존, v6 재검증 대기 (2026-09-22)

- Sol High 첫 독립 검증은 HEAD `39604f8`에서 Important 6건 FAIL했다. Task7 원본 rollback `proconfig`·dotted endpoint·policy drift·JSON CHECK drift, Task8 `applied_at` default/self-spoof·기록 과장이 원인이다. 이 이력은 아래의 기존 완료 기록과 함께 보존한다.
- Task7 `fa61fb2`는 v6 fingerprint `task7-push-v6-catalog`, manifest `push-v6-catalog-20260922`, SHA256 `b0cd63d9427445de8f2a03113dddd7bc6251cc9667a8655d160cf59512f0d3ff`, semantic MD5 `e4f10430874631e3ca0a9ed1423384d1`, snapshot MD5 `8774aede303f69fccd80680d8e283c4b`로 보완했다. 원본 apply→rollback·dotted endpoint·policy exact·JSON behavior gate를 추가했고 상위 재실행 PASS다.
- Task8 `77d0f11`·`33d8491`·`2ad9341`은 v6 동기화, `now/current_timestamp` default 의미 gate, new `prosrc` MD5 `08d9fa62fcc82616dd9f7cb3f8ebafac`, marker+identity 동시 self-spoof 음성시험을 추가했다. 상위 재실행 Task7/Task8/push PASS다.
- 현재는 Sol High 재검증 대기이며 Task7/Task8 production 미적용이다. 같은 Sol 재검증 PASS 후에만 Task7 운영 apply/verify → Task8 운영 apply/verify → 승인된 단계배포·실사이트 확인을 진행한다.

## 최신 인계 — Task6 production 완료, Task7/8 운영 대기 (2026-09-22)

- Task6는 production migration `employee_hub_notice_attachments_deposit_access_20260921` 적용을 완료했다. `notices=1` 및 `deposits=264`는 보존됐고, private `notice-attachments` 버킷은 10MB·6 MIME·objects=0 상태다. 자격증명이 없어 Storage API 실제 업로드는 미검증이다.
- Task7 첫 production apply는 fixed canonical mismatch로 transaction rollback돼 운영 변화가 없다. Task7 v5 로컬 정본은 `6941111`, `448bcc2`, `72c4749`, `1b2e36b`; fingerprint `task7-push-v5-catalog`, manifest `push-v5-catalog-20260922`, SHA256 `ae2606f243d91400b15624dbc9113ae3e6187ed03b7eef6d213d37f56799b53e`, MD5 `8179b7fed8536fe0516a0b29109f1728`다. PGlite exact catalog/behavior/fail-closed 및 push static PASS, 운영 미적용이다.
- Task8 로컬 보완 정본은 `373e829`다. Task7 v5 상수·identity·private allowlist, marker exact shape와 negative matrix를 보강했고 Task8/Task7 PGlite PASS다. 운영 미적용이다.
- Sol High 독립 검증과 Task7/Task8 운영 적용 대기, `직원허브 5차.zip` 미열람이라는 과거 상태는 최신 상단 상태로 대체됨이다. 실제 직원 메일·Push·생체입력, 자격증명 입력, 원본 삭제, 대량 이관, 보안 완화, 새 비용은 금지한다. `상담문의 등 일원화.zip`은 다음 활성 후속이다.

## 재부팅 정본 (2026-09-21)

- Task8 로컬 보완: Task7 fixed fingerprint/manifest·canonical/identity와 Task8 marker owner/ACL/RLS drift, old ACL 필수 EXECUTE 및 Sol M1 EOF 빈 줄을 fail-closed 시험으로 추가했다. 고정 PGlite 0.5.8 Task8·Task7 회귀 및 diff check PASS.
- Task7/Task8 hardening 로컬 PASS: Task7 same-name CHECK·helper/trigger·private namespace 및 Task8 marker column/constraint/index/trigger drift는 reapply/rollback 거부 fixture로 확인했다. 운영 미적용.
- 다음: Sol 독립 재검증. 그 전 운영 DB/push/deploy/5차 ZIP 열람 금지.

## Task 8 재부팅 체크포인트 (2026-09-21)

- 로컬 SQL: `db/attendance_owner_chief_gate_patch.sql` / rollback. Task7 private manifest가 선행이며 rollback 순서는 **Task8 → Task7**이다.
- 고정 PGlite 0.5.8에서 apply×2·drift fail-closed·RESET·rollback 구 함수 hash·reapply를 통과했다. 운영 migration/행 변경·push·배포·5차 ZIP 열람은 하지 않았다.

## 최신 정정 — Task 6 Sol High 최종 PASS (2026-09-21, 문서 갱신)

현재 구현 HEAD: `d0222684dd7da4607752c22b2912ad8bf4f0d87a`. Sol High 최종 PASS(Critical/Important/Minor 없음)이며 로컬 직접 Node 30개, PGlite, 인라인 JS, `git diff --check` PASS와 clean worktree를 확인했다. 닫힘 범위는 foldername 길이2, 게시 첨부 restrictive DELETE guard, JSON 구조/NULL 강제, 정책·RLS·ACL·버킷 rollback, apply×2 fail-closed, quoted role 복원이다. push·배포·운영 DB/Storage·실계정은 미수행이다.

운영 전 Storage 검증과 `직원허브 5차.zip` 미열람 대기라는 과거 상태는 최신 상단 상태로 대체됨이다. K3 관련 당시 기록은 보존한다.

## 과거 정정 — Task 6 Sol High 최종 판정 FAIL (2026-09-21, 문서 갱신)

현재 기준 HEAD: `1719e3f`. Task 6은 **로컬 구현은 있으나 최종 Sol High FAIL·배포 차단**이다. 아래 내용은 기존 완료·검증 이력을 삭제하지 않고 최신 안전 경계를 추가한 것이다.

### FAIL 근거

1. `db/notice_attachments_deposit_access_draft.sql:27,29`의 `array_length(storage.foldername(name),1)=3`은 실제 Supabase Storage 의미와 다르다. `uid/tmp/file`의 `foldername`은 `[uid,tmp]`이므로 길이 2이며, 현재 실제 업로드/cleanup DELETE가 RLS 거부된다. PGlite helper는 파일명까지 포함해 모사하여 위양성 PASS를 냈다.
2. 성공 첨부도 `uid/tmp/...`에 남는다. 작성자가 게시 첨부를 DELETE할 수 있어 링크가 깨질 수 있다. 성공 후 tmp 밖 확정 경로로 이동하거나 게시 객체 DELETE를 서버 절차로 차단해야 한다.

검증은 Node 23/23, 기존 PGlite 7/7(단, helper 오모사로 Storage 판정 무효), 실제 helper 의미 반영 시험 FAIL, 인라인 2 PASS, `git diff --check` PASS다. push·운영 DB/Storage 적용·Opus 검사는 실행하지 않았다.

### 다음 실행 순서

인계자료 `README.md` → 이 HANDOFF → `overview.md` → `todos.md` → `DECISIONS-employee-hub.md` → `WORKLOG-employee-hub.md` → 수용추적표 → source ZIP inventory 순서로 읽는다. 그 뒤 `git status --short`, `git rev-parse HEAD`, `git log --oneline 4865f89..HEAD`를 확인한다.

코드 수정 전 실제 Supabase `foldername` 공식 의미를 수용시험으로 고정한다. RED는 helper 길이 2와 게시 첨부 DELETE 거부를 검증하고, GREEN은 migration path 조건 수정·성공 첨부의 tmp 밖 확정 경로 이동 또는 서버 확정·타인/게시/비tmp DELETE 차단을 검증한다. PGlite/정적/전체 회귀와 Sol High 재검증 PASS, 사용자 승인된 Opus 읽기전용 외부 검사 뒤에만 push/운영 적용을 판단한다.

### 보호 경계

C: 원본 ZIP 6개는 보존되어 있고, Z: 복사본 6/6은 SHA256 일치한다. Sol PASS 전 push·운영 DB/Storage, 원본 삭제, 실제 직원 알림, 자격증명 노출, 대량 이관, 보안 완화를 금지한다.

- 갱신: 2026-09-21 Task 6 Sol High FAIL 보완 완료·최종 재검증 대기
- 기능 배포 기준 커밋: `0f3226b` (직접 push 완료)
- 배포 정본은 `origin/main`=`4865f89`이고, 현재 로컬 HEAD는 Task 6 기능·시험·문서 커밋을 포함한다. 이 로컬 커밋들은 아직 push·배포하지 않는다.
- 구현 worktree: `Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\.worktrees\calendar-ui-release`
- 구현 브랜치: `codex/calendar-ui-release`
- 기준 UI: `hr.html`; Task 6 SQL: `db/notice_attachments_deposit_access_draft.sql`; Task 6 합성시험: `tests/sql/pglite-notice-attachments-deposit-access.mjs`

## 범위 구분

| 범위 | 현재 상태 | 근거/경계 |
|---|---|---|
| A. 최초 `직원허브 수정 지침.zip` | Task 0~5 구현·검증·배포 완료 | 기존 ZIP 근무표 수용표의 ZIP-01~08 및 Task 2 이력을 보존한다. 원본 ZIP·엑셀의 실제 행은 반입하지 않는다. |
| B. 후속 `허브관련 2차.zip` | D 4차 UI에 흡수·최종 수정·사용자 승인·배포 완료 | 이후 새 요구만 별도 범위로 분리한다. |
| C. `직원허브 3차.zip` 피드백 | D 4차 UI에 흡수·최종 수정·사용자 승인·배포 완료 | 확정된 4차 결과를 현 배포 정본으로 삼는다. |
| D. 4차 UI/캘린더 보완 | `0f3226b`까지 main 반영 | 인증 후 실제 입력·저장·재조회만 미검증이다. |
| 후속 상담일지 요구 | 기본 및 `harden_consultation_journals` migration 운영 적용 | 실제 상담 기록은 0건이며, 시험 입력은 ROLLBACK했다. |
| E. Task 6 공지 첨부·예치금 | Sol High FAIL 추가 보완 `7ee01fd`, 최종 재검증 대기 | INSERT 서버 작성자·시각 고정, UPDATE 불변·서버 갱신시각, snapshot ACL·RLS 차단을 추가했다. 운영 적용·배포는 미수행이다. |

## 완료·배포·검증 증거

- 배포 커밋: `0f3226b` — `origin/main`에 반영됨.
- 상담일지 기본 migration: `add_consultation_journals` 운영 DB 적용 완료.
- 실제 적용 객체 RLS 재시험: 8/8 PASS. manager 입력·수정, owner 조회 허용; staff/chief 조회 차단, staff 입력·anon 조회 거부, `created_at` 변조 거부. 시험 트랜잭션은 ROLLBACK했다.
- Sol 검토: PASS.
- `db/consultation_journal_advisor_hardening.sql`: migration `harden_consultation_journals`로 운영 DB 적용 완료. 함수의 고정 `search_path`, `author_id` 인덱스, RLS 정책 initPlan을 보완했고, 적용 후 신규 상담일지 관련 Advisor security WARN은 0건이다. performance에는 신규 빈 테이블의 unused-index INFO만 남았다.
- 공개 확인: `https://jung-plant.com/hr.html?v=0f3226b`에서 상담일지·`consultation_journals` 마커 반영, 로그인 화면 정상 및 console error 0건.
- 기존 근무표 단계배포·집계·공개 URL 증거는 `docs/superpowers/specs/2026-09-20-employee-hub-zip-acceptance-matrix.md`에 보존한다.
- Task 6: `NOTICE_ATTACHMENTS_ACCEPTANCE_PASS`, `PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS`, 전체 직접 Node 30개 파일, `INLINE_SCRIPT_SYNTAX=PASS`, `git diff --check`를 로컬에서 통과했다. PGlite는 본인 tmp DELETE 성공·타인/비tmp/타버킷 거부, 기존 버킷 설정·기존 정책 식·table grant 왕복, 신규 빈 버킷 제거, 객체 존재 시 중단·보존을 확인한다.
- 원본의 시간상 최초 업로드는 `직원허브설명서관련.zip`, 승인 구현 정본은 `직원허브 수정 지침.zip`이다. 원본 6개의 읽기전용 해시·수량은 `docs/superpowers/specs/2026-09-21-employee-hub-source-zip-inventory.md`에 고정한다.

## 승인 범위·실행 상태

- 최초 ZIP의 승인된 추가형 구현·시험·DB/RLS/Storage·단계배포는 단계별 재승인 없이 진행한다.
- 별도 승인 게이트는 원본 삭제, 대량 이관/수정, 보안 완화, 새 비용, 자격증명 입력, 실제 직원 메일·push·알림, 외부 공개처럼 기존 범위를 확대하는 경우에만 적용한다.
- Task 6은 `7ee01fd`까지 보완·로컬 검증했으나 Sol High 최종 재검증은 대기 중이다. push·운영 DB/Storage 적용·배포는 하지 않았다.

## 아직 미완료 — Task 6~11

| Task | 다음 작업 | 외부 조건/승인 게이트 |
|---|---|---|
| 6 | 공지 첨부와 예치금 접근 | 로컬 보안 보완·PGlite 합성검증 완료. 운영 Storage 버킷/RLS 적용 전 정책/버킷/행/객체 스냅샷·백업·롤백 경로와 별도 시험 계정의 실제 업로드·저장/재조회가 남음 |
| 7 | 모바일 push 요구 구현 | VAPID·푸시 서비스 비용/자격증명/실기기 시험 승인 필요 |
| 8 | 출퇴근·PDF 계약의 운영 회귀시험 | 이미 구현된 범위의 양식·서명·보관 동작을 실제 운영 경계에서 검증 |
| 9 | 메뉴 도움말 구현 | 확정 메뉴 구조와 문구 확인 후 최소 범위 반영 |
| 10 | 기능별 단계배포·최종인수 | 역할별 실제 로그인 시험과 운영 화면 저장·재조회 확인 필요 |
| 11 | 결과보고서·사용설명서 | Task 6~10의 객관적 시험 결과를 반영해 최신화: `Z:\11_codex\03_병원운영·전산\직원허브_구현결과보고서.docx`, `Z:\11_codex\03_병원운영·전산\직원허브_사용설명서.docx` |

## 운영 시험 경계와 다음 순서

1. 별도 시험 계정으로 manager·owner·staff·chief 각각의 로그인/조회/입력/수정/저장 후 재조회 경계를 시험한다. 실제 환자·직원 원본은 사용하지 않는다.
2. Task 7~11은 위 표 순서대로 진행한다. Task 11 완료 뒤 `C:\Users\elusi\Downloads\상담문의 등 일원화.zip`을 별도 후속 범위로 전달한다.

## 보호·금지사항

- 원본 ZIP·엑셀·실제 상담/환자/직원 행은 이 인수인계 작업에서 수정·복사·기록하지 않는다.
- 자격증명, 토큰, API 키, 실사용자 식별값을 저장소·문서·테스트 출력에 넣지 않는다.
- 운영 DB의 schema/data, Storage, 인증 계정, 알림 서비스는 최초 ZIP의 승인 범위 안에서는 단계별 재승인 없이 변경할 수 있다. 단, 원본 삭제, 대량 이관/수정, 보안 완화, 새 비용, 자격증명 입력, 실제 직원 메일·push·알림, 외부 공개는 별도 승인을 받는다.
- 부모 작업트리 `Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan`은 사용자 작업이 섞여 있으므로 이 인수인계의 편집 대상이 아니다. 그 트리에만 있는 기존 구현계획 `docs/superpowers/plans/2026-09-20-employee-hub-zip-reconciliation.md`은 역사 원문으로 보존하고, 현재 배포 상태는 이 문서와 수용추적표를 우선한다.

## 재검증 명령

Windows 환경에서 `node --test`는 runner의 `spawn EPERM`으로 실패할 수 있으므로, 개별 파일을 직접 실행해 코드 실패와 분리한다.

```powershell
node tests/notice-attachments.test.js
$env:PGLITE_PACKAGE_ROOT='C:\Users\elusi\AppData\Local\Temp\employee-hub-pglite-0.5.8\node_modules\@electric-sql\pglite'; node tests/sql/pglite-notice-attachments-deposit-access.mjs
git diff --check
```

기록 갱신 시점의 코드 검증 결과는 상담일지 관련 direct Node 시험 PASS, `git diff --check` PASS였다. 위 명령은 운영 로그인·DB 적용을 대신하지 않는다.

## 2026-09-21 Task7/8 최신 인계
- Task7 portable semantic fixture와 Task8 apply/rollback PGlite PASS. 운영 적용·push·배포는 미수행.
