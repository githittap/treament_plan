# todos — 내부 도구(T8/D) 작업 목록

## AI 사용량 현황판 — AI비용 탭 통합 운영 반영 (2026-09-22)

- [x] 브랜치 `feature/ai-usage-panel`(기준 `63372e8`) → `main` fast-forward `74291e2`, Pages run `35712403783` success, 공개 `hr.html?v=74291e2` HTTP 200·표식 확인, 공개 파일 SHA256이 커밋과 동일, 로그인 화면 콘솔 오류 0.
- [x] 화면: AI비용 탭(원장 전용) 청구액 카드 아래 '📊 AI 사용량 현황판' 카드 한 장 — ① 모델별 사용량(최근 7일, Astra 노란 강조) ② 정가 환산 사용가치(청구액 아님, PC 상황판 값) ③ Codex 대화 효율 점검(오늘). 새 상단 탭 없음. 로컬 `AI사용량_상황판.html`은 그대로.
- [x] 운영 DB: migration `employee_hub_ai_model_usage_daily_20260922`·`employee_hub_ai_usage_snapshots_20260922`. 두 표 모두 RLS·원장 SELECT 정책 1개·anon 거부, 쓰기는 service_role 전용 함수(`ai_model_usage_replace`·`ai_usage_snapshot_put`)만. 반영 전후 Task 6 지문(`53a7a462…` 17개)·다른 정책 225·함수 46·표 70 지문 동일, advisor 새 경고 0.
- [x] Edge `ai-usage-sync` v1(id `c5d45a3f…`, verify_jwt=true): X-Sync-Token SHA-256을 `webhook_secrets(ai_usage_sync_sha256)`과 비교(원문 토큰은 PC `~/.config/ai-usage-sync/token`에만). 운영 거절 경로 8/8(JWT 없음·토큰 없음·틀린 토큰 401, GET 405, 모르는 kind·깨진 JSON·음수 400, 70KB 413).
- [x] 업로더 `C:\Users\elusi\.claude\scripts\hr_ai_usage_uploader.py` + 전용 예약 작업 `직원허브_AI사용량_업로드`(매일 12:50, 창 없음, 놓치면 켜진 뒤 실행). 코덱스문제(2) 세션 스크립트(`codex_watchdog.ps1`·`codex_session_health.py`·`codex_model_usage.py`·`collect_ai_usage.py`)는 수정하지 않고 결과 JSON 3개만 읽는다. 첫 실행: 모델 사용량 67행(보낸 행=저장 행)·스냅샷 2종, 결과 코드 0, 로그 `~/.claude/logs/hr_ai_usage_uploader.log`(토큰·대화 이름 미기록).
- [x] 검증: 새 시험 패널 11·통합 12·PGlite 2종(모델명 JS·SQL 판정 18종 일치, 검사 통과 스냅샷 DB 저장 일치)·로컬 Edge 23·업로더 8 PASS. 전체 회귀 46/49(실패 3건은 작업 전 기준선과 같은 Task 7·8 지문 시험). Astra 1차 FAIL(중요 2·경미 1)·2차 FAIL(중요 1) 지적은 반례를 시험으로 만들어 모두 보완(`3fb7714`·`74291e2`), 최대 2회 규칙상 3차는 돌리지 않음.
- [x] 원장 로그인 화면 확인(2026-09-22): 원장 "보이긴한다" 확인 + Claude가 원장 로그인 세션(앱 내 브라우저)에서 직접 확인. 모델별 사용량은 기간 9/16~9/22·마지막 동기화 18:47·합계 38.01억 토큰·29,794턴·모델 7종이며 Astra 행 노란 강조(1.14억·3.0%·866턴). 정가 환산 ₩8,712,313(누적 ₩22,173,314)·4플랫폼·3개월, 대화 점검 8건. 두 조회(`ai_model_usage_daily`·`ai_usage_snapshots`) HTTP 200. 같은 화면의 콘솔 403 1건은 기존 공지 읽음 기록(`notice_reads` upsert) 문제로 이번 작업과 무관(아래 미답변 표).
- [ ] (선택) 후속 2건은 추천 작업 칩으로 띄워 둠: ① 원래 실패하던 PGlite 시험 3건 정리(Task 7 지문 2건은 윈도우 줄바꿈 원인, Task 8 패치 1건) ② codex-bridge가 새 Codex 대화 대신 다른 진행 중 대화에 연결된 문제 조사. 둘 다 운영 영향 없음.
- 되돌리기: 프런트는 `63372e8` 재배포(이후 변경 없을 때), DB는 `db/ai_usage_snapshots_rollback.sql` → `db/ai_model_usage_daily_rollback.sql`(파생 데이터라 보존 게이트 없음), 예약 작업은 `Unregister-ScheduledTask -TaskName 직원허브_AI사용량_업로드`.

## 상담문의 일원화 1차

- [x] 운영 반영·독립 검증: migration `employee_hub_consultation_inbox_20260922`, Edge `consultation-ingest` v1 ACTIVE·`verify_jwt=true`, 동일 외부 이벤트의 DB 트랜잭션 idempotency/rollback, 권한·RLS·고정 search_path postflight, no-auth/위조 JWT 401, 공개 smoke와 독립 검증 PASS.
- [x] 결과보고서·사용설명서 최신화: 보고서 템플릿 자리표시자와 저장 스크립트, 사용설명서의 상담일지 내부 통합 문의함 절·8개 안내·기존 이미지 보존을 정적으로 확인했다.
- [x] 사용설명서 시각 QA: Pandoc→Edge headless→PDF→6페이지 PNG에서 제목 번호 결함을 발견·수정했고 전 페이지 가독성/잘림을 확인했다(PASS, Word 원본 렌더가 아닌 대체 렌더).
- [ ] 외부 수신 connector는 다음 승인 범위다. 카카오 채널 webhook은 1:1 상담 수신용이 아니며, 당근 수신 API 미확인·네이버 IMAP 993 별도 서버 자격증명은 별도 공식 API·자격증명 확인 뒤에만 검토한다.

## 직원허브 5차 — 원본 대조·운영 반영 완료

- [x] `직원허브 5차.zip` SHA256 `A177836684189BFAA4D0733F1EFF8D39B58B9F5FE71791E1F551DCD7C0EC5E3A` 요구 대조 완료. 7개 원본은 보존 복사본과 이름별 SHA256 일치, Downloads 원본 보존.
- [x] 근무표·수기근태·결근/미기록 후보·재직상태/접속차단 구현·검증·운영 반영 완료.
- [ ] 실제 Auth 계정 영구삭제만 문자 그대로 남음. 이는 의도적으로 수행하지 않으며 기록보존형 영구 접속차단을 안전한 대체로 유지한다.
- [x] `상담문의 등 일원화.zip`의 1차 범위인 상담일지 내부 통합 문의함은 운영 반영·문서 최신화까지 완료했다. 외부 자동 connector는 다음 승인 범위다.

## 직원허브 5차 — 재직상태·접속차단 운영 반영

- [x] 재직상태/접속차단, 단계형 A/B/C, ACL 보정 운영 반영: commit `6bffb86`, Pages run `35690778571` 성공, 공개 HTTP 200·배포 마커 확인. 이 로컬 후속은 운영 DB·push·deploy 금지.

## 직원허브 5차 — 결근/미기록 후보 기준

- [x] 로컬 구현·검증: `absence_confirm_after_minutes`/`absence_exclude_pending_manual` 기본값, 원장 설정 저장, 서울시각 cutoff 및 입사·재직·휴가·수기·실제근태 제외. 설정 실패 시 오늘 후보 fail-closed, 비공개 snapshot으로 기존 키의 값·label·updated_at 보존, 실제 삽입 키만 rollback하며 사용자 변경은 중단한다.
- [x] 운영 postflight ACL 보완: marker RLS/no-policy 외 `PUBLIC`·`anon`·`authenticated` table privilege를 모두 회수. 이미 적용된 marker에는 `db/absence_candidate_settings_acl_hardening.sql`만 적용하며 행·설정값은 변경하지 않는다.
- [x] 운영 반영·공개 smoke: migration `employee_hub_absence_candidate_settings_20260922`, ACL hardening `employee_hub_absence_candidate_settings_acl_hardening_20260922` success; `main` commit `3efbff9` push, Pages run `35693355918` success, 공개 HTTP 200·필수 표식 확인.
- [ ] 실제 역할별 설정 저장·후보 조회는 별도 실계정 운영 검증 범위다.

## 직원허브 5차 — 수기근태 2단계

- [x] 근무표 1단계: `8cc9030d300a39b43190831785cdfa9405b78239` main push, Pages run `35672912570` success, 공개 `hr.html?v=8cc9030` HTTP 200·월간 기본 표식 확인.
- [x] 수기근태 2단계 운영 적용: `employee_hub_attendance_manual_v2_20260922` PG17.6 성공. 기존 `manual_entries=8`·`revisions=8`·`attendance=0` 보존, 4열·v2 보안 경계·ROLLBACK 실동작을 확인했다.
- [x] Sol 최종: JS 25·PGlite 10·인라인 2·diff-check와 0분 rollback·연속 키보드 focus PASS.
- [ ] 운영 DB 적용은 완료. 이 기록 커밋의 push·배포와 실제 직원 데이터 시험은 하지 않는다.

## 최신 상태 — Task11 문서화 완료 및 다음 범위 (2026-09-22)

- [x] Task10 기록 커밋 `41327995d523e6583db14db4840e5628052d20e0`를 `origin/main`에 push했고 최신 Pages run `35666985589` success를 확인했다. 기능 배포 `eeac4f2`·run `35640892992`는 역사 증거로 유지한다.
- [x] Task11 결과보고서: `Z:\11_codex\00_결과보고서\직원허브_구현결과보고서_2026-09-22.html` (SHA256 `7AACA57558B9D6F6CEE9EB35E4781C1205CEA4217DF70BB5F5AC7E0C48A748F4`).
- [x] Task11 사용설명서: `Z:\11_codex\03_병원운영·전산\직원허브_수정지침_시안\직원허브_사용설명서.docx` (SHA256 `9CB2DB42EB8C78E2E43F4375C7E5F7F3CD47EB14A4234434BB9AA4B3F81E2B07`). Sol High HTML/content/OOXML/a11y/privacy PASS, 번들 LibreOffice 부재로 전 페이지 PNG visual QA는 미실행인 조건부 인도다.
- [ ] 실제 4역할 로그인·저장/재조회와 실제 직원 데이터·메일·Push·생체정보는 미검증·금지 경계를 유지한다.
- [x] `직원허브 5차.zip` 원본 보존·해시·인벤토리·요구 대조 완료. 이 과거 대기 항목은 최신 상단 상태로 대체됨.

## 최신 상태 — Task10 배포·공개 smoke 완료 (2026-09-22)

