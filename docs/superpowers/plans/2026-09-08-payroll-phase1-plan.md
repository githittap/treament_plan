# M3 급여 — 1단계 구현 계획 (Codex 위임용)

> 작성 2026-09-08 · 설계서 `specs/2026-09-08-payroll-payslip-design-rev1.md`의 1단계
> 상태: **Codex plan-review 완료·반영함 → 원장 확인 후 구현 위임**

## 1단계 범위 (이번 세션)

**목표**: 급여대장(payroll ledger)을 화면에서 업로드·수기입력·저장하는 핵심 기능 + 시급 정보 저장.

| 넣는다 | 뺀다(2단계) |
|---|---|
| `db/payroll.sql`(early_min·wage_info) | 명세서 발행 |
| 조퇴 저장 누락 수정(A-3) | 4대보험·소득세 검산 계산 |
| 급여 탭 + 시급설정 화면 | doc_templates 서식 편집기 |
| 급여대장(엑셀 업로드·수기·저장) | 회신서식 자동생성 |
| | 연차 일수 정정(A-1)·연차 결재 RPC(A-2) |

## Codex 검토 반영 결정

| Codex 지적 | 결정 |
|---|---|
| ① SQL을 hr.html 배포보다 **먼저** (안 그러면 근태저장 통째 실패, push=자동배포) | **채택.** 배포 순서: payroll.sql 실행·검증 → 그다음 hr.html push |
| ③ `wage_info` 1인1행이면 시급 이력 소실 → **effective_from 이력형** | **채택.** `unique(user_id, effective_from)`, "그 달 시급"=effective_from ≤ 월말 중 최신 |
| ④ 급여 탭이 탭권한 override로 직원에 노출될 수 있음 | **채택(단순).** 기존 `owner` 탭과 똑같이 `roles:['owner']`로 두면 renderNav의 owner 분기가 override를 안 타서 자동 안전. renderOwner의 override 대상 배열(`['att'...'onbo']`)에 `pay`를 넣지 않기만 하면 됨 |
| ⑥ 급여대장 per-row 저장은 중간 실패 위험 → 전체 검증 후 배치 | **채택(단순).** 전 행 파싱·검증 후 **한 번의 `upsert(배열)`** (기존 attendance와 동일, 단일 statement라 원자적). RPC 불필요 |
| ② A-2 연차 승인을 RPC 트랜잭션으로 | **1단계에서 A-2 자체를 뺌.** chief(임은숙) 지정돼 급한 불 꺼짐. 연차 결재 안전화(RPC·상태가드·ledger 중복방지)는 2단계 '연차 하드닝'으로 |
| Q3 items 구조 충분한가(미답) | **Claude 판단: 충분.** `items`가 jsonb라 2단계 명세서가 있는 키를 그대로 렌더, 키 추가는 마이그레이션 불필요. 컬럼이 되는 것(시급 이력)만 지금 확정하면 됨 |

## Part A — `db/payroll.sql` (신규, 멱등, **먼저 실행**)

```sql
-- 1) 조퇴 칸 (late_min 대칭). calcRow()가 early를 이미 계산·표시만 하고 저장 안 하던 것 보정
alter table public.attendance
  add column if not exists early_min int not null default 0 check (early_min >= 0);

-- 2) 시급/기본급 (owner 전용, 이력형)
create table if not exists public.wage_info (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  wage_type text not null default 'monthly' check (wage_type in ('hourly','monthly')),
  base_wage numeric not null default 0,
  normal_hours numeric not null default 209,     -- 월 소정근로시간(209/167/157 혼재)
  fixed_bonus numeric not null default 0,          -- 구두 인상분 고정상여(세후)
  housing_support numeric not null default 0,      -- 숙소지원비(원장이 임대인에 직접송금)
  housing_from date, housing_to date,
  effective_from date not null default current_date,
  memo text, updated_by text, updated_at timestamptz default now(),
  unique (user_id, effective_from)
);
alter table public.wage_info enable row level security;
-- 4 정책 전부 (public.my_role() = 'owner'):
--   select using / insert with check / update using+with check / delete using
```
FK 타입 확인: `profiles.user_id`=uuid ↔ `wage_info.user_id`=uuid (과거 uuid/bigint 사고 방지 — 실측 일치).

