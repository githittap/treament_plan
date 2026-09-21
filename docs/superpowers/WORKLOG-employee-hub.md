# 직원허브 구현 기록

## 2026-09-22 — Task6 production 완료 및 Task7/8 운영 전 최신화

- Task6 production migration `employee_hub_notice_attachments_deposit_access_20260921`을 적용했다. 적용 전 보존 기준 `notices=1`, `deposits=264`는 유지됐다. private `notice-attachments` 버킷은 10MB·6 MIME 제한이며 objects=0이다. Storage API 실제 업로드는 자격증명이 없어 실행·검증하지 않았다.
- Task7 첫 production apply는 fixed canonical mismatch에서 transaction rollback됐다. migration marker·schema·데이터에 운영 변화가 없음을 기준으로 기록한다.
- Task7 v5 로컬 완결 커밋: `6941111`(RLS helper 강화), `448bcc2`(snapshot 위변조 검증), `72c4749`(catalog 정합성), `1b2e36b`(구독 동작 검증). 고정 identity는 fingerprint `task7-push-v5-catalog`, manifest `push-v5-catalog-20260922`, semantic SHA256 `ae2606f243d91400b15624dbc9113ae3e6187ed03b7eef6d213d37f56799b53e`, canonical MD5 `8179b7fed8536fe0516a0b29109f1728`이다. PGlite exact catalog/behavior/fail-closed 및 push static PASS, production 미적용이다.
- Task8 로컬 보완 커밋 `373e829`: Task7 v5 상수·identity·private allowlist, Task8 marker exact shape, negative matrix를 추가로 고정했다. Task8/Task7 PGlite PASS, production 미적용이다.
- 다음 순서와 보호 경계: Sol High 독립 검증 PASS 후 Task7 운영 apply/verify, Task8 운영 apply/verify, 승인된 단계배포·실사이트 확인을 진행한다. 실제 직원 메일·Push·생체입력, 자격증명 입력, 원본 삭제, 대량 이관, 보안 완화, 새 비용은 금지한다. `직원허브 5차.zip`은 최초 승인 범위 완료 뒤에만 읽고 `상담문의 등 일원화.zip`은 직원허브 전체 후속이다.

## 2026-09-21 — 운영 릴리스 사전 스냅샷

- 대상 Supabase: `texevhsxttfoqkrucfzl` ACTIVE_HEALTHY. 적용 전 migration에는 Task6/7/8 marker가 없다.
- 보존 기준: notices=1, deposits=264, notice-attachments bucket/object=0, private schema·push_subscriptions 없음, attendance=0/manual entries=5/revisions=5/resolutions=0.
- Task8 함수는 MD5 `f1277c2f9d91a3e434e237e19a6800b9`, postgres owner, SECURITY DEFINER, `search_path=public`, postgres/service_role/authenticated EXECUTE다.
- rollback 순서: Task8 → Task7 → Task6. Task6는 Storage 객체가 하나라도 생기면 rollback STOP 후 보존 판단한다. 실제 Storage upload/download, 직원 알림·Push, 자격증명 입력은 범위 밖이다.

## 2026-09-21 — Task 8 Sol FAIL 보완 로컬 PASS

- Task7 marker의 fingerprint/manifest·고정 canonical MD5·저장 canonical/identity를 apply와 rollback에서 비교한다. Task8 marker로 인해 추가되는 정확한 table/pkey 두 이름만 Task7 canonical schema.contents 비교에서 제외하며 identity는 그대로 대조한다.
- Task8 reapply는 marker owner=postgres, 무권한 ACL, RLS+FORCE RLS drift를 중단한다. old `review_manual_attendance`는 postgres/authenticated/service_role EXECUTE를 모두 요구한다.
- 검증: fixed production MD5 정적검증, marker owner/ACL/RLS·Task7 canonical/identity·old ACL 누락·owner pending 직접승인 거부 PGlite fixture, Task8 apply×2→drift 거부→reset→rollback→old hash→reapply, Task7 PGlite 회귀 및 `git diff --check` PASS.
- 미수행: Sol 독립 재검증, 운영 DB/push/deploy/5차 ZIP 열람.

## 2026-09-21 — Task 8 Sol M1 EOF 보완

