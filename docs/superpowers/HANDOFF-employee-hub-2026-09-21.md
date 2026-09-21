# 직원허브 현재 인수인계

## 최신 인계 — Task6 production 완료, Task7/8 운영 대기 (2026-09-22)

- Task6는 production migration `employee_hub_notice_attachments_deposit_access_20260921` 적용을 완료했다. `notices=1` 및 `deposits=264`는 보존됐고, private `notice-attachments` 버킷은 10MB·6 MIME·objects=0 상태다. 자격증명이 없어 Storage API 실제 업로드는 미검증이다.
- Task7 첫 production apply는 fixed canonical mismatch로 transaction rollback돼 운영 변화가 없다. Task7 v5 로컬 정본은 `6941111`, `448bcc2`, `72c4749`, `1b2e36b`; fingerprint `task7-push-v5-catalog`, manifest `push-v5-catalog-20260922`, SHA256 `ae2606f243d91400b15624dbc9113ae3e6187ed03b7eef6d213d37f56799b53e`, MD5 `8179b7fed8536fe0516a0b29109f1728`다. PGlite exact catalog/behavior/fail-closed 및 push static PASS, 운영 미적용이다.
- Task8 로컬 보완 정본은 `373e829`다. Task7 v5 상수·identity·private allowlist, marker exact shape와 negative matrix를 보강했고 Task8/Task7 PGlite PASS다. 운영 미적용이다.
- 다음: Sol High 독립 검증 PASS → Task7 운영 apply/verify → Task8 운영 apply/verify → 승인된 단계배포·실사이트 확인. 실제 직원 메일·Push·생체입력, 자격증명 입력, 원본 삭제, 대량 이관, 보안 완화, 새 비용은 금지한다. `직원허브 5차.zip`은 최초 승인 범위 완료 뒤에만 읽으며 `상담문의 등 일원화.zip`은 직원허브 전체 후속이다.

## 재부팅 정본 (2026-09-21)

- Task8 로컬 보완: Task7 fixed fingerprint/manifest·canonical/identity와 Task8 marker owner/ACL/RLS drift, old ACL 필수 EXECUTE 및 Sol M1 EOF 빈 줄을 fail-closed 시험으로 추가했다. 고정 PGlite 0.5.8 Task8·Task7 회귀 및 diff check PASS.
- Task7/Task8 hardening 로컬 PASS: Task7 same-name CHECK·helper/trigger·private namespace 및 Task8 marker column/constraint/index/trigger drift는 reapply/rollback 거부 fixture로 확인했다. 운영 미적용.
- 다음: Sol 독립 재검증. 그 전 운영 DB/push/deploy/5차 ZIP 열람 금지.

## Task 8 재부팅 체크포인트 (2026-09-21)

- 로컬 SQL: `db/attendance_owner_chief_gate_patch.sql` / rollback. Task7 private manifest가 선행이며 rollback 순서는 **Task8 → Task7**이다.
- 고정 PGlite 0.5.8에서 apply×2·drift fail-closed·RESET·rollback 구 함수 hash·reapply를 통과했다. 운영 migration/행 변경·push·배포·5차 ZIP 열람은 하지 않았다.

## 최신 정정 — Task 6 Sol High 최종 PASS (2026-09-21, 문서 갱신)

현재 구현 HEAD: `d0222684dd7da4607752c22b2912ad8bf4f0d87a`. Sol High 최종 PASS(Critical/Important/Minor 없음)이며 로컬 직접 Node 30개, PGlite, 인라인 JS, `git diff --check` PASS와 clean worktree를 확인했다. 닫힘 범위는 foldername 길이2, 게시 첨부 restrictive DELETE guard, JSON 구조/NULL 강제, 정책·RLS·ACL·버킷 rollback, apply×2 fail-closed, quoted role 복원이다. push·배포·운영 DB/Storage·실계정은 미수행이다.

운영 전에는 Storage DELETE/ALL 정책·ACL·RLS·버킷/객체 snapshot, 별도 시험계정 upload/download/cleanup/게시 후 삭제 거부/MIME·10MB, 복제환경 rollback, 단일 migration 실행이 필요하다. 최종 직전에만 사용자 승인 외부 Opus 읽기전용 검증을 수행한다. K3는 BUSD MCP_INTERNAL_ERROR 및 managed Kimi 403으로 제외하며 연결 완료 전 Terra 유지한다. `C:\Users\elusi\Downloads\직원허브 5차.zip`은 지금 열지 않고 기존 승인 미완료 뒤 원본 보존·요구 대조 대상으로 대기한다.

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