- [x] Task10 기능 배포: `eeac4f2d9827f01764be66f8616717b732623fd0`를 `main`에 반영했고 GitHub Pages run `35640892992` build/deploy success를 확인했다.
- [x] 공개 smoke: `jung-plant.com/hr.html?v=eeac4f2` HTTP 200(498479 bytes), GitHub Pages 501015 bytes, 양쪽 `push_subscriptions`·`WORK_DOC_GUIDE_OPEN`·`consultation_journals` 표식 확인. CDP reload 오류/실패/Log error·warn은 0건이며 form 권고 verbose 5건만 확인됐다.
- [ ] 실제 4역할 로그인·저장/재조회, 실제 데이터·메일·Push·생체정보 시험은 자격증명 없이 미검증으로 남긴다.
- [ ] 다음: Task11 설명서. 프론트 롤백 기준 `4865f89`; DB 롤백은 별도 증거 게이트를 따른다.

## 최신 상태 — Task7·Task8 운영 완료 (2026-09-22)

- [x] Task7 migration `employee_hub_push_subscriptions_v6_20260922` 적용·검증: PG17.6, rows=0, RLS, policy 4개, trigger 1개, constraints 5개, canonical=`4f7a3ffc459b04e0a3c87ea8dfda8c28`, 관련 advisor 0건.
- [x] Task8 migration `employee_hub_attendance_owner_chief_gate_20260922` 적용·검증: marker 1건, FORCE RLS·역할 SELECT 없음, `prosrc=08d9fa62fcc82616dd9f7cb3f8ebafac`, chief gate=true·old bypass=false, 수기근태 `entries=8`·history=9 보존, Task7 canonical 유지. private marker no-policy INFO는 의도된 deny-all.
- [x] Task9 메뉴 도움말: 기존 `hr.html` workdocs 탭의 사용 설명서·열기/닫기·메뉴별 안내·권한 차이를 확인했다. 새 상단탭·민감정보 없음, work-documents 4/4·guide 2/2·home-work-docs 1/1 PASS. 통합 `node --test` spawn EPERM은 코드 실패가 아니다.
- [ ] 다음: Task10 역할별 단계배포·최종인수 → Task11 설명서.
- [ ] 실제 직원 Push·실기기·VAPID는 미수행이며 계속 금지한다. `직원허브 5차.zip` 미열람이라는 과거 상태는 최신 상단 상태로 대체됨이며, `상담문의 등 일원화`는 다음 활성 후속이다.

## 과거 미완료 — Task6~8 운영 순서 (2026-09-22)

- [x] `e607ff6`은 targeted JSON 4종/복원 4건 오류를 전체 문자열 exact equality로 고정했고 전체 JS/PGlite가 PASS했다. Sol High 6차는 이 커밋의 기록 미기재로 Minor 1 FAIL했으며 production은 미적용이다.
- [x] 최종 독립 대조·PG17 읽기 전용 preflight 뒤 Task7 apply/verify → Task8 apply/verify를 완료했다. 상세 운영 증거와 현 상태는 위 최신 상태를 따른다.
- [x] Sol High 5차 독립검증은 기능·독립 시험 PASS이나 기록 미동기와 targeted JSON 4종/복원 4건의 exact assertion 부재로 Minor 2 FAIL. `95c296d`의 4차 복원은 보존하고 PGlite `Error.message` 전체 동등 비교로 보완했다.
- [x] Sol High 7차는 코드 안전성 PASS이나 overview/todos의 6차 대기 두 줄 stale로 Minor 1 FAIL했다. 이 기록 수정 후 8차 최종 문서 대조 대기이며 production은 미적용이다.
- [x] Sol High 4차 재검증은 Important 1 FAIL: targeted same-name JSON CHECK 4종은 PASS였으나 빈 DB·existing profile 없음·유효 row·endpoint CHECK(true)의 기존 데이터/객체 보존 회귀 4건이 삭제됐다. 원본 rollback 경로의 정확 오류와 보존 시험을 복원했으며, 독립 재검증 PASS 전 Task7/Task8 production은 미적용이다.
- [x] Task6 production migration `employee_hub_notice_attachments_deposit_access_20260921` 적용. `notices=1`·`deposits=264` 보존, private `notice-attachments` 10MB/6 MIME/objects=0 확인. Storage API 실제 업로드는 자격증명 부재로 미검증.
- [x] Task7 첫 production apply는 fixed canonical mismatch로 transaction rollback됐으며 운영 변화 없음.
- [x] Sol High 첫 독립 검증은 HEAD `39604f8`에서 Important 6건 FAIL. Task7 rollback `proconfig`·dotted endpoint·policy/JSON drift와 Task8 `applied_at` default/self-spoof·기록 과장을 보완 대상으로 고정.
- [x] Task7 v6 `fa61fb2`: fingerprint/manifest/hash/MD5 갱신, 원본 apply→rollback·dotted endpoint·policy exact·JSON behavior gate 보강, 상위 재실행 PASS.
- [x] Task8 `77d0f11`·`33d8491`·`2ad9341`: v6 동기화·default 의미 gate·new `prosrc` MD5·marker+identity 동시 self-spoof 음성시험 추가, 상위 재실행 Task7/Task8/push PASS.
- [x] Sol High 2차 재검증은 HEAD `c38964a`에서 Important 2·Minor 1 FAIL. endpoint backslash 2개·JSON probes 위양성·기록 상세 모순을 보완 대상으로 고정했고, Task7 원본 rollback/policy 및 Task8 default/self-spoof는 PASS.
- [x] `a521d1b`: dot escape 1개·FCM/Mozilla dotted 허용시험, JSON drift 4종의 독립 fresh fixture/목표 probe와 rollback reject·객체 보존을 보강. 상위 재실행 Task7/Task8/push PASS.
- [x] Sol High 3차 재검증은 HEAD `771ccf5`에서 Important 1·Minor 1 FAIL. 운영 SQL 새 결함은 없고 tests/sql 원본 rollback preflight 제거·정확 목표 증거 부족·기록 과장을 보완 대상으로 고정.
- [x] `4dec81f`: preflight 삭제 변형 제거, same-name targeted CHECK 4종의 원본 `rollbackError(db)`·정확 오류·private schema/public table 보존을 보강. 상위 Task7/Task8/push PASS.
- [x] Sol High 4차 재검증은 Important 1 FAIL로 종료됐고 `95c296d`가 기존 데이터 보호 회귀를 복원했다. 현재 Task7/Task8 production 미적용이며, 운영 apply 조건은 '최종 독립 대조 PASS 후 Supabase PG17 읽기 전용 preflight → Task7 apply/verify → Task8 apply/verify'로 통일한다.
- [x] Task7 운영 검증 뒤 Task8 운영 apply/verify를 완료했다. 단계배포·최종인수는 위 Task10 후속으로 분리한다.
- [ ] 실제 직원 메일·Push·생체입력, 자격증명 입력, 원본 삭제, 대량 이관, 보안 완화, 새 비용은 수행하지 않는다. `직원허브 5차.zip` 미열람이라는 과거 상태는 최신 상단 상태로 대체됨이며, `상담문의 등 일원화.zip`은 다음 활성 후속이다.

## 재부팅 정본 (2026-09-21)

- [x] Task8 marker drift fail-closed·Task7 marker 정합·old ACL 필수 EXECUTE 보완. Sol M1 EOF 빈 줄은 혼합개행 RED로 재현 후 보완·PGlite Task8/Task7 및 diff check PASS.
- [ ] 다음: Task7/Task8 hardening Sol 독립 재검증. 그 전 운영 preflight/apply·push·smoke와 5차 ZIP 열람 금지.

## 🟡 Task 8 수기근태 원장-실장 gate 로컬 패치 — 운영 적용 금지 (2026-09-21)
- Task7 private manifest를 사전 대조하고, pending 수기근태 원장 직접확정을 막는 SQL·역순 rollback 초안을 추가했다. marker/함수 identity·ACL·RLS drift는 중단한다.
- [x] 고정 PGlite 0.5.8 적용×2·drift 거부·RESET·rollback 구 해시·재적용 왕복을 확인했다. 운영 DB 행, push, 배포, 5차 ZIP 열람은 금지한다.

## 🟡 Task 7 모바일 Push 로컬 기반 완료 — 운영 연결 대기 (2026-09-21)
- `hr.html` 업무자료 내부의 준비 상태·내 구독 해제, `sw.js` push/notificationclick, 본인 active/approved RLS 초안을 로컬로 추가했다. marker·snapshot·guard/helper는 비노출 `employee_hub_private` schema에 있으며 PUBLIC·anon·authenticated·service_role 직접 권한을 회수하고 authenticated에는 상태 helper 실행만 최소 부여한다. 고정 v3 manifest와 migration 직후 OID/ACL/RLS/함수·정책·trigger·제약·index/column snapshot을 rollback 전 비교해 drift를 fail-closed로 차단한다. 해제는 endpoint 한 행 DB 삭제 성공 뒤 browser unsubscribe를 수행해 DB 실패 시 재시도 가능하다. `tests/push-notifications.test.js`와 `tests/sql/pglite-push-subscriptions.mjs`는 VM·PGlite로 이 경계를 검증한다.
- VAPID·서버 발송·실제 기기 권한/구독·직원 발송·운영 migration은 미수행이며 별도 비용·자격증명·실기기 검증 후 진행한다.

## ✅ Task 6 공지 첨부·예치금 권한 분리 — Sol High 최종 PASS, 운영 적용 대기 (2026-09-21)
- 구현 HEAD `d0222684dd7da4607752c22b2912ad8bf4f0d87a`, Sol High PASS(Critical/Important/Minor 없음), 로컬 직접 Node 30개·PGlite·인라인 JS·diff check PASS 및 worktree clean.
- 닫힘: foldername 길이2, restrictive DELETE guard, JSON 구조/NULL 강제, 정책·RLS·ACL·버킷 rollback, apply×2 fail-closed, quoted roles.
- [ ] 운영 전: Storage DELETE/ALL 정책·ACL·RLS·버킷/객체 snapshot, 별도 시험계정 upload/download/cleanup/게시 후 삭제 거부/MIME·10MB, 복제환경 rollback, 단일 migration 실행. push/deploy/운영 DB·Storage·실계정은 아직 미수행.
- [ ] 최종 직전 외부 Opus 읽기전용 검증과 `직원허브 5차.zip` 미열람 대기는 과거 상태이며 최신 상단 상태로 대체됨. K3 관련 당시 기록은 보존한다.