## Part B — `hr.html` 편집

1. **A-3**: `saveAttendance()` payload(line ~595)에 `early_min:c.early` 한 항목 추가. 그 외 불변.
2. **급여 탭**: `TABS` 배열(line 265)에 `{key:'pay',label:'💰 급여',roles:['owner']}` 추가(owner 탭 바로 위). `render()` 디스패치(line ~321)에 `else if(TAB==='pay')await renderPay(m)` 추가. **renderOwner의 override 대상 배열엔 넣지 않음.**
3. **renderPay(m)** — 서브뷰 2개(JS 토글, 라우터 없음):
   - **시급설정**: PROFILES × wage_info 표. owner가 wage_type/base_wage/normal_hours/fixed_bonus/housing_support/effective_from 편집 → 저장 시 `wage_info` insert(새 effective_from면 이력 추가) 또는 같은 effective_from이면 upsert(onConflict `user_id,effective_from`). 화면엔 각 직원 '현재 적용 시급'(최신 effective_from) 표시.
   - **급여대장**: `<input type=month>` 월 선택. **[엑셀 업로드]** = 기존 XLSX 흐름 재사용(`parseXls`→`XLSX.read`→`sheet_to_json({header:1})`).
     - 실제 대장: **헤더 2행(6행 대분류 병합, 7행 항목명), 데이터 8행부터.** 파서는 (a)'성명'·'기본급' 포함 행을 스캔해 헤더행을 찾고 (b)열을 **정규화 헤더문자열**(공백·개행 제거)로 **별칭사전** 매칭(예: `미사용연차수당|유급연차→unused_annual`, `선지급|기타공제→prepaid`, `상여금|상여금(세후)→bonus`). **열 인덱스 하드코딩 금지**(월마다 위치가 밀림). 매칭 결과를 `app_settings.payroll_col_map`에 저장.
     - 직원 매칭: 성명→PROFILES에서 user_id. 못 찾으면 그 행 '미매핑' 표시(강제저장 안 함).
     - **[수기 추가/편집]**도 가능.
     - **[저장]**: 전 행 검증 후 **한 번의** `sb.from('payroll_rows').upsert(배열,{onConflict:'month,user_id'})`. 각 행 `{month, user_id, items:jsonb(항목키→숫자), net:차인지급액, imported_by:ME.name}`.

## 검증 계획
- **SQL**: 자동 테스트 없음. RLS가 기존 owner전용 패턴과 일치하는지 대조, FK 타입 일치 확인. 실행은 supabase-full MCP(apply_migration) 또는 원장 SQL 에디터 — 실행 전 Claude가 교차검증(프로젝트 규칙).
- **hr.html**: 단일 파일이라 테스트 스위트 없음. Claude가 브라우저 프리뷰로 로드→콘솔 에러 확인→owner 계정에서 급여 탭 렌더 확인→**실제 8월 급여대장 .xlsx 업로드**로 파서 열매칭 확인. (Codex는 JS 구문·중괄호만 점검)
- **배포 순서**: payroll.sql 먼저 → 검증 → hr.html push (컬럼/표가 없는 채로 JS가 참조하는 창 없게).

## 위임 단위 (Codex)
- **Unit 1**: `db/payroll.sql` 작성. (Claude 교차검증 후 실행)
- **Unit 2**: `hr.html` — A-3 + 급여 탭 + renderPay(시급설정·급여대장). Unit 1의 표/컬럼 전제.
- 두 유닛 다: git add/commit/push 금지(작업트리에 남김) · 파괴적 명령 금지 · 결과 나올 때까지 foreground 대기.
