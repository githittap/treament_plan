# 직원허브 현재 인수인계

- 갱신: 2026-09-21 09:38 KST
- 현재 배포 정본: `origin/main` = `0f3226b` (직접 push 완료)
- 구현 worktree: `Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\.worktrees\calendar-ui-release`
- 구현 브랜치: `codex/calendar-ui-release`
- 기준 UI: `hr.html`; DB SQL: `db/consultation_journal_draft.sql`, `db/consultation_journal_advisor_hardening.sql`, `db/consultation_journal_rollback.sql`

## 범위 구분

| 범위 | 현재 상태 | 근거/경계 |
|---|---|---|
| A. 최초 `직원허브 수정 지침.zip` | Task 0~5 구현·검증·배포 완료 | 기존 ZIP 근무표 수용표의 ZIP-01~08 및 Task 2 이력을 보존한다. 원본 ZIP·엑셀의 실제 행은 반입하지 않는다. |
| B. 후속 `허브관련 2차.zip` | 미완료, 요구 재확인 대기 | 새 요구가 A의 수용기준을 바꾸면 별도 수용표 갱신이 필요하다. |
| C. `직원허브 3차.zip` 피드백 | 미완료, 사용자 결정 대기 | 초안·제안과 실제 구현을 혼동하지 않는다. |
| D. 4차 UI/캘린더 보완 | `0f3226b`까지 main 반영 | 실제 로그인·저장·역할별 화면은 미검증이다. |
| 후속 상담일지 요구 | 기본 migration 운영 적용 및 hardening SQL 배포 | 실제 상담 기록은 0건이며, 시험 입력은 ROLLBACK했다. |

## 완료·배포·검증 증거

- 배포 커밋: `0f3226b` — `origin/main`에 반영됨.
- 상담일지 기본 migration: `add_consultation_journals` 운영 DB 적용 완료.
- 실제 적용 객체 RLS 재시험: 8/8 PASS. manager 입력·수정, owner 조회 허용; staff/chief 조회 차단, staff 입력·anon 조회 거부, `created_at` 변조 거부. 시험 트랜잭션은 ROLLBACK했다.
- Sol 검토: PASS.
- `db/consultation_journal_advisor_hardening.sql`: 함수의 고정 `search_path`, `author_id` 인덱스, RLS 정책 initPlan 보완만 포함한다. 저장소 배포와 운영 SQL 실행은 별개이므로, 이 SQL의 운영 DB 적용은 미확정으로 유지한다.
- 기존 근무표 단계배포·집계·공개 URL 증거는 `docs/superpowers/specs/2026-09-20-employee-hub-zip-acceptance-matrix.md`에 보존한다.

## 아직 미완료 — Task 6~11

| Task | 다음 작업 | 외부 조건/승인 게이트 |
|---|---|---|
| 6 | 공지 첨부와 보증금 접근 요구를 최신 원문 기준으로 확정·구현 | Storage 버킷/RLS와 기존 자료 보존 영향 검토, 운영 적용 별도 승인 |
| 7 | 모바일 push 요구 구현 | VAPID·푸시 서비스 비용/자격증명/실기기 시험 승인 필요 |
| 8 | 근태 PDF 계약 요구 구현 | 양식·서명·보관 범위 확정 및 실제 인사자료 접근 승인 필요 |
| 9 | 메뉴 도움말 구현 | 확정 메뉴 구조와 문구 확인 후 최소 범위 반영 |
| 10 | 최종 수용시험 | 역할별 실제 로그인 시험과 운영 화면 저장·재조회 확인 필요 |
| 11 | 보고서/인계 산출물 정리 | Task 6~10의 객관적 시험 결과가 있어야 완료 판단 가능 |

## 운영 시험 경계와 다음 순서

1. `db/consultation_journal_advisor_hardening.sql`의 운영 적용 여부를 총괄/원장 SQL Editor 기록으로 확인한다. 미적용이면 적용 전 SQL 검토·별도 승인 후 적용하고 RLS 8/8을 재실행한다.
2. 배포 URL의 현재 커밋 반영을 확인한 뒤, 별도 시험 계정으로 manager·owner·staff·chief 각각의 로그인/조회/입력/수정/저장 후 재조회 경계를 시험한다. 실제 환자·직원 원본은 사용하지 않는다.
3. Task 6~11은 위 표 순서대로, 각 원문 요구와 수용 기준을 먼저 확정한 뒤 최소 변경으로 진행한다.

## 보호·금지사항

- `todos.md` 및 원본 ZIP·엑셀·실제 상담/환자/직원 행은 이 인수인계 작업에서 수정·복사·기록하지 않는다.
- 자격증명, 토큰, API 키, 실사용자 식별값을 저장소·문서·테스트 출력에 넣지 않는다.
- 운영 DB의 schema/data, Storage, 인증 계정, 알림 서비스는 별도 운영 승인 없이는 변경하지 않는다.
- 부모 작업트리 `Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan`은 사용자 작업이 섞여 있으므로 이 인수인계의 편집 대상이 아니다. 그 트리에만 있는 기존 구현계획 `docs/superpowers/plans/2026-09-20-employee-hub-zip-reconciliation.md`은 역사 원문으로 보존하고, 현재 배포 상태는 이 문서와 수용추적표를 우선한다.

## 재검증 명령

Windows 환경에서 `node --test`는 runner의 `spawn EPERM`으로 실패할 수 있으므로, 개별 파일을 직접 실행해 코드 실패와 분리한다.

```powershell
node tests/consultation-journal.test.js
git diff --check
```

기록 갱신 시점의 코드 검증 결과는 상담일지 관련 direct Node 시험 PASS, `git diff --check` PASS였다. 위 명령은 운영 로그인·DB 적용을 대신하지 않는다.