## 과거 Task 6 Sol High FAIL 기록 (2026-09-21)
- 이전 `2e1de31`·`ffb58fb` 기록은 permissive 공지 정책 결함 발견으로 대체됐다. 보완 커밋 `4e346cf`, 검증 커밋 `28529d0`: private `notice-attachments` 버킷의 서버 MIME/10MB/UUID tmp 경로, 단일 INSERT 정책, 서버 작성자 이름 고정·불변 필드 트리거, private download·실패 임시객체 정리를 사용한다. DELETE는 승인·활성 본인의 `uid/tmp/...`만 허용하고 타인·비tmp·타버킷은 거부한다. 예치금 조회는 데스크·chief·owner로 분리한다.
- 검증: 고정 PGlite 0.5.8에서 apply→rollback 정책 식·버킷·권한 왕복, 신규 빈 버킷 제거, 객체 존재 시 중단·보존을 확인했다. 전체 직접 Node 30개 파일, 인라인 JS 구문검사와 `git diff --check`를 통과했다.
- Sol High FAIL 추가 보완 `7ee01fd`: 클라이언트가 2000년 시각을 보내도 INSERT의 `created_at`·`updated_at`은 서버 시각으로 저장되며, snapshot 표의 anon·authenticated grant 0개와 SELECT·UPDATE 거부를 확인했다. 독립 최종 재검증은 미완료다.
- [ ] 운영 적용 전: SQL/RLS/Storage 검토·백업/롤백 경로 확인, 별도 시험 계정 역할별 업로드·저장·재조회, 승인된 push·배포 확인. 운영 DB/Storage·실제 계정·실데이터는 변경하지 않았다.
- [ ] **Sol High FAIL 정정:** `db/notice_attachments_deposit_access_draft.sql:27,29`의 `array_length(storage.foldername(name),1)=3`은 실제 Supabase에서 `uid/tmp/file` → `[uid,tmp]` 길이 2와 불일치한다. 실제 업로드/cleanup DELETE가 RLS 거부되고, 기존 PGlite helper는 파일명까지 포함해 위양성 PASS를 냈다.
- [ ] 성공 첨부가 `uid/tmp/...`에 남으면 작성자가 게시 첨부를 DELETE해 링크를 깨뜨릴 수 있다. 성공 후 tmp 밖 확정 경로로 이동하거나 게시 객체 DELETE를 서버 절차로 차단해야 한다.
- [ ] 재검증 순서: 실제 helper 의미를 반영한 RED(길이2, 게시 첨부 삭제 거부) → migration path 조건 수정 및 tmp 밖 확정 경로 GREEN → PGlite/정적/전체 회귀 → Sol High PASS → 사용자 승인된 Opus 읽기전용 외부 검사 → 그 뒤 push/운영 적용 판단.
- [ ] 검증 집계: Node 23/23, 기존 PGlite 7/7은 Storage 판정 무효, 실제 helper 의미 반영 시험 FAIL, 인라인 2 PASS, diff check PASS. push/운영 적용/Opus 미실행.
- [ ] Task 7~11: 모바일 push, 출퇴근·PDF 계약 운영 회귀, 메뉴 도움말, 최종인수, 결과보고서·사용설명서. `상담문의 등 일원화.zip`은 선행 전체 완료 후 별도 후속 범위다.

## ✅ Task 4 직원서류·입사 체크리스트·개인서명 단계배포 완료 (2026-09-21)
- 변경: `hr.html` 입사서류 첫 화면에 공통 체크리스트를 추가했다. 계좌는 은행명+계좌번호, Notion은 ID+앱 설치+워크스페이스 로그인, 잠복결핵·자격증·보안서약은 파일 존재 기준으로 완료를 표시한다. chief·manager는 완료 여부만 점검하고 계좌 원문은 보지 않는다.
- 문서함: 체결 근로계약서·일반 직원서류를 기존 한 목록에서 날짜순으로 보며, 일반 업로드는 PDF/JPG/PNG/DOC/DOCX/HWP 및 10MB·0바이트 제한을 화면·DB Storage metadata 양쪽에서 검사한다. 실행·압축 파일은 허용하지 않는다.
- 운영 migration: `employee_onboarding_signature_hardening_20260921` 적용. SQL SHA256 `ADF6729B687F298C317A5DF22D4C9A381CCCA98AB6E60C047FFE84C4419A3B14`.
- 보안 경계: 완료 여부는 민감 원문과 분리된 RLS 표로 제공하고, 내부 트리거 함수는 비노출 `employee_private` 스키마·빈 search path·직접 실행권한 없음으로 고정했다. `employee_documents`와 신규 표의 anon 권한을 회수했다. 개인서명은 PNG 1MB 비공개 버킷이며, 감사기록은 직원이 수정·삭제할 수 없고 등록된 원본 객체도 일반 사용자가 지울 수 없다.
- 검증: PGlite 역할/RLS·Storage 2개, 전체 루트 JS 21개 파일, 인라인 JS 2개 파싱, `git diff --check` 통과. Supabase security advisor는 적용 전후 동일 경고만 남아 Task 4 신규 경고가 없다.
- 보존 확인: 적용 전후 `employee_documents=0`, `hr-docs` private/객체 1개 유지. 신규 증빙·서명 5개 표는 모두 RLS 활성화·0행이며 `employee-signatures` private/객체 0개다. 실제 직원 개인정보·서명·파일 업로드는 하지 않았다.
- 프런트 배포: `7e3b40c7f0927340c54c878a4957fdbf15956d0a`까지 `origin/main` fast-forward. `https://jung-plant.com/hr.html?release=7e3b40c-2` HTTP 200, 공통 체크리스트·개인서명·완료상태 표식을 확인했다.
- 롤백: 프런트는 배포 직전 `8e56a1bd5e0aec26cbac0e5421e1e29c9799b6f6`으로 되돌린다. DB는 Storage 정책·신규 버킷·트리거·내부 함수·신규 표를 역순 해제하고 `employee_documents` 제약·권한·`hr_docs_insert_scoped` 정책을 이전 정의로 복원한다. 기존 `hr-docs` 객체는 삭제하지 않는다.

## ✅ 후속 `허브관련 2차.zip` — 4차 확정 결과에 흡수됨 (2026-09-20, 과거 대기 기록 대체)
- 아래 과거 대기 서술은 당시 상태이며, 현재는 4차 UI에 흡수·최종 수정·사용자 승인·배포 완료라는 HANDOFF 정본으로 대체한다.
- 시안 승인 뒤 순서: 서류제출 통합(연차증빙·계정/Notion·퇴사/휴직/재직증명) → 근무표/계약/연차 → 캘린더 → 생체 원본과 분리된 개인 출퇴근 월간 기록 → 기능별 시험·RLS/Storage·모바일/데스크톱·단계 배포.
- 기존 데이터 삭제·대량이관·실제 직원 시험발송은 제외한다.

## ✅ `직원허브 3차.zip` 피드백 — 4차 확정 결과에 흡수됨 (2026-09-21, 과거 결정대기 기록 대체)
- 원본 보존: `C:\Users\elusi\Downloads\직원허브 3차.zip`, 281,206 bytes, 6개 항목(Markdown 1·PNG 5), SHA256 `953610DDB7BBCD69007677756279EDAC34936EBC1F7056642F1F93643DCE1175`.
- 시안: `C:\Users\elusi\.codex\visualizations\2026\09\20\01a0bf28-ff51-7ff2-9621-d8d2a1dc9589\직원허브_2차_시안.html`, SHA256 `3AF2668BFEE9D0F130700B2C04256FDFD0C6E5F879D114CA80844BDC211D14CF`. 운영 코드·DB에는 적용하지 않았다.
- 분류: 기존 화면·가명·무저장·PNG/PDF는 유지, 휴직 신청 제거·생체 의미 안내는 2차 수정, 지문 체크→매니저 승인대기·직무별 숫자 기본/상세 명단·색상·야간 전원·모바일 알림 방향은 3차 신규 피드백으로 반영했다.
- 과거 판단대기 항목은 당시 시안 상태 기록이며, 현재는 확정된 4차 결과를 배포 정본으로 삼는다. 이후 새 요구만 별도 범위로 분리한다.
- 검증: Terra medium 보완 뒤 Sol high 읽기 전용 재검증 PASS. 기본 숫자/상세 명단 토글, 직무 6색, 9월 23일 야간 3명 일치, 모바일 1~30일 접근, 인라인 html2canvas PNG·PDF 인쇄, HTML/JS 파싱을 확인했다.

## ✅ Task 3 연차 신청 증빙·월차 자동발생 운영 적용·프런트 배포 완료 (2026-09-20)
- 변경: `hr.html` 입사서류의 직원 서류함 안에 별도 `연차 신청 증빙` 하위 카드를 추가했다. 일반 `employee_documents`·`hr-docs`와 분리한 `leave_application_documents`·`leave-docs`를 사용하며, 관리자는 조회만 하고 업로드는 본인 신청 건에만 허용한다.
- 운영 migration: `leave_application_documents_monthly_accrual_release_20260920` 적용 후, 기존 default privilege를 명시적으로 회수한 `leave_application_documents_monthly_accrual_security_fix_20260920`를 적용했다. SQL SHA256은 각각 `D56EC2D8B2402B933CB49140EE08E36C6D2170B54A611519279889C742D4FF18`, `CD4D02903CE907FB762F543CC7BADAAC700D4EEC6DE63095282039819D7364DA`.
- DB 경계: `leave_accrual_runs`의 `unique(user_id,due_date)`로 발생 후보를 구조적으로 식별한다. 1년 미만 1~11회 후보만 owner에게 미리보기로 제공하고, 개근 근태 확인 연결 전 `apply_monthly_leave_accruals`는 SECURITY INVOKER로 실제 ledger 기록을 항상 차단한다. 수동 ledger·잔액은 수정하지 않는다.
- 이채원 경계: 입사일 `2026-09-18`은 `2026-10-17`까지 후보 0건, `2026-10-18`에 1회, `2026-11-17`까지 1회, `2026-11-18`부터 2회 후보이며 12회 자동 지급은 없다.
- 검증: 직접 순차 Node 정적/회귀 20개 파일, PGlite SQL 2개, 인라인 파싱, `git diff --check`를 재실행한다. `node --test` 병렬 실행은 Windows 샌드박스 `spawn EPERM`으로 미사용.
- 운영 전후 스냅샷: 적용 전 `profiles=21`, active·approved=20, hire_date=13, `leave_requests=27`, `leave_ledger=30행/115.5일`, `employee_documents=0`, `hr-docs` private/객체 1개였다. 적용 후 새 두 테이블은 RLS 활성화·0행, `leave-docs` private/객체 0개이며 기존 `hr-docs`와 기존 연차 데이터는 그대로다.
- 운영 검증: `authenticated`는 증빙 SELECT/INSERT/DELETE 및 월차 후보 SELECT만 보유하고, anon 함수 실행은 모두 거부된다. 롤백 트랜잭션으로 owner 미리보기 허용·비owner 거부·apply 항상 차단을 확인했다. Supabase security advisor는 적용 전후 동일 경고만 남아 Task 3 신규 경고는 없다.
- 배포 확인: 최종 교정 커밋 `b400e0b`을 `origin/main`에 반영했다. `https://jung-plant.com/hr.html?release=b400e0b`은 HTTP 200이며, 연차 증빙 업로드 표식과 로그인 기본 화면이 정상 로딩된다. 실제 직원 로그인·업로드·알림은 하지 않았다.
- 롤백: 프런트는 보완 커밋 이전으로 되돌리고, DB는 새 테이블·RLS·함수·Storage 정책을 역순 해제한다. 이미 생성된 ledger는 삭제하지 않고 owner 조정 이력으로 복구한다. 현재는 실제 ledger·직원 문서 행을 만들지 않았다.

