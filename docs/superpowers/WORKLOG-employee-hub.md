# 직원허브 구현 기록

## 2026-09-21 — Sol High 최종 판정 FAIL 정정 인계

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
