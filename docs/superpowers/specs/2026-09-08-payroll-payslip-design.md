# M3 급여·명세서 설계 (Payroll & Payslip)

> 작성일: 2026-09-08 · 대상 파일: `hr.html`(주 작업 대상) · `db/*.sql`(신규 `payroll.sql`) · `app_settings`
> 상태: 원장 확인 대기 (아래 "⚠️ 원장 재확인 필요" 1건 제외하고는 2026-09-08 질문 4건 답변 반영됨)

## 목표 (Goal)

todos.md 「🔵 진행 중 / 바로 다음」 1번. 백엔드 표(`payroll_rows`·`payslips`·`monthly_reviews`·`bonus_rules`)는 이미 있고 화면만 없는 상태 — hr.html에 급여 탭을 신설해 5가지를 만든다: 급여대장 가져오기, 임금명세서 발행, 휴일근로 계산기, 월말 평가(정량/정성), 조퇴 공제 계산.

## 배경 (Why)

- hr.html(980줄) 전체에 급여 관련 코드가 0건 — 완전 신규 화면.
- 원장 확인 4건(2026-09-08, AskUserQuestion) 답변: ①급여대장=엑셀 업로드+화면 수기입력 둘 다 ②명세서=법정양식+병원 컬러 ③시급/기본급=profiles에 필드 추가 ④월말평가=자유 메모형(현 스키마 그대로).
- 스키마·기존 코드를 조사하며 발견한 갭 2건(이번에 같이 처리):
  1. **조퇴 계산은 이미 절반 만들어져 있었다.** 지문엑셀 파서 `calcRow()`(hr.html:570)가 `early`(조퇴 분 = 예정 퇴근시각 이전 실제 퇴근)를 이미 계산해 미리보기 표(`renderXlTable`)에 보여주고 있는데, 정작 저장 시(`saveAttendance()` → payload)에는 안 넣어서 `attendance` 표엔 안 남는다. `late_min`과 대칭으로 `early_min` 컬럼만 추가하면 됨 — 새 계산 로직 불필요.
  2. **⚠️ 원장 재확인 필요 — 시급/기본급 저장 위치.** `profiles` SELECT RLS가 `using(true))`라서 로그인한 직원 **전원이 서로의 profiles 행을 전부 열람 가능**(이름·부서 등은 원래 그래도 되는 정보 기준으로 그렇게 설계됨). 원장이 고른 "profiles에 필드 추가"를 그대로 따르면 시급·기본급도 전 직원에게 공개된다. 이미 이 프로젝트가 `payroll_rows`/`monthly_reviews`/`bonus_rules`를 owner 전용 별도 표로 분리해둔 이유와 동일한 문제라, **아래 결정 표에서는 별도 owner 전용 표(`wage_info`)로 바꿔 제안**한다. 이대로 진행해도 되는지만 확인받으면 됨(불편하면 profiles 그대로 + 컬럼별 접근제한은 Postgres RLS로는 안 되니 뷰 분리 등 추가 작업 필요 — 별도 표가 더 단순함).

## 확정된 결정

| 항목 | 결정 |
|---|---|
| 탭 위치 | hr.html에 `pay`(급여) 탭 신설. `TAB_ROLES` 기본값 = owner만(기존 탭권한 기능으로 이후 원장이 원하면 조정 가능) |
| 직원 열람 | 탭 자체는 안 열어주고, 발행(`issued=true`)된 본인 명세서만 홈 화면에 "명세서 보기" 카드로 노출(기존 `payslips_select_scoped` RLS 그대로 재사용 — 코드 변경 없이 됨) |
| 급여대장 가져오기 | (a) **엑셀 업로드**: 헤더 행을 읽어 열↔항목을 최초 1회 매핑하는 화면 표시 → 매핑을 `app_settings.payroll_col_map`(json)에 저장 → 다음 달부터 같은 양식이면 자동 인식(기존 지문엑셀 파서와 동일 UX 패턴). (b) **화면 수기입력**: 직원 선택 → 항목-금액 표를 직접 입력/수정. 두 경로 모두 최종적으로 같은 `payroll_rows.items`(jsonb, `{항목명:금액}`)에 합쳐 저장하고 `net`에 실지급액 기록 — 엑셀로 가져온 뒤 화면에서 수정도 가능(하나의 편집 화면) |
| 임금명세서 양식 | 근로기준법 시행령 제27조의2 임금명세서 필수기재사항 6종을 템플릿에 포함: ①근로자 특정정보(성명 등) ②임금지급일 ③임금총액 ④임금 구성항목별 금액과 계산방법(연장·야간·휴일근로 해당 시 통상시급·시간수) ⑤공제항목별 금액과 총액 ⑥근로일수·총 근로시간·연장/야간/휴일근로 시간수. 여기에 병원 로고 + `#156f72` 포인트 컬러만 입힘(법정 항목은 실행 직전 세무사 확인 권장 — 시행령 조문 자체는 codex 작성 전 원장님이 한 번 더 보셔도 좋음). `payslips.html`에 렌더링된 최종 HTML을 저장, [발행] 버튼으로 `issued=true` 전환 |
| ⚠️ 시급/기본급 저장 | **별도 owner 전용 표 `wage_info`로 제안**(원래 답변 "profiles에 필드 추가"에서 조정 — 위 배경 2번 참조). `payroll_rows`/`monthly_reviews`와 동일한 RLS 패턴(owner만 select/insert/update/delete) |
| 월말평가 | 결정대로 `monthly_reviews` 스키마 변경 없음. 화면에 정량 메모·정성 메모·매출 메모·상여액/상여 사유 4칸 입력 폼만 추가 |
| 조퇴 공제 | `attendance.early_min` 컬럼 신설(late_min과 대칭) + `saveAttendance()` payload에 `early_min:c.early` 한 줄 추가(계산 로직은 이미 있음, 저장만 안 하고 있었음). 급여 탭에서 해당 월 조퇴분 합계 × 시급(`wage_info.wage_type`이 monthly면 기본급/월 소정근로시간으로 환산) = 공제 제안액을 자동 계산해 급여대장 편집 화면에 항목으로 띄움(원장이 최종 확정) |
| 휴일근로 계산 | `attendance.is_holiday=true`인 근무시간 × 시급 × 가산율(근로기준법 제56조, 5인 이상 사업장 기준: 8시간 이내분 1.5배, 8시간 초과분 2배) 자동 계산해 수당 항목으로 제안. 역시 원장이 급여대장 화면에서 검토 후 확정하는 "제안값"이지 자동 확정이 아님 |