## ✅ ZIP 근무표 직무표 단계배포 완료 (2026-09-20)
- 배포 커밋: `050bd980b7e2892e5becd37de068720bf3cfad22` — `origin/main` fast-forward. 배포 확인 시각: 2026-09-20 18:32 KST.
- 운영 migration: `unified_schedule_department_compatibility_20260920`; SQL SHA256 `C60118680E255863EA120C1A67C794D2BB090F51AF46E7132439EF94A40740DA`.
- 사전·사후 집계 동일: `schedule_people=21`, `schedules=281`, `schedule_weeks=10`, `holidays=9`, `leave_requests=27`; 부서별 `Dr.=3`, `미지정=18`.
- constraint는 기존 `Dr./진료실/데스크/기공실/미지정`에서 `상담/행정`만 추가 허용. 행 수정·삭제 없음.
- 롤백 SQL: `alter table public.schedule_people drop constraint if exists schedule_people_department_check; alter table public.schedule_people add constraint schedule_people_department_check check (department in ('Dr.', '진료실', '데스크', '기공실', '미지정'));`
- 검증: 전체 18개 JS 테스트 파일 142/142, 근무표 관련 73/73, `git diff --check`, 공개 `hr.html` HTTP 200·정적 마커·정규화 SHA 일치.
- 보호: 원본 ZIP/XLSX·환자정보 비노출, 실제 직원 데이터 조작·알림 발송·로그인/저장/역할별 운영 검증은 하지 않음.

## ✅ 출퇴근 수기정정·승인 경로 운영 적용 (2026-09-20)
- **운영 migration 적용 완료**: Supabase `texevhsxttfoqkrucfzl`, migration `attendance_issue_resolution_release`. 적용 전 SQL SHA256 `039A4679134CB4042835D4CF58F9DF89750EEEC4DFF26AFB5260DFA087BC4E2F`; 기존 migration 목록에 없음을 확인한 뒤 적용.
- **운영 사후검증 완료**: `attendance`, `attendance_issues`, 신규 4개 테이블 모두 RLS 활성화. 승인·수기정정·자동누락 RPC 7개와 `guard_attendance_issue_insert` 트리거 존재 확인. 출퇴근 관련 6개 테이블 행 수는 모두 0건으로 기존 데이터 보존 확인.
- **권한 경계 확인**: 신규 직접 쓰기 권한은 부여하지 않고 authenticated SELECT와 RPC 실행 경로만 사용. `attendance_issues` 직접 INSERT/UPDATE 권한은 제거된 상태 확인.
- **로컬 검증**: 정적 릴리스 테스트 4/4 통과. `node --test`는 Windows 샌드박스 `spawn EPERM`으로 실행기만 실패했으며, 테스트 파일 직접 실행은 통과. 알려진 PGlite 의존성 경로를 지정해 `PGLITE_ATTENDANCE_RELEASE_PASS`까지 실제 재검증 완료.
- **남음**: 검토된 파일만 commit/push 후 `https://jung-plant.com/hr.html` 실제 정본 도달·익명 화면 확인. 로그인·실제 직원 입력은 자격증명/실데이터 없이 미검증.
- **배포 완료**: commit `89d1b0b731d31666f1e01c449f181c3219c67215`를 `origin/main`에 fast-forward push. `https://jung-plant.com/hr.html?release=89d1b0b` HTTP 200, 핵심 `submit_manual_attendance`·`submit_attendance_issue`·`record_auto_attendance_issue`·`fetchAttendancePages` 표식 확인. 원격 정본 SHA256 `B70040E3F50E75CA37BE9003005950699851091F7AE30BE69ECACDDE7BAAD86F`는 로컬 정본 LF 정규화 해시와 일치.
- **남은 검증**: 브라우저 자동 접근은 기존 탭 응답 지연으로 완료하지 못했으며, 로그인 후 직원·실장·원장 화면과 실제 입력/승인은 자격증명 및 실데이터 없이 미검증. 기존 탭 사용자는 새로고침 필요.

갱신 2026-09-09 · 상세 상황판: `Z:\09_claude-output\04_AI·Claude운영\산출물\치과내부도구_상황판.html`

## ✅ 연차 1단계 운영 호환성 정상화·배포검증 중 (2026-09-20)
- 로컬 `hr.html`·`db/hr_leave_workflow.sql`에 chief의 `대기·1차승인` 처리, owner 승인완료 취소·복구 RPC 호출, `grant_leave_entry` active/approved 가드, 인쇄 direct-child `display:none`을 반영.
- 정적·문법 검증 123개 통과. 승인 상태인데 사용 ledger가 없는 운영 행은 0건(승인 19건) 확인.
- 운영 적용 확인: `approved_leave_cancellation_active_guards`, `approved_leave_active_profile_write_guards` migration과 4개 RPC 정본 적용을 총괄이 확인. SELECT와 전역 `my_role()`은 변경하지 않음.
- 연차 두 테이블 쓰기 5개 정책의 active/approved 조건과 4개 RPC의 anon 실행권한 제거를 운영에서 확인. SELECT와 전역 역할 함수는 그대로 유지.
- 총괄 DB 시험 통과: 임시 1일 신청 승인 시 실제 잔액 -1, 원장 취소 시 원복·사용 이력 보존·복원 1회, 중복/타인 취소 거부, 실제 잔액 0 설정, 비활성 직원/원장 직접 쓰기 및 부여 RPC 거부. 임시 상태·신청·ledger는 모두 ROLLBACK. 로컬 시험 파일은 별도 보완 중이며 이 검증의 근거로 혼용하지 않음.
- 남음: `jung-plant.com/hr.html` 도달 확인·관련 파일 commit/main push.

## 📦 ZIP 자료 반영 체크리스트 (2026-09-20)
- [x] **입사일 보완**: 사용자가 확인한 직원 입사일 2026-09-18을 반영·재조회. 갱신 계약 시작일을 실제 입사일로 무조건 덮어쓰지 않음.
- [ ] **연차 개선**: 승인·수정·취소·잔액 설정은 이번 코드/DB 검증 완료, 웹 배포 확인 필요. 직원서류함 연차 분류 등 ZIP의 추가 요구까지 완료한 것은 아님.
- [ ] **근무표·캘린더 개편**: 기존 캘린더 기능은 있지만, ZIP의 주간 기본·부서별 배치·야간·월간 편집 등 추가 요구는 미완료.
- [ ] **출퇴근 기록 XLSX**: 원본 구조 확인·로컬 분석 단계. 운영 attendance 이관/검증은 미완료.
- [ ] **상담일지 XLSX**: 원본 구조 확인·로컬 분석 단계. 상담 탭 운영 반영은 미완료.
- [ ] **직원서류·입사 체크리스트·매뉴얼**: 기존 서류함/계약 열람과 ZIP의 추가 입력·분류·교육·서명 요구를 구분해 구현·검증 필요.
- [ ] **알림·공지·입금 권한·모바일**: 이 과거 묶음 중 공지 첨부/이미지·부서별 예치금 접근은 Task 6 로컬 보안 보완 완료로 대체됐다. 모바일 push·실기기 알림은 Task 7로 미완료다.
- [ ] **계약 PDF 서식 검토·결재함 안내**: 원문 보존 방식과 안내 보완 확인 필요. 상단 탭 전체 개편은 지침에서 보류된 범위로 유지.

📖 **원장용 통합 설명서(계속 갱신)**: `Z:\09_claude-output\03_병원운영·전산\아산정플란트_내부도구_통합설명서.html` — "어디서 뭘 누르나 + 쉬운 설명 + 앞으로 만들 것(D1~D6)". 새 기능 배포 시 **이 파일을 갱신**하고 원장께 다시 전달. 파일명 고정(날짜 없음)이라 링크 유지됨.

## 🧭 이번 세션 인수인계 (2026-09-12~15 · 근로계약서·AI비용·연차개선 대량 배포) — 컨텍스트 83%로 마무리, 누적보존 완료
> 이 세션에서 배포 완료(전부 push됨): 근로계약서 전체(서식·서명·실장권한)·AI비용 SMS자동웹훅(v3)·hr AI비용탭·캘린더 월그리드+휴무표시·연차현황 신규탭·leave차단메시지 강조. **codex-delegate 정책이 이 세션 중 폐기됨 — 이제 Claude 직접 코딩이 기본.** 아래는 상세, 이전 세션(~09-09) 요약은 그 아래 압축.

**이번 세션 핵심 배포:**
- **직원 서류함 배포(2026-09-17)**: 입사서류 탭에 PDF·JPG·PNG(각 10MB) 업로드·열람 기능 추가. `employee_documents` 표와 비공개 `hr-docs/<직원 UUID>/...` 경로를 사용하며, 직원은 자기 서류만, 원장·실장·매니저는 전 직원 서류만 열람·업로드 가능하도록 RLS를 교체. 기존 Storage 버킷은 0개 파일인 것을 확인하고 적용.
- **근로계약 만료 사전알림 구현(2026-09-17)**: 관리자(manager·chief·owner) 홈과 근로계약서 탭에 직원별 최신 계약 기준 알림 추가(D-60 예정·D-30 주의·D-14 긴급·만료 경과). 기존 `계약종료` 빈 값은 `관리자 확인 필요`, `기간의 정함 없음`은 알림 제외. 새 계약 발송은 종료일 또는 `기간의 정함 없음` 중 하나를 반드시 선택하도록 검증. 기존 목록의 `due_at` 표기는 실제 의미에 맞춰 `서명기한`으로 정정. DB 변경 없음.
- **기존 계약 종료일 보완 화면 추가(2026-09-17)**: 근로계약서 목록의 `종료일 설정`에서 날짜 또는 `기간의 정함 없음`을 관리자·실장·원장이 저장 가능. 기존 `fields`의 다른 항목과 계약 원문·서명·발송기록은 보존하고 `계약종료` 값만 갱신. RLS는 기존 lead UPDATE 정책으로 실측 확인.
- **근로계약서 전체 기능**(커밋 `5bc9deb`+보강): `doc_templates` 신설(마주옥 제1~11조+개인정보동의+병원직인 base64, 프리셋 7역할), hr `근로계약서` 탭(원장→실장·매니저까지 확대, 직원 canvas 서명). **원장 실서명 end-to-end 테스트 완료 확인**. 전자서명 감사추적·불변화·해시보존은 다음 큐.
- **AI비용 SMS 자동웹훅**(Supabase Edge Function `ai-billing-webhook` v3) — 처음엔 원화(원) 패턴으로 잘못 만들었다가 원장이 보여준 실제 문자(USD 해외승인)로 v2→v3 재작성(헤더토큰+쿼리파라미터+순수문자본문, MacroDroid 실제 패턴에 맞춤). **사고 발생**: 원장이 설정 중 원본 "계좌연동"(입금) 매크로를 잘못 고쳐 deposit-webhook 연결이 끊겼다가 복구(DB증거로 검증됨, 놓친 입금 없음 확인 안 됨→아래 미답변). hr `💰 AI비용` 탭에 직접입력+자동감지 병기.
- **캘린더·연차 가시성 개선**(원장 "휴무도 봐야 편함" + 임은숙 "신청했는데 안 보임" 두 이슈에서 출발): 캘린더를 실제 월달력 그리드로(Claude 직접코딩 첫 적용) + 휴무(off) 태그 추가 + 신규 `연차현황` 탭(승인건 전직원공개, RLS 그대로 재사용). **임은숙 건 원인 추정**: `leave_requests` 0건 확인 → `submitLeave()`의 동시연차 제한이 조용한 텍스트로만 차단해 신청 자체가 저장 안 됐을 가능성 큼(즉시 메시지 강조로 재발방지, 원장이 사유 확인해야 함).
- **정책 대전환**: codex-delegate 완전 폐기(원장 "토큰 빨아먹지 말고") → 이제 Claude가 직접 hr.html 편집. 위 캘린더그리드·연차현황·leave메시지가 이 새 방식 첫 결과물.
- **AI 사용량/비용 조사 다수**: ccusage로 Claude/Codex 모델별 분리 실측(Sonnet5 vs gpt-5.6-sol 비교), Claude 실제 청구크레딧 $711.90/$800 확인, "3백만원" 오해 해명(정가환산≠실청구). Codex에 Supabase MCP 새로 붙이는 절차 안내(키는 채팅에 안 남김).