- RED: 기존 `endsWith('\\n\\n')`는 `commit;\n\r\n` 혼합 개행을 놓쳤고, 개행 독립 정규식 시험이 빈 EOF 줄을 검출했다.
- GREEN: apply SQL 끝을 단일 개행으로 정리했다. Task8·Task7 PGlite 및 `git diff --check` PASS. Sol 독립 재검증 전 운영 변경은 금지한다.

## 2026-09-21 — Task 6 Sol High 최종 PASS

- 구현 HEAD: `d0222684dd7da4607752c22b2912ad8bf4f0d87a`; Sol High PASS(Critical/Important/Minor 없음), local direct Node 30개·PGlite·인라인 JS·diff check PASS와 clean worktree 확인.
- 닫힘: foldername 길이2, 게시 첨부 restrictive DELETE guard, attachments JSON 구조/NULL 강제, 정책·RLS·ACL·버킷 rollback, apply×2 fail-closed, quoted role 복원.
- 미수행: push/deploy/운영 DB·Storage/실계정. 운영 전 Storage DELETE/ALL 정책·ACL·RLS·버킷/객체 snapshot, 별도 시험계정 upload/download/cleanup/게시 후 DELETE 거부/MIME·10MB, 복제환경 rollback, 단일 migration 실행 필요. 최종 직전에만 승인된 외부 Opus 읽기전용 검증.
- K3는 BUSD MCP_INTERNAL_ERROR 및 managed Kimi 403으로 제외, 사용자 연결 완료 전 Terra 유지. `C:\Users\elusi\Downloads\직원허브 5차.zip`은 열지 않고 기존 승인 미완료 뒤 대기.

## 2026-09-21 — 과거 Sol High 최종 판정 FAIL 정정 인계

- 상태: Task 6은 로컬 구현은 있으나 최종 Sol High FAIL·배포 차단이다. 문서만 갱신했으며 코드·SQL·시험 파일은 수정하지 않았다.
- FAIL 1: `db/notice_attachments_deposit_access_draft.sql:27,29`의 `array_length(storage.foldername(name),1)=3`이 실제 Supabase 의미와 불일치한다. `uid/tmp/file`의 foldername은 `[uid,tmp]` 길이 2이며 실제 업로드/cleanup DELETE가 RLS 거부된다. 기존 PGlite helper는 파일명 포함 위양성 모사였다.
- FAIL 2: 성공 첨부가 `uid/tmp/...`에 남아 작성자가 게시 첨부를 DELETE할 수 있고 링크가 깨질 수 있다. 성공 후 tmp 밖 확정 경로 이동 또는 서버 확정 절차와 게시 객체 DELETE 차단이 필요하다.
- 검증: Node 23/23, 기존 PGlite 7/7은 Storage 판정 무효, 실제 helper 의미 반영 시험 FAIL, 인라인 2 PASS, `git diff --check` PASS. push·운영 적용·Opus 미실행.
- 다음: 실제 Supabase foldername 의미 수용시험 고정 → RED(길이2·게시 첨부 DELETE 거부) → GREEN(path 수정·tmp 밖 확정·DELETE 차단) → PGlite/정적/전체 회귀 → Sol High PASS → 승인된 Opus 읽기전용 검사 → push/운영 판단.

## 2026-09-21 — Task 6 로컬 검증 및 인수인계

- 기준: 기능 커밋 `2e1de31`(공지 첨부와 예치금 권한 분리), 작업 브랜치 `codex/calendar-ui-release`.
- 추가: `tests/sql/pglite-notice-attachments-deposit-access.mjs`를 작성해 고정 PGlite 0.5.8에서 private 버킷, 공지 작성자 일치, 첨부 자기 경로, 예치금 staff 거부·desk/chief/owner 허용·inactive 거부를 합성 검증했다.
- 실행 증거: `NOTICE_ATTACHMENTS_ACCEPTANCE_PASS`; 관련 문서/직원서류 회귀시험 통과; `PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS`; `INLINE_SCRIPT_SYNTAX=PASS`; `git diff --check` 통과. `node --test`는 Windows runner `spawn EPERM` 이력 때문에 개별 파일 직접 실행으로 분리했다.
- 커밋: 기능 검증 `ffb58fb`(Task 6 PGlite 권한 검증 추가), 최초 문서 인수인계 `d635470`(Task 6 인수인계 기록 갱신). 이 문서 보완은 그 뒤의 별도 문서 커밋으로 남긴다.
- 미수행: 운영 DB/Storage migration, 실제 로그인·첨부 업로드·저장/재조회, push, 배포. 이 기록은 이를 완료로 주장하지 않는다.

