# 직원허브 구현 기록

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