**다음 순번**(원장이 이미 정한 순서, 안 바뀜): ①직원 개인정보표(Supabase, employee_info)+원장전용 섹션 ②D5 코드(비번재설정 화면, SMTP는 이미 연동됨) ③근무표 월별달력 뷰(현행+월뷰 2구조) ④D3 jung-plant.com 허브정리(보류 유지, 리마인드) ⑤전자서명 강화(감사추적·불변화) ⑥M3 급여2단계(선행조건 데이터 필요).

👉 **다음 세션 지시문**: `overview.md·todos.md 읽고 이어서 해줘. 위 "다음 순번" ①부터. 컨텍스트 80% 넘으면 멈추고 todos.md에 적고 preserve_all.py 돌리고 알려줘.`

---
<details><summary>이전 세션 압축 기록 (2026-09-08~09, 펼치기)</summary>

M3급여1단계(db/payroll.sql+💰급여탭, 8월 급여대장 실검증, 급여대장은 노무법인 서광 산출=검산용 원칙)·노무질문지18문항(법령검증으로 32→18, 세액표 2023년판 사용중 확인)·PWA설치공지·교정보드UI개선(재스캔무상기본)·근무표재설계(드래그+부서그룹+야간빨강)·연차4건미처리발견(근본원인=UI구조 못봄, 이번에 고침)·계정관리(승인취소버튼)·연차3종세트(근무일계산+자동가산+승인내역모아보기, leave_ledger RLS버그 배포직전 발견해수정)·결재함모아보기·통합캘린더최초배포. 교훈: codex 동시2개 금지(꼬임)·SQL먼저적용·RLS는 권한넓힐때마다 사전확인.
</details>

- **M3 급여 1단계 배포** (커밋 `85bb0bf`): `db/payroll.sql`(attendance.early_min + wage_info 이력형 표) 적용 + hr.html 💰급여 탭(시급설정 + 급여대장 엑셀업로드). **실제 8월 급여대장으로 파서 직접 검증**(15명·전열 매핑·net 일치). 급여대장은 병원이 아니라 외부 노무법인(서광, 문서윤 노무사)이 산출한다는 걸 파일 속성으로 확인 — "계산은 검산용, 명세서는 대장값이 정본" 원칙으로 설계 전환. 설계서: `docs/superpowers/_보기/specs/2026-09-08-payroll-payslip-design-rev1.html`.
- **노무법인 질문지 18문항** (2026-09-09 확정, 발송 전) — `Z:\09_claude-output\02_노무·법률·행정\급여대장_산출기준_확인요청_2026-09-08.html`. 원래 32문항이었으나 법령 직접 검증(국민연금공단·보건복지부 공식 발표)으로 4대보험 요율 계산식이 이미 설계서와 **전부 일치** 확인돼 14문항 제거. 🔴 **확정된 사실**: 국세청이 2026-02-27 세액표 개정, 2026-03-01부터 적용인데 급여대장 세액표 시트명이 `2023세액표` — **3년 전 세액표 사용 중**(연말정산에서 정산되니 급하진 않음, 질문지 1번에 포함).
- **PWA 설치 공지 제작**: `Z:\09_claude-output\03_병원운영·전산\직원허브_앱설치_공지_2026-09-09.html` — 안드로이드/아이폰 설치법(카카오톡 인앱브라우저 함정 포함), URL 실측 검증(manifest·sw.js 200 확인).
- **교정보드(ortho.html) UI개선** (커밋 `73cde93`): 재스캔 기본값=무상, 유상 시 사유 필수, 미래 재스캔="예정" 배지, 케이스 상세 필드(주민번호·유형·트림·차트번호) 접이식.
- **근무표 재설계 + 연차자동표시 + 부서편집** (커밋 `2c6cadf`): `schedules.shift` 재설계(work/off/evening/etc, half_am·half_pm 제거) + 드래그로 여러 칸 채우기 + 야간=빨강 + 부서별(진료실/데스크/기공팀) 그룹핑 + 승인연차 자동배지 + 원장탭 부서 인라인편집.
- **연차 4건 미처리 발견** — DB 직접조회로 5주 넘게 방치된 연차 신청 4건 발견(실장 임은숙·테스트가 전혀 처리 안 함, 원장 화면도 구조상 못 봄). 원장 답변: 신동광(9/9)=보류, 정용태본인(9/8)=테스트라 조치불필요, 김수란(8/25)·이소연(8/19)=보류(DB 손 안 댐, 원장이 새 UI로 직접 처리). **근본원인은 이 세션에서 고침**(아래).
- **계정 관리**: 비번찾기 기능 없음 확인(Supabase 대시보드 Send password recovery/magic link 안내, Admin API curl 명령도 제공) + 완전삭제 위험성(FK 확인 결과 연차·급여·근무표 기록이 주인없이 남음) 설명 → **승인취소(계정정지) 버튼 배포**(커밋 `38ec7a8`, `profiles.approved`를 원장이 되돌릴 수 있게, my_role()='pending' 메커니즘 재사용).
- **연차 3종 세트 배포** (커밋 `513e007`): ①근무일수 계산을 `schedules`+`holidays` 기준으로 정확화(요일 하드코딩 없음) ②자동가산 제안(근기법 단순형: 1년미만 월1일·1년이상 15일, 매니저·실장도 사용 가능하게 확대, 제안만 하고 사람이 확인 후 기록) ③"📚 승인 내역" 신설(월별 모아보기+취소, `leave_ledger` 조정행으로 복구). ⚠️ **배포 직전 실측으로 잡은 버그**: `leave_ledger` INSERT가 owner 전용이라 방금 넓힌 매니저/실장 화면이 조용히 실패했을 뻔함 — RLS를 manager/chief/owner로 확장해서 해결.
- **결재함(일반 결재서류) 모아보기+취소 배포** (커밋 `9514455`): "🗂 완결된 결재 문서"(isLead 전용, 전 직원 대상) + `cancelApprovalDoc()`(approval_steps 원본 도장기록은 보존). 이번엔 착수 전 RLS 미리 확인해서 추가 수정 불필요했음(연차 때의 교훈 적용).
- **통합 캘린더 신규 배포** (커밋 `bc0f97b`): 공휴일+이벤트(`calendar_events`, 그동안 전혀 안 쓰이던 표)+승인연차를 월별로 모아보는 새 탭(전 직원). 이벤트 추가·삭제는 실장·원장만. RLS 착수 전 확인해서 이번에도 수정 불필요(면접 이벤트는 이미 자동으로 실장·원장에게만 보임).
- **작업 방식 교훈(2026-09-09)**: codex-shell을 **동시에 두 개 돌리면 브리지 세션이 꼬여 실패**함(오늘 실제로 한 번 겪음) — 이후 항상 순차 실행으로 전환, 이후 전부 성공. **SQL은 코드 배포 전에 먼저 적용·검증**(순서 안 지키면 컬럼 없다고 전체 저장 실패). **RLS는 화면 권한을 넓힐 때마다 착수 전에 미리 확인**(owner전용으로 막혀있는 걸 뒤늦게 발견하면 조용한 실패로 이어짐 — leave_ledger 사고 이후 확립).
- **다음 순번**: **M3 급여 2단계** — 명세서 발행(payslips, 법정 9항목+병원컬러) · 4대보험·소득세 검산 계산 · doc_templates 서식 편집기 · 노무법인 회신서식 자동생성 · 계정 채우기(chief/manager 지정+25명 가입 유도). 설계서 rev1 참조. **선행조건**(아래) 먼저 채워져야 실사용 테스트 가능.

👉 **새 세션 지시문**: `overview.md·todos.md 읽고 이어서 해줘. "🔵 진행 중 / 바로 다음" 1번부터. 컨텍스트 80% 넘으면 멈추고 todos.md에 적고 알려줘.`

