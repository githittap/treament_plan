# 접근제어 개편 설계 (Access Control Overhaul)

> 작성일: 2026-09-06 · 대상 파일: `hr.html`(주 작업 대상), `ortho.html`·`기공차트_리메이크장부_서식.html`(간접 영향, 공유 Auth) · `db/*.sql`
> 상태: 승인됨 (브레인스토밍 완료, 구현 계획 작성 대기)

## 목표 (Goal)

두 가지를 한 프로젝트로 묶어 설계한다.

- **A. 로그인 승인제**: 직원 셀프가입을 원장이 승인해야 실제 데이터 접근이 가능한 구조로 전환.
- **B. 비밀 진료기록**: 공개되면 안 되는 진료 관련 내용을 담는 기록을 신설하고, 원장이 개별 허락한 소수 인원만 열람 가능하게 함.

## 배경 (Why)

- 현재 hr.html 로그인 화면에서 누구나 셀프 회원가입하면 즉시 `staff` 권한으로 hr·교정·기공 3개 도구 데이터에 접근 가능(가입 시 `profiles` 자동 생성, RLS는 `my_role()` 기반 4단 role만 존재). 원장이 가입을 사전에 확인·승인하고 싶어함.
- 별도로 "직원마다 항목별 열람권한을 다르게 하고 싶다"는 요구가 있었고, 구체적 사례로 "비밀 진료기록"(공개 금지, 원장이 허락한 사람만 열람)을 제시함.
- 비밀 진료기록은 **교정 케이스에 국한되지 않는 일반 진료 기록**이며, 환자명·차트번호 등 환자 식별 정보를 어느 정도 담아야 함(원장 명시: "우리끼리 사용하는 목적", "불법적인 게 아니고 우리만의 기록"). 이 프로젝트는 개인정보(주민번호·연락처·진단내용 등) 저장을 이미 허용하는 방침이라 별도 마스킹은 하지 않는다.

## 확정된 결정 (승인됨)

| 항목 | 결정 |
|---|---|
| A. 승인제 적용 범위 | 새로 가입하는 사람부터만. 기존 계정(약 25명)은 전부 승인됨으로 일괄 처리, 재검토 없음 |
| A. 승인 전 UX | 로그인 자체는 허용. 데이터는 RLS로 전부 차단하고, hr.html에는 "승인 대기 중" 안내 화면만 표시 |
| A. 구현 지점 | `profiles.approved`(bool, 신규가입 기본 false, 기존 전부 true) 컬럼 추가 + `my_role()` 함수 한 곳만 수정(미승인이면 `'pending'` 반환) → 기존 모든 표의 RLS 정책이 이미 role 기반이라 자동으로 이 사람을 차단(표별 정책 수정 불필요) |
| A. 승인 UI | 기존 "원장 탭"(현재 chief/manager 권한을 지정하는 화면)에 승인 대기 목록 + [승인] 버튼 추가 |
| B. 비밀 진료기록 범위 | 교정에 국한되지 않는 일반 환자 대상. 특정 케이스(`ortho_cases` 등)에 DB로 연결하지 않고 독립된 표로 관리 |
| B. 기록 항목 | 환자명, 차트번호(선택), 내용, 작성자, 작성일. 검색은 환자명/차트번호 기준 |
| B. 접근 방식 | 문서함 전체에 대해 원장이 지정한 고정 명단(문서마다 다르게 지정하지 않음 — 단순함 우선) |
| B. 미허용자 UX | 명단에 없으면 hr.html에 "비밀 진료기록" 탭 자체가 렌더링되지 않음(존재를 노출하지 않음) |
| B. 위치 | hr.html 안에 새 탭으로 (별도 신규 도구 아님 — 기존 "직원 허브" 안에 통합) |
| 공통 | 개인정보 마스킹·법적 경고 없이 그대로 저장(기존 프로젝트 방침 유지) |

## 데이터 모델 변경

### A. `profiles.approved`

```sql
alter table public.profiles add column if not exists approved boolean not null default false;
update public.profiles set approved = true; -- 기존 전원 일괄 승인 (1회성, 배포 시 1번만 실행)
```

`my_role()` 함수 수정: 기존 role 계산 로직 앞단에 미승인 시 `'pending'`을 반환하는 분기를 추가한다. 정확한 삽입 위치·표현은 함수 실제 본문을 본 뒤 codex가 정한다(기존 로직 구조를 따름).

### B. 신규 표 2개

```sql
create table public.confidential_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table public.confidential_records (
  id bigint generated always as identity primary key,
  patient_name text not null,
  chart_no text,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);
```

RLS: 두 표 모두 `exists (select 1 from confidential_access where user_id = auth.uid()) or my_role() = 'owner'`인 사람만 select 가능, `confidential_records`는 같은 조건으로 insert도 가능. `confidential_access` 자체의 추가/삭제(행 관리)는 owner만.

## UI 변경

- `hr.html`: 헤더에 "비밀 진료기록" 탭 추가 — 명단에 없는 사용자에겐 탭 자체를 렌더링하지 않음. 탭 내용은 목록(환자명·차트번호·날짜순, 최신순) + 검색창(환자명/차트번호) + 새 기록 작성 폼.
- `hr.html`: 기존 원장 전용 화면(현재 role 지정 UI)에 두 섹션 추가.
  - "가입 승인 대기 목록": `approved=false`인 프로필 목록 + [승인] 버튼.
  - "비밀 진료기록 접근 명단": 이메일/이름 검색 → 추가·제거.
- `hr.html` 로그인 직후: 본인 `profiles.approved` 값을 확인 → `false`면 정상 화면 대신 "승인 대기 중입니다" 전체 화면 안내만 표시(다른 탭·데이터 요청 자체를 만들지 않음).

## 에러 처리

- `my_role()`이 `'pending'`을 반환해도 호출부에서 예외를 던지지 않고 조용히 빈 결과만 반환(기존 role 체크 실패 패턴과 동일하게 처리).
- 비밀 진료기록 탭: 명단 조회가 실패(네트워크 오류 등)하면 권한이 있어도 탭을 안전하게 숨김(fail closed — 열람 가능 여부가 불확실할 땐 안 보여주는 쪽으로).

## 테스트 계획

- 신규가입 계정으로 로그인 → hr·교정·기공 전부 데이터가 안 보이는지, hr.html엔 승인대기 화면이 뜨는지 확인.
- 원장이 승인 버튼 클릭 → 승인 후 정상 데이터가 노출되는지 확인.
- 기존 25개 계정으로 로그인 → 승인 전과 동일하게 정상 작동(회귀 없음) 확인.
- 비밀 진료기록 접근 명단에 없는 계정 → 탭이 아예 안 보이는지 확인. 명단에 있는 계정 → 탭이 보이고 기록 작성·조회·검색이 되는지 확인.
- SQL은 codex 작성 후 Claude가 실행 전 교차검증(기존 프로젝트 규칙 — FK/제약조건 실측 후 실행 안내).

## 범위 밖 (지금 하지 않음)

- 문서별 개별 ACL(기록마다 다른 사람을 지정하는 것) — 지금은 문서함 전체에 대한 고정 명단만.
- 비밀 진료기록과 `ortho_cases`/기공 장부의 DB 연결 — 필요해지면 이후 별도 설계.
- 신규가입 승인 대기 알림(텔레그램 등, 입금피드처럼) — 구현 후 필요성 판단.
- `ortho.html`·기공차트에 "승인 대기 중" 안내 화면 추가 — 우선 hr.html에만 넣고, 나머지 두 도구는 RLS 차단만으로 방어(안내 문구 없이 데이터만 안 보임).