## 2026-09-21 — Task 6 Sol 검토 보안 보완

- 원인: 기존 `notices_insert_approvers`와 새 permissive INSERT 정책이 OR 결합되어 작성자 검증을 우회할 수 있었다.
- 보완 커밋: `960c351` — 기존 INSERT/UPDATE 정책 제거 후 단일 INSERT 정책, 서버 작성자 이름 고정·불변 트리거, private 버킷 MIME/10MB/tmp 경로 검증, 첨부 download·실패 임시객체 정리, 비파괴 롤백 SQL을 추가했다.
- 검증: RED에서 기존 정책 제거 검증이 실패한 것을 확인한 뒤 GREEN에서 PGlite staff/chief/owner·위조 INSERT·불변 UPDATE·MIME/크기/경로·조회 경계를 통과했다. 전체 직접 Node 회귀, 인라인 JS 구문, `git diff --check`도 통과했다.
- 운영 경계: 실제 DB/Storage·객체·행은 변경하지 않았고, 적용 전후 스냅샷과 백업/롤백 경로 및 별도 시험 계정 재검증이 필요하다.

## 2026-09-21 — Task 6 DELETE·롤백 왕복 재검증

- 검증 커밋: `28529d0`. `4e346cf`의 정책·롤백 SQL은 추가 수정 없이 강화된 시험을 통과했다.
- DELETE: 승인·활성 본인의 `uid/tmp/...` 성공, 타인 tmp·본인 비tmp·타버킷 거부를 PGlite RLS로 확인했다. `cleanupNoticeUploads()`는 부분 업로드·공지 저장 실패 모두 이번 요청의 `uploaded` 경로만 전용 버킷에서 정리한다.
- 롤백: apply 전/롤백 후 공지 INSERT·UPDATE, 예치금 정책의 식과 table grant, 기존 버킷 설정이 동일함을 확인했다. 신규 버킷은 비었을 때만 제거되고, 객체가 있으면 transaction이 중단되어 버킷·객체가 보존된다.
- 회귀: 직접 Node 30개 파일 통과, `INLINE_SCRIPT_SYNTAX=PASS`, `git diff --check` 통과. 운영 DB/Storage 적용, 실제 계정·데이터 시험, push, 배포는 수행하지 않았다.

## 2026-09-21 — Task 6 Sol High FAIL 추가 보완

- RED: 클라이언트 `updated_at` 컬럼이 없어 2000년 시각 위조 시험이 `column does not exist`로 실패했고, 수용표를 Sol High FAIL 상태로 먼저 낮춰 기록했다.
- GREEN `7ee01fd`: `notices.updated_at`과 INSERT/UPDATE 서버시간 강제, snapshot PUBLIC·anon·authenticated ACL 회수·RLS, 트리거 함수 직접 EXECUTE 권한 회수를 추가했다.
- PGlite: staff가 `created_at`·`updated_at` 2000년을 보내도 서버시간으로 저장되고, anon·authenticated snapshot grant 0개·SELECT/UPDATE 거부, apply→rollback 권한 왕복을 확인했다.
- 상태: 로컬 보완·시험은 통과했으나 Sol High 최종 재검증 대기다. 운영 DB/Storage·push·배포는 수행하지 않았다.
# 재부팅 정본 (2026-09-21)

- HEAD `a6fa4925bf5787d29b7f7a839ee248a068cb5610`: Task8 Sol 독립검증 **FAIL**(Critical 0 / Important 3 / Minor 1). Task6·7·9는 기존 로컬 PASS 기록만 유지한다.
- 다음: marker drift fail-closed·Task7 marker 정합·old ACL 필수 EXECUTE·fixture/EOF 보완 → Sol 재검증. 그 전 운영 DB/push/deploy와 5차 ZIP 열람 금지.

## 2026-09-21 — Task7/8 portable semantic manifest
- Task7/Task8 hardening: PGlite fixture가 same-name CHECK(true), helper body/trigger, private namespace, Task8 marker column/constraint/index/trigger drift를 reapply/rollback에서 fail-closed로 확인했다. 운영 적용 없음.
- Task7 PGlite drift matrix와 Task8 apply/rollback PGlite PASS. 운영 변경 없음.
