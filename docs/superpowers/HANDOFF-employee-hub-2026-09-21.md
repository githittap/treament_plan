# 직원허브 현재 인수인계

- 갱신: 2026-09-21 Task 6 로컬 보안 보완
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
| E. Task 6 공지 첨부·예치금 | 로컬 보안 보완·합성검증 완료, 운영 적용·배포 미수행 | `960c351`; 기존 permissive 정책 제거, 서버 작성자 고정·불변 필드, private Storage 검증·열람·실패 정리까지 포함한다. |

## 완료·배포·검증 증거

- 배포 커밋: `0f3226b` — `origin/main`에 반영됨.
- 상담일지 기본 migration: `add_consultation_journals` 운영 DB 적용 완료.
- 실제 적용 객체 RLS 재시험: 8/8 PASS. manager 입력·수정, owner 조회 허용; staff/chief 조회 차단, staff 입력·anon 조회 거부, `created_at` 변조 거부. 시험 트랜잭션은 ROLLBACK했다.
- Sol 검토: PASS.
- `db/consultation_journal_advisor_hardening.sql`: migration `harden_consultation_journals`로 운영 DB 적용 완료. 함수의 고정 `search_path`, `author_id` 인덱스, RLS 정책 initPlan을 보완했고, 적용 후 신규 상담일지 관련 Advisor security WARN은 0건이다. performance에는 신규 빈 테이블의 unused-index INFO만 남았다.
- 공개 확인: `https://jung-plant.com/hr.html?v=0f3226b`에서 상담일지·`consultation_journals` 마커 반영, 로그인 화면 정상 및 console error 0건.
- 기존 근무표 단계배포·집계·공개 URL 증거는 `docs/superpowers/specs/2026-09-20-employee-hub-zip-acceptance-matrix.md`에 보존한다.
- Task 6: `NOTICE_ATTACHMENTS_ACCEPTANCE_PASS`, `PGLITE_NOTICE_ATTACHMENTS_DEPOSIT_ACCESS_PASS`, 전체 직접 Node 회귀, 인라인 JS 구문검사, `git diff --check`를 로컬에서 통과했다. 롤백 SQL은 `db/notice_attachments_deposit_access_rollback.sql`이며, 실제 첨부 생성 뒤에는 데이터 보존 판단 전 실행하지 않는다.
- 원본의 시간상 최초 업로드는 `직원허브설명서관련.zip`, 승인 구현 정본은 `직원허브 수정 지침.zip`이다. 원본 6개의 읽기전용 해시·수량은 `docs/superpowers/specs/2026-09-21-employee-hub-source-zip-inventory.md`에 고정한다.

## 승인 범위·실행 상태

- 최초 ZIP의 승인된 추가형 구현·시험·DB/RLS/Storage·단계배포는 단계별 재승인 없이 진행한다.
- 별도 승인 게이트는 원본 삭제, 대량 이관/수정, 보안 완화, 새 비용, 자격증명 입력, 실제 직원 메일·push·알림, 외부 공개처럼 기존 범위를 확대하는 경우에만 적용한다.
- 이전 Terra 실행은 idle이며 재지시하지 않는다. Task 6 검증은 이 worktree에서 완료했다.

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