## 데이터 모델 변경 (신규 `db/payroll.sql`)

```sql
-- 조퇴 컬럼 (late_min과 대칭, 계산 로직은 hr.html calcRow()에 이미 존재)
alter table public.attendance add column if not exists early_min int default 0;

-- 시급/기본급 (owner 전용 — profiles의 using(true) SELECT를 피하기 위한 별도 표)
create table if not exists public.wage_info (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  wage_type text not null default 'monthly' check (wage_type in ('hourly','monthly')),
  base_wage numeric not null default 0,
  effective_from date not null default current_date,
  updated_at timestamptz default now()
);
alter table public.wage_info enable row level security;
-- select/insert/update/delete 전부 my_role()='owner' (payroll_rows와 동일 패턴)
```

`payroll_rows`/`payslips`/`monthly_reviews`/`bonus_rules`는 스키마 변경 없음(기존 표 그대로 사용).

## UI 변경 (hr.html)

- `pay` 탭 신설, 서브 네비게이션 4개:
  1. **급여대장** — 월 선택 → 엑셀 업로드(열 매핑, 최초 1회만) 또는 수기입력 표. 저장 전 조퇴공제·휴일근로 계산값을 항목으로 제안 표시(원장이 지우거나 값 수정 가능). [저장]으로 `payroll_rows` upsert.
  2. **명세서 발행** — 월 선택 → 직원별 `payroll_rows.items` 기반 법정양식 미리보기 → [발행] 클릭 시 `payslips`에 HTML 저장 + `issued=true`.
  3. **월말평가** — 월 선택 → 직원별 정량/정성/매출/상여 4칸 폼 → `monthly_reviews` upsert.
  4. **시급 설정**(owner 전용 서브탭) — 직원별 `wage_info` 조회/수정 표.
- 직원 홈 화면: 본인에게 발행된 명세서가 있으면 카드 1개 추가("이번 달 명세서 보기" → `payslips.html` 렌더).
- 지문엑셀 저장 로직(`saveAttendance()`): payload에 `early_min:c.early` 한 줄만 추가(화면 표시는 이미 되고 있어 UI 변경 없음).

## 에러 처리

- 엑셀 열 매핑이 안 된 컬럼은 저장 대상에서 제외하고 "매핑 안 됨" 안내만(강제 저장하지 않음).
- `wage_info`에 값이 없는 직원은 조퇴공제·휴일근로 자동계산을 건너뛰고 "시급 미설정 — 수기 입력 필요" 안내만 표시(0으로 임의 계산하지 않음).
- 명세서 미발행(`issued=false`) 상태에서는 직원 화면에 절대 노출 안 함(기존 RLS로 이미 보장).

## 테스트 계획

- 엑셀 업로드 → 열 매핑 → 저장 → `payroll_rows.items`에 정확히 반영되는지, 다음 달 업로드 시 매핑이 자동 적용되는지 확인.
- 수기입력만으로도 저장 가능한지(엑셀 없이) 확인.
- 지문엑셀 재업로드 시 `attendance.early_min`이 실제로 채워지는지, 기존 지각/연장 계산엔 영향 없는지(회귀) 확인.
- 명세서 발행 전/후로 직원 계정 로그인 시 명세서 카드 노출 여부가 정확히 바뀌는지 확인.
- 시급 미설정 직원의 급여대장에서 공제·수당 제안이 자동계산되지 않고 안내만 뜨는지 확인.
- SQL은 codex 작성 후 Claude가 실행 전 교차검증(기존 프로젝트 규칙).

## 범위 밖 (지금 하지 않음)

- 4대보험료·소득세 자동계산(요율표 연동) — 세무사가 계산한 값을 급여대장에 그대로 반영하는 것을 기본으로 하고, 자동계산기는 만들지 않음.
- 연말정산.
- `bonus_rules.formula`의 실제 수식 파서(현재처럼 텍스트 메모 + 원장 수기 확정액으로만 사용, 자동 수식 계산 엔진은 미구현).
- 급여 이력의 그래프·통계 대시보드.
