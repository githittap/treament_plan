# 직원허브 구현 기록

## 2026-09-21 — Task 6 로컬 검증 및 인수인계

- 기준: 기능 커밋 `2e1de31`(공지 첨부와 예치금 권한 분리), 작업 브랜치 `codex/calendar-ui-release`.
- 추가: `tests/sql/pglite-notice-attachments-deposit-access.mjs`를 작성해 고정 PGlite 0.5.8에서 private 버킷, 공지 작성자 일치, 첨부 자기 경로, 예치금 staff 거부·desk/chief/owner 허용·inactive 거부를 합성 검증했다.
- 실행 증거: `NOTICE_ATTACHMENTS_ACCEPTANCE_PASS`; 관련 문서/직원서류 회귀시험 통과; `PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS`; `INLINE_SCRIPT_SYNTAX=PASS`; `git diff --check` 통과. `node --test`는 Windows runner `spawn EPERM` 이력 때문에 개별 파일 직접 실행으로 분리했다.
- 커밋: 기능 검증 `ffb58fb`(Task 6 PGlite 권한 검증 추가). 문서 커밋은 이 기록 갱신 뒤 별도 생성한다.
- 미수행: 운영 DB/Storage migration, 실제 로그인·첨부 업로드·저장/재조회, push, 배포. 이 기록은 이를 완료로 주장하지 않는다.