## 🔨 통합설명서 D1~D6 — 원장 결정 완료(2026-09-10, Notion "연습장"에서 회신) → 구현 큐
> 순서 원칙(원장): 근로계약서 → 연차관련 신청서 → 기타. 서식은 **결재함과 연동 원칙**(복잡하면 순서대로).
- **D1 케이스노트 개명** — 원장 "케이스노트로 변경". → ✅ 2026-09-10 배포(hr.html 라벨 3곳+주석; 테이블명 confidential_records·key 'confid'·함수명은 유지, "비밀번호" 문자열 불변).
- **D2 파일첨부+스토리지+계약서 자체 서명페이지** — 원장 "첨부·스토리지 허락 + 자체 서명페이지로 개발". 🔵 착수(2026-09-12). **실측 발견**: 백엔드 뼈대 이미 존재 → 새로 만들지 말 것.
  - `hr-docs` 비공개 Storage 버킷 **이미 있음**(파일/서명 이미지 저장에 재사용).
  - `contracts` 표 **이미 있음**(0행, hr 미사용): `id·user_id·template_id·merged_html·fields·sign_slots(jsonb)·status·signed_at·created_by·created_at`. RLS: INSERT=owner만, SELECT=owner or (본인 & (서명완료아님 or 서명후5일내)), UPDATE=owner or (본인 & status='대기'). → **직원 서명 = status='대기'일 때 본인 행 UPDATE로 sign_slots 채움**(별도 RPC 불필요).
  - **빠진 것 = `doc_templates` 표**(contracts.template_id가 가리킴, 아직 없음). 다음 단계: ①doc_templates 생성(서식: 근로계약서 필드+sign_slots 정의) ②근로계약서 서식 시드(마주옥 계약서 제1~11조 구조·도장#156f72) ③hr UI(codex): 서식관리·계약생성/발송·직원 서명페이지.
  - ⚠️ 계약서는 마주옥 예시 기준 **시급/포괄임금·주휴·연차·퇴직금·비밀유지·해고사유 8개** 포함.
  - ✅ **2026-09-13~14 v1 배포**(커밋 `5bc9deb`): `doc_templates` 표+FK 생성, `근로계약서(표준)` 서식 시드(id=1, 마주옥 제1~11조+개인정보동의, 필드16·프리셋5·병원직인 base64), hr에 **근로계약서 탭**(원장=서식선택·프리셋·직원선택·미리보기·발송[만료일]; 직원=내 계약서 확인·canvas 서명·저장). `contracts.due_at/sent_at` 추가, UPDATE RLS를 **대기→서명완료 허용**으로 보정(직원 서명 저장 가능하게).
  - ✅ **2026-09-14 원장 실서명 테스트 완료 확인** — 원장이 "실제 서명테스트했고 완료되었다"고 확인. end-to-end(생성→발송→직원서명 저장) 정상 작동 확정.
  - ✅ **2026-09-14 보강**: (1) 프리셋 7역할(통역사·진료실·리셉션·상담실장·마케터·부원장·기공소) 직무 자동입력 — 원장이 준 직무 문구 반영. (2) 서식에 **개인정보 수집·이용 동의 + 정식 서명란(병원 상호·대표(인)/직원(인))** 추가(빠져 있던 것). (3) 계약 생성·발송 권한 **실장(chief)·매니저(manager)까지 확대**(RLS + hr UI). (4) hr UI(lead-branch + 아래 AI비용 탭) codex 백그라운드 빌드중 → 완료 시 검증·커밋.
  - 🔒 **전자서명 강화 도입 예정(모두싸인/스마일싸인 벤치마킹, 원장 "필요한 것 적극 도입")**: ①**감사추적**(서명 시 서명자 계정·시각·IP·기기 기록) ②**서명완료본 불변**(서명 후 merged_html 수정 잠금) ③**서명 PDF+해시 hr-docs 영구보존**(위변조 방지) — 다음 codex 작업. (상용은 건당·월정액 비용, 우리는 자체구축 무료지만 고액·분쟁소지 계약은 상용 감사추적인증서 병행 고려.)
  - **다음(선택)**: 연차신청서 서식 추가 · 결재함/입사서류에 완결계약서 표시 · 로컬 `db/*.sql` 부트스트랩을 원격 스키마에 맞춰 갱신(백로그).
- ✅ **AI비용 자동연동(SMS웹훅) 배포·검증완료(2026-09-14, 원장 "자동연동 해야지" 요구 반영)** — Kimi/OpenAI/Codex 결제 API키가 환경에 없어(조사 완료·없음 확인) 직접 API연동은 불가했으나, 원장이 이미 받는 **결제 문자 알림(MacroDroid)** 을 이용해 완전자동화 구축:
  - Supabase Edge Function `ai-billing-webhook` 배포(project texevhsxttfoqkrucfzl) — POST로 {token, platform, raw_text} 받아 금액 자동추출 → `ai_billing_events`(신규 표) insert. 토큰 인증은 DB `webhook_secrets` 테이블로 관리(대시보드/CLI 불필요).
  - 🔴 **v1의 추출 로직이 실제 문자와 달라 처음엔 틀렸음** — 원장이 보여준 실제 결제문자 3종(삼성카드 `USD 28.12`, KB국민카드 `10.76(USD)`, 둘 다 해외승인=달러) 확인 후 **v2로 즉시 재배포**: USD 두 형식 모두 정규식 지원 + 수신 즉시 실시간 환율로 KRW 환산(open.er-api, 실패시 고정폴백) + 기존 원(KRW) 직접표기 패턴도 하위호환 유지. **실제 문자 형식 3건(OPENAI/ANTHROPIC/MOONSHOT) 전부로 curl 재검증 완료**(USD28.12→₩37,766, USD10.76→₩14,451, USD100→₩134,303, 테스트데이터 삭제함). MacroDroid 쪽 설정(raw_text=SMS 원문 그대로)은 안 바뀜.
  - hr `💰 AI비용` 탭: "직접 입력"+"자동감지(문자)" 두 열로 표시, 총액에 자동 합산, 최근 20건 원문 로그 노출.
  - 🔴 **사고 발생·복구 완료(2026-09-14)**: 원장이 설정 중 **원본 "계좌연동"(입금) 매크로를 직접 편집·저장**해 deposit-webhook 연결이 끊겼었음. deposit-webhook 함수 자체는 안 건드려짐(v12 그대로) — 폰의 매크로 포인터만 잘못됨. 원장이 URL·헤더토큰을 deposit-webhook 원래값으로 복원 완료, **DB 증거로도 검증**(복원 직후 원장 본인 테스트입금 ₩10,000이 `deposits` id=215로 정상 기록됨 확인). 그 사고 구간에 놓친 실입금은 없어 보임(직전 입금 9/11과 시간 간격 자연스러움).
  - 🔴 **v3로 방식 변경(2026-09-14)** — MacroDroid의 실제 패턴(기존 계좌연동과 동일)에 맞춰 **JSON body 방식을 폐기하고 헤더+쿼리파라미터 방식으로 전환**. `Body 내용`은 그대로 `{sms_message}`(원문 그대로, 변경 불필요)만 두면 됨. curl로 이 방식 재검증 완료(USD28.12→₩37,766). 현재 유효한 설정값:
    - URL(쿼리파라미터로 플랫폼 구분): `https://texevhsxttfoqkrucfzl.supabase.co/functions/v1/ai-billing-webhook?platform=Claude` (Codex(OpenAI)/Kimi는 값만 교체)
    - 헤더: `X-Webhook-Token: CNqF08Gd4U4FqrbWhXevQFX0jJF7H7Nz`
    - Body 내용: `{sms_message}` (그대로, 손대지 않음)
  - ⏳ **원장이 해야 할 것(진행 중)**: "계좌연동" **복제본**(원본 아님, 이미 복제·SMS트리거 완료함)에서 위 URL/헤더만 이 값으로 설정 — 3개(Claude/Codex(OpenAI)/Kimi) 전부.
  - **다음(선택, 더 완전한 자동화)**: 원장이 Moonshot 플랫폼(키미) API 키(sk-...)를 제공하면 잔액 API로 진짜 실시간 폴링도 추가 가능 — 로그인용 OAuth 토큰은 이미 있으나 결제 전용 키는 별도라 환경에 없음, 채팅에 붙이지 말고 파일로 전달받는 방식 권장.
- ✅ **근로계약서 작성·발송 권한 확대 배포(2026-09-14, RLS 보정 09-15)** — 실장(chief)·매니저(manager)도 계약 생성·발송 가능(원장 지시). 본인 계약이 있으면 서명 섹션도 함께 표시. 09-15 실측에서 `contracts`는 manager 권한이 있었지만 `doc_templates` SELECT가 chief·owner 전용이라 매니저에게 활성 서식이 0개로 보이는 누락 발견 → `doc_templates_select_lead`에 manager를 추가하고 실제 manager 역할 시뮬레이션으로 활성 서식 0→1 조회 확인. 서식 생성·수정은 chief·owner, 삭제는 owner 전용 유지.
- **D3 jung-plant.com 허브 정리** — 원장 "뒤로 미룸, **꼭 리마인드**". ⏸️ 급여 2단계 뒤. 🔔 리마인드 대상(잊지 말 것).
- **D4 도장·컬러 서식 자동생성** — 원장 "**결재함과 모든 서식 연동 원칙**, 복잡하면 순서대로: 근로계약서→연차신청서→기타". 개인도장/병원직인/#156f72. 참고자료: 근로계약서 예시 xlsx(마주옥/김민혁/정규민부원장), 보안서약서 양식 PDF, Notion "근로계약서 작성 양식".
- **D5 비번재설정 이메일** — ✅ 원장이 **gmail SMTP를 Supabase에 연동 완료**(2026-09-12). 남은 것=코드(로그인 화면 "비밀번호 찾기"→resetPasswordForEmail→재설정 페이지)=codex 빌드.
- **D6 통합설명서 + 입사일 입력칸** — 원장 "승인. 단 설명서는 **토큰 아끼게 로컬 유지·추후 온라인배포 리마인드**". 입사일 입력칸(원장탭)=codex 빌드(hire_date는 2026-09-10 12명 직접 입력 완료, 편집 UI는 아직 없음).
- **Supabase 직원 개인정보표(원장 "모두 올린다")** — hr에 직원 표. 새 표(employee_info)+**원장/실장 전용 RLS**+hr UI. Notion "직원 개인정보" 이관(계좌·주민번호·월급 포함). ⚠️ 공개 GitHub 커밋은 Claude 보류(아래).
- ✅ **AI 사용량·비용 상황판 v1 배포(2026-09-13, 원장 "상황판 먼저" 지시)** — `Z:\09_claude-output\03_병원운영·전산\ai_usage\` (스크립트 `collect_ai_usage.py` + `AI사용량_상황판.html`). ccusage(claude/codex/kimi/openclaw) → 당일 환율(open.er-api) ₩환산 → 원장전용 HTML(PDF/PNG). **6시간 자동갱신 Task Scheduler 등록**("AI사용량상황판_6h"). 실측 총 ₩17,250,871(Claude ₩14.6M·Codex ₩2.3M·Kimi ₩33만). ⚠️정가 추정치(구독 실청구액과 다름). **다음(선택) 개선**: hr 원장전용 탭 임베드 · Moonshot 잔액 API 실결제(원장 키 필요) · Supabase 저장(크로스디바이스).
- 🆕 **원장 전용 섹션 신설** — 원장만 보는 영역(위 AI 비용 상황판 등 배치). 원장 지시.
- ✅ **캘린더 '월 전체화면' 뷰 배포(2026-09-14)** — 목록형 표 → 일~토 7열 실제 달력 그리드로 교체(오늘 강조·공휴일/토·일 색상·이벤트/연차 태그). Claude 직접 편집(codex 미사용, 새 방침 첫 적용). ⏳ 원장 로그인 후 실제 화면 확인 필요(Claude는 로그인 불가라 코드 검증만 함).
- 🆕 **근무표 2구조 뷰(백로그)** — 현행 주간표 + '월별 달력' 뷰 둘 다(연습장 image7·8 참고, 구조 동일할 필요 없음). 아직 미착수.
- 📌 **확정 결정(2026-09-12)**: 세전/세후=약정 세전 원칙·실수령은 세전 역산(급여2단계) · 정도경·정규민=부원장이라 **가입 불필요**(입사일 대상 아님) · 근무표 드래그=원장 **확인 완료**.
- **큐 순서(원장 1순위 근로계약서)**: ①근로계약서(D2+D4) ②D5 코드 ③직원 개인정보표(+원장전용섹션) ④AI 비용 상황판 ⑤캘린더/근무표 월뷰 ⑥D3 허브(보류·리마인드).

## 아직 원장이 답하지 않은 것
- ⏳ **운영 함수 소스 2개가 GitHub에 없음(2026-09-22 발견) — 보관 커밋할지 결정** — ① PDF 계약 서명 `contract-pdf-sign`(운영 v1 ACTIVE, `hr.html`이 호출)의 소스 `supabase/functions/contract-pdf-sign/index.ts`와 `db/contract_pdf_signing_draft.sql`은 원장 원본 폴더에만 있고 커밋되지 않았다. DB 함수 `register_contract_pdf_source`·`confirm_contract_pdf_source`는 운영에 있다. ② AI 결제문자 수신 `ai-billing-webhook` v3는 서버에만 있고 저장소·원본 폴더 어디에도 소스가 없다. 원본 폴더가 손상되면 되살릴 소스가 없다. 제안: 운영에 배포된 코드를 그대로 내려받아 비밀값이 없는지 확인한 뒤 새 브랜치에 커밋.
- ⏳ **원장 원본 폴더가 GitHub 최신보다 141커밋 뒤처짐(2026-09-22 확인) — 정리할지 결정** — `treament_plan` 폴더(main)는 HEAD `bc6d3a0`(GitHub에 없는 1커밋: `.gitignore`에 `.worktrees/` 추가)이고 origin/main보다 141커밋 뒤다. 커밋 안 된 파일 89개 중 23개는 GitHub 판과 내용이 다르고(대부분 이후 올라간 것의 옛 초안), 64개는 GitHub에 없다(위 계약 서명 소스, 푸시 발송기 초안(의도적 미배포), 출퇴근 XLSX·상담·수기근태 초안 시험, 다른 프로젝트 `macrodroid_notification_bridge/`·`naver_3layer_monitor/`, 설명서 docx 2개). 그래서 원장이 여는 `_보기\todos.html`도 옛 내용(9/22 02:43)이다. 제안: 폴더 전체 백업 → GitHub에 없는 것만 보존 브랜치에 커밋 → 폴더를 최신 main으로 맞춤. 다른 세션이 그 폴더에서 작업 중일 수 있어 원장 승인 뒤에만 한다.
- ⏳ **공지를 다시 열 때 콘솔 403(2026-09-22 발견) — 고칠지 결정** — `hr.html` 572·1245행의 공지 읽음 기록(`notice_reads` upsert)이 이미 읽은 공지를 다시 열면 UPDATE 정책이 없어 403을 낸다. 첫 읽음 기록은 정상 저장(20행)이라 기능 영향은 없고 콘솔 오류만 남는다. 고치면 프런트 두 줄(`ignoreDuplicates:true`)이고 DB·Task 6 정책은 건드리지 않는다. 공지 영역이라 원장 결정 뒤에만 손댄다.
- ✅ **AI 사용량 현황판 원장 로그인 확인 — 완료(2026-09-22)** — 원장 "보이긴한다" + Claude가 원장 로그인 세션에서 세 구역 값을 직접 확인했다(맨 위 AI 사용량 현황판 절 참고).
- ✅ **원장 결정(2026-09-22, 재질문 금지)**: ① 예전 기록의 `ai-billing-webhook` 토큰 원문은 **지우지 않고 그대로 둔다. 토큰도 바꾸지 않는다.** ② 현황판 업로드는 **별도 업로더 스크립트(`~/.claude/scripts/hr_ai_usage_uploader.py`) + 별도 예약 작업**으로 하고, 감시 작업(`codex_watchdog.ps1`)·코덱스문제(2) 세션 스크립트(`codex_session_health.py`·`codex_model_usage.py`·`collect_ai_usage.py`)는 고치지 않고 결과 JSON만 읽는다. 대화 이름은 민감하므로 원장 전용 RLS로만 보인다.
- **Codex에 Supabase MCP 연결(2026-09-14, 원장 요청)** — Codex가 이미 `[mcp_servers.*]`(node_repl·serena 등) 구조 사용 중 확인, Supabase만 추가하면 됨. 절차 전달함: ①supabase.com 대시보드→Access Tokens→"Codex CLI"용 새 토큰 발급 ②`C:\Users\elusi\.codex\config.toml`에 `[mcp_servers.supabase]`(command=npx, args=-y @supabase/mcp-server-supabase@latest --project-ref=texevhsxttfoqkrucfzl) + `[mcp_servers.supabase.env]` SUPABASE_ACCESS_TOKEN 추가. **기존 Claude 쪽 키는 재사용 안 함**(평문 노출 위험, 신규 발급 권장). 원장이 진행했는지 확인 필요.
- 🔴 **임은숙 "연차 신청했는데 안 보인다" — 원인 추정·조치 완료(2026-09-14)** — `leave_requests` 실측 결과 **신·구 계정 모두 신청 내역 0건**(RLS는 chief 본인 INSERT를 막지 않음, 정상 확인). 코드 확인 결과 `submitLeave()`의 **동시연차 제한 규칙**(그날 이미 2명↑ 휴가=차단, 1명+특별사유無=차단)이 **작은 텍스트로만 알림 후 저장 자체를 안 함** — 유력 원인으로 추정(insert 자체가 하드블록됨, DB에러 아님). 즉시 조치: 차단 메시지를 **빨간 굵은 글씨 "⚠ 신청되지 않았습니다"**로 변경 배포(재발방지). **원장 확인 필요**: 임은숙이 신청하려던 날짜에 이미 다른 직원 연차가 있었는지, 있다면 특별사유 적고 재신청 안내.
- ✅ **캘린더에 휴무(off) 표시 배포(2026-09-14, 원장 "휴무도 보여야 편함")** — 캘린더 날짜칸에 승인연차(🏖)뿐 아니라 그날 근무표상 휴무(off)인 직원도 🛋로 함께 표시. `schedules.shift='off'` 실시간 반영. 원장 확인: 잘 보임.
- ✅ **연차현황 신규 탭 배포(2026-09-14, 원장 "승인한것도 별도파일에서 보이게")** — 원장이 AskUserQuestion에서 **"hr 로그인 유지 + 전용 탭"** 선택. hr 상단에 `연차현황` 탭 신설(월 선택, 표 형식). `leave_requests` 기존 RLS 그대로 사용 — 승인 연차는 전 직원 공개, 대기·반려는 본인만(리드는 전체). 새 DB 변경 없음.
- ✅ **"계좌연동" MacroDroid 매크로 사고 — 복원 완료(2026-09-14, 원장 "기존의것은 교체했어" 확인)** — AI비용 웹훅 설정 중 실수로 원본 "계좌연동"(입금알림) 매크로가 ai-billing-webhook을 가리키게 됐던 사고. 원장이 deposit-webhook URL·기존 헤더토큰으로 복원 완료 확인함. (서버 측 deposit-webhook 함수 자체는 애초에 안 건드려졌었음.)
- 🔴 **위 사고 중 놓친 입금 문자 확인 필요** — 매크로가 잘못 가리키던 짧은 시간 동안 입금 문자가 왔다면 자동기록 안 됐을 수 있음(ai-billing-webhook이 토큰불일치로 401 거부, 아무 데도 안 쌓임 — 최소한 오염은 없음). 그 시간대 입금이 있었는지, 있었다면 수동 반영했는지 원장 확인 필요.
- 🔴 **공개 GitHub에 직원 주민번호·계좌 커밋 = Claude 보류 유지** — 공개 repo는 영구·전세계 노출(git 히스토리·포크·검색, 되돌리기 불가)+PIPA 위반이고 **기능상 불필요**(앱은 Supabase에서 읽지 repo 파일에서 안 읽음). → Supabase(원장 전용 잠금)에만 저장. 사유 이해 후에도 공개를 원하면 그때 재확인. 동의 없이 대신 공개 커밋 안 함.
- ✅ **임은숙 계정 정리 완료·확정(2026-09-13 원장 "현상 유지")** — daum(les4128) 비활성, gmail(eunsooki4128)=실장(chief)·활성. 원장이 현 상태 유지 지시 → 종결.
- **세 번째 AI 플랫폼 제품명 확인** — 시트+크레딧 자동충전(마스터카드 ~$28) 화면(연습장 image·1)이 OpenAI/Codex인지 Cursor 등인지 화면상 제품명 없음 → 원장 확인(AI 비용 상황판 분류에 필요).
- **근태 지문 USER ID ↔ 직원 매핑** — 3개월 출퇴근.xls=타임비 per-punch(USER ID·이름·날짜·시각). USER ID(306·4583…)≠사원번호 → attendance 이관 시 이름 or 기기ID 매핑 설계 필요. 원장: 앞으로 이 형식 업로드.
- **노무 질문지 — 우리 트랙으로 진행(원장 2026-09-13)** — 원장: 노무사가 영업비밀이라 답변 난감할 수 있으니 **우리 추정으로 진행**하고, 나중(미정 시점) 답변 오면 반영·아니면 그대로. → 발송은 **비차단(선택)**. 초안본 보관: `...답변초안_2026-09-12.html`.
- **워드로 열어둔 설계서 `.md` 닫기** — 초판 잠겨 rev1 별도. 닫으면 원본 합침.
- **임은숙 비번 재설정** — D5 완성되면 앱 셀프 가능(그 전엔 대시보드).
- **선행조건 4건(데이터 입력, 원장/실장이 해야 함)** — 기능이 아니라 데이터라 Claude가 못 채운다:
  1. **지문엑셀 업로드** (`attendance` 0행) — 원장이 "3개월 출퇴근.xls"(타임비 형식) 제공, 앞으로 이 형식. att parseXls 검증+USER ID 매핑 필요(위 참조).
  2. ~~`profiles.hire_date` 채우기~~ → ✅ **2026-09-10 12명 직접 입력 완료**(재직직원 PNG 기준). 남은 2명(정도경·정규민)은 계정 없어 대기.
  3. **근무표(`schedules`) 채우기** (거의 비어 있음 — 연차 근무일수 계산이 부실하게 작동)
  4. `wage_info`에 시급·월소정근로시간(209/167/157)·고정상여·숙소지원 입력
- 📌 **백로그(급하지 않음, 운영 DB엔 영향 없음)**: `db/hr_schema.sql`(from-scratch 부트스트랩용)이 오늘 적용한 변경들(schedules half_am/half_pm 제거, leave_requests·approval_docs의 '취소' 상태·cancelled_by/at 컬럼)을 아직 반영 안 함 — DB를 처음부터 새로 만들 때만 문제됨.

## 🎯 한 줄 비전 (2026-07-30 원장 확정)
설치·외주 없이 브라우저로 굴리는 아산정플란트 내부 운영 세트 — 진료·기공·교정·인사 4축, 로그인·데이터는 Supabase 한 곳.

## 🔵 진행 중 / 바로 다음
> 우선순위: 입금피드 → 교정 v1.2 → 급여1단계 → 근태·연차·결재함 대량개선 (전부 완료, 이제 급여2단계+계정채우기)
- [ ] **M3 급여 2단계** ⬅️ **바로 다음**: 명세서 발행 · 4대보험·소득세 검산 계산 · doc_templates 서식 편집기 · 노무법인 회신서식 자동생성. 설계서 rev1 참조. 착수 전 위 「선행조건 4건」 데이터가 있어야 실사용 테스트 가능.
- [ ] **계정 채우기**: chief(실장)·manager 지정 + 직원 25명 셀프 가입 유도 + 미가입 독려·권한 일괄지정 화면

## ⏸️ 대기 (원장 결정·자료 필요)
- [ ] **UI 브랜드 리스킨** — 레퍼런스(취향·무드·벤치마크) 모이면 **한 번에** frontend-design 스킬로. 브랜드 KB=`Z:\09_claude-output\06_KB\아산정플란트_이미지자산_KB`(로고·#156f72·실사)
- [ ] 온보딩 미제출 **페널티** 구현: 제출 마감일 표시 + 미제출자 관리자 **SMS 보고** + 근무표 열람 제한
- [ ] 대체공휴일 2건(8/17·10/5) 실제 적용 여부 — 병원은 휴일 원칙근무·단축 많음, 월계산 시 **실근무시간만** 보고
- [ ] 서식 레퍼런스(계약서 등) + 병원 컬러 입히기 → M2 계약서 템플릿 때

## 📋 백로그 (설계 완료·구현 대기)
- [ ] **D2 M2 잔여**: 계약서 자동생성+도장+전부서명+5일 열람
- [ ] **입금 피드 P2/P3**: (P2) 입금↔교정 진단비 자동 매칭 · (P3) 가상계좌 · 텔레그램 알림 문구 정제(입금만·금액/입금자 포맷)
- [ ] **D5 작업판 자동기록**: CC 세션 종료 훅 + 협업 CLAUDE.md 관례 → write RPC(다단계 작업만). SQL은 원장 실행
- [ ] **D6 기공차트 탭 전환 + 이미지 첨부**: 장부 세로나열→탭 / 행에 사진 업로드·클립보드 붙여넣기 영구저장(→리메이크 전략)
- [ ] **T6 리뷰봇·고객DB**: `03_병원운영·전산\내부홈페이지\T6_리뷰봇·고객DB_연동사양.md` — profiles.role 재사용, cs_events/reviews_log
- [ ] 내부 평가 시스템: 부서(진료실·데스크·홍보팀·상담팀·기공팀)별, 항목 러프(기공 리메이크 등) — 추후 구체화
- [ ] 스크래핑(Playwright): SureSmile 배송·Tracking 자동수집 / 덴트웹 교정상태 (2FA 없음 확인) — 교정보드 P3
- [ ] **교정진단기 연동**: `Z:\09_claude-output\05_임상·진료\진료기록부\ortho_integrated_chart_최종본_교정.html`("교정 통합 진단 시스템")은 로컬 JSON 내보내기/불러오기만 있고 공유 DB가 없어 교정보드와 상시 자동연동 불가(2026-09-07 확인). 필요해지면 B(JSON 다리, 반자동) 또는 C(그 도구를 Supabase로 재설계, 큰 작업) 중 선택.
- [ ] 신청서 인쇄 @media print 격리(뒤 화면도 같이 인쇄될 수 있음)

## 🧩 로드맵 밖 (재미도구 — 유지만, 개발순위 제외)
- 사주 · 직원뽑기 · 뉴스 · 보철프로토콜_진단기 · 설명덱_제작기

## ✅ 최근 완료 (2026-09-09 이전)
- **입금 피드 P1 완결** (2026-09-06): `deposits` 표 07/31~09/04 총 171건, 영업일 무결락 적재 확인. hr 입금탭 + 텔레그램 알림 실가동, P1 종료.
- **입금 피드 P1 코드·백엔드 배포** (2026-07-30): deposits 표(멱등)·Edge Function `deposit-webhook`·hr '입금' 탭. 배포 `4f7567e`·`1ce6517`.
- **직원 셀프 회원가입(D2) 라이브** (2026-07-30): 로그인/가입 토글 + 정책 `profiles_insert_self` + 배포 `25f8f22`
- **로그인 승인제 + 비밀 진료기록** (2026-09-07, 커밋 `67d1387`): `profiles.approved`+`my_role()` pending 분기, RLS를 `my_role()<>'pending'`으로 조임(using(true) 자동차단 거짓임을 실측 발견해 보강).
- **재스캔(리스캔) 란** (2026-09-07, 커밋 `4d37091`): 리메이크 플래그 제거 → 재스캔 대체, 3년 무상마감 카운트다운.
- **직원별 탭 노출 권한** (2026-09-07, 커밋 `df989b9`·`7f1a4bb`): 역할별+사람별 예외, app_settings 저장.
- **PWA(홈화면 설치형 앱)** (2026-09-07, 커밋 `3f1ae90`): hr·ortho·index 매니페스트+서비스워커+아이콘.
- **연차 개선 + 비밀기록 원장전용** (2026-09-08, 커밋 `4ae0704`): 신청서 양식+결재 CSS스탬프+동시연차 규칙+`confidential_records.owner_only`.
- 교정 케이스 보드(ortho.html) 배포·검증 5/5 · jung-plant.com 연결
- 근태 hr.html: M1(로그인·role·지문엑셀 파서·연차·결재·공지·온보딩) + M2(근무표·출퇴근 연동·조퇴·결근확인)
- 백엔드 SQL(Codex 작성·교차검증): ortho·hr(표24)·app_settings

> ⚠️ **codex 실행 함정(2026-09-07 발견, 여전히 유효)**: `codex -a never exec -s workspace-write`가 이 프로젝트 경로(한글·공백·괄호)에서 apply_patch를 거부하는 경우가 있다. 이 환경은 codex-bridge.js를 통해서만 codex를 부를 수 있음(직접 `codex exec` 호출은 훅이 차단) — `--force-new`로 세션이 꼬였을 때 우회. **동시에 두 개 이상 돌리지 말 것**(브리지 세션 하나 공유, 꼬임 확인됨).

## 원장 결정 대기 (요약, 오래된 항목)
`AGENTS.md`·`docs/superpowers` 삭제 7건 커밋 여부(현재 복원됨) · 리스킨 레퍼런스 · 온보딩 페널티 세부 · 대체공휴일 확인 · 내부평가 항목
## 🟢 출석 수직 경로 릴리스 후보 — 부모 리뷰 대기

- **상태(2026-09-20)**: `b53efbe`에서 분리한 임시 worktree/브랜치 `codex/attendance-resolution-release`에서 구현·검증 완료. 아직 push/deploy하지 않음.
- **범위**: 직원 수기 출퇴근 제출 → 실장 승인 → 원장 확정 → 지문 인식 오류 보정 레코드 생성 → 직원/관리자 화면 반영. PDF·Push·온보딩·상담 기능은 포함하지 않음.
- **변경 파일**: `hr.html`, `db/attendance_issue_resolution_release.sql`, `tests/sql/pglite-attendance-resolution-release.mjs`, `tests/attendance-resolution-release-static.test.js`.
- **DB 전제**: 기존 `profiles`, `attendance`, `attendance_issues`, `my_role()` 및 `chief/owner` 역할. 신규 테이블 4개와 RLS·최소 grant·승인 RPC를 먼저 적용해야 함. 직접 테이블 쓰기는 차단.
- **검증**: 실제 UI 요청 payload 모양의 PGlite 호출로 제출→승인→조회 PASS. 날짜 누락 거부, 재제출 시 구버전 승인 거부, advisory lock 순서, 원본 지문 행 보존, 보정 멱등성/상이한 보정 거부, attendance issue 직접 UPDATE·확정행 재승인 차단, 세 label의 `type='정정'` 저장과 서버 INSERT guard까지 확인. 기존 지문 업로드의 manager/chief/owner 자동누락 RPC, 기존 확정 행 보존, 중복 멱등 처리, 일부 실패 표시 경로도 확인. 관리자 조회는 수기 50건의 user/date 키 대응 출석을 페이지 조회·정확 키 필터링하고 현재월 보정도 페이지 조회한다. 비활성 사용자 revisions 조회는 차단한다. 전체 Node 테스트 `127 pass / 0 fail`; `git diff --check` PASS.
- **롤백**: 프론트 변경과 RPC/policy 정의를 이전 버전으로 되돌리되, 신규 테이블·기록은 삭제하지 않는다. 운영 적용 전 백업·점검창·복구 경로를 별도 확인한다.
- **해시(2026-09-20 기존 importer 호환 보강 후)**: `hr.html`=`88505010CEF9DB05EA2DF528AAE919E536825C6D1AA7E10BDA40340AEDCB2DA8`, `db/attendance_issue_resolution_release.sql`=`039A4679134CB4042835D4CF58F9DF89750EEEC4DFF26AFB5260DFA087BC4E2F`, `tests/sql/pglite-attendance-resolution-release.mjs`=`E98CC9AE5E7399A5ED9464FEE01D8FF7C91CE3020B711DB37979856B74EC4D28`, `tests/attendance-resolution-release-static.test.js`=`AF4A0885E686C88ACC2136EF595F4467DEB4D32D4D883030C5343E1A3A641D01`.
- **기록 정정**: 아래의 과거 “전체 기능/VAPID 대기” 메모는 당시 상태 기록이며, 현재 원장의 **검증된 수직 기능부터 점진 배포** 결정으로 대체되었다. 과거 기록 자체는 삭제하지 않는다.
# ✅ Task 2 통합 캘린더 단계배포 최종 기록 (2026-09-20)
- 배포 커밋: `49780b33325d5150876c9032d3eb52e73419a6e6` — `origin/main` fast-forward 완료.
- 시험: 관련 62/62, 전체 18개 파일 143/143 통과. `git diff --check` 통과.
- 라이브 확인: `https://jung-plant.com/hr.html?v=49780b3` 로그인 화면 정상 로드 확인.
- 미검증 경계: 인증 후 역할별 실제 화면·실제 직원 입력/승인은 자격증명과 실데이터 없이 미검증.
- DB 영향: Task 2에서는 migration·운영 DB 행 변경 없음.
- 롤백 기준: 프론트는 직전 정본 `23a84f0e5be81561d2e297e16a322ca7d77f8433`으로 재배포하며, Task 2의 DB 변경이 없으므로 DB 롤백은 없음.

## 2026-09-21 완료 보존
- [x] Task7 portable semantic fixture 및 Task8 선행 gate 회귀 PASS
- [ ] 운영 적용은 별도 승인 후 수행
