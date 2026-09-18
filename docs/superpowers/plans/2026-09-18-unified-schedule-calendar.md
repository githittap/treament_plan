# 통합 근무명부·부서별 캘린더 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 로그인 직원과 비로그인 의사를 하나의 근무명부로 통합하고, 근무표의 부서별 근무·야간·OFF 상태를 기존 연차·공휴일과 함께 월간 캘린더에 표시한다.

**Architecture:** `schedule_people`을 근무명부 정본으로 추가하고 `schedules.person_id`가 이를 참조하도록 단계적으로 이관한다. `hr.html`은 통합 명부를 기준으로 근무표·관리 화면·캘린더를 렌더링하되 기존 `schedules.user_id`는 첫 배포에서 롤백용으로 유지한다. 모든 이름·부서·집계 제외 여부는 DB 데이터로 관리하고 코드에는 개인 이름을 넣지 않는다.

**Tech Stack:** 단일 파일 HTML/JavaScript, Supabase Postgres·REST·RLS, Node.js 내장 test runner, Git/GitHub 정적 배포

## Global Constraints

- 설계 정본은 `docs/superpowers/specs/2026-09-18-unified-schedule-calendar-design.md`다.
- `abc`, `테스트`, `공용1`은 삭제하지 않고 초기 데이터에서만 집계 제외한다. 이후 로직은 이름을 하드코딩하지 않는다.
- 공휴일은 정보 태그이며 `OFF`로 자동 변환하지 않는다.
- 기존 `schedules` 행과 계약·연차·급여·출퇴근 로직을 삭제하거나 재해석하지 않는다.
- 운영 DB 변경 전후에 총행수·주차별·시프트별 집계를 비교한다.
- 새 테이블은 `anon` 접근을 철회하고 `authenticated` 권한과 역할 기반 RLS를 명시한다.
- 로컬 변경은 작은 단위로 테스트하고 커밋한다. 운영 반영은 로컬 테스트가 모두 통과한 뒤 수행한다.

---

### Task 1: 마이그레이션 SQL과 회귀 테스트 작성

**Files:**
- Create: `db/unified_schedule_roster.sql`
- Create: `db/unified_schedule_roster_finalize.sql`
- Create: `tests/schedule-roster-sql.test.js`

**Step 1: 실패하는 SQL 구조 테스트 작성**

`tests/schedule-roster-sql.test.js`에서 두 SQL 파일을 읽고 다음을 검증한다.

```js
test('통합 근무명부와 person_id 이관을 정의한다', () => {
  assert.match(phase1, /create table if not exists public\.schedule_people/i);
  assert.match(phase1, /add column if not exists person_id uuid/i);
  assert.match(phase1, /alter column user_id drop not null/i);
  assert.match(phase1, /unique \(week_start, person_id, day\)/i);
});

test('명부 관리는 manager chief owner로 제한한다', () => {
  assert.match(phase1, /my_role\(\).*manager.*chief.*owner/is);
  assert.match(phase1, /revoke all on table public\.schedule_people from anon/i);
  assert.match(phase1, /grant select, insert, update on table public\.schedule_people to authenticated/i);
  assert.doesNotMatch(phase1, /grant delete/i);
});
```

**Step 2: 테스트 실패 확인**

Run: `node --test tests/schedule-roster-sql.test.js`

Expected: SQL 파일이 없어 실패한다.

**Step 3: 1단계 마이그레이션 작성**

`db/unified_schedule_roster.sql`에 하나의 트랜잭션으로 다음을 구현한다.

```sql
create table if not exists public.schedule_people (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid unique references public.profiles(user_id) on delete set null,
  name text not null check (btrim(name) <> ''),
  department text not null default '미지정'
    check (department in ('Dr.', '진료실', '데스크', '기공실', '미지정')),
  included_in_schedule boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedules
  add column if not exists person_id uuid references public.schedule_people(id);
alter table public.schedules alter column user_id drop not null;
```

- `profiles`의 모든 행을 `profile_user_id` 기준으로 upsert한다.
- 기존 `schedules.user_id`와 `schedule_people.profile_user_id`를 연결해 `person_id`를 백필한다.
- 백필되지 않은 기존 일정이 있으면 예외를 발생시켜 트랜잭션을 중단한다.
- 기존 `(week_start,user_id,day)` 고유 제약은 유지하고, 부분 고유 인덱스 `unique (week_start,person_id,day) where person_id is not null`을 추가한다.
- 초기 데이터에서 세 테스트 계정은 `included_in_schedule=false`, 정용태 연결 행은 `department='Dr.'`, 정도경·정규민은 비로그인 `Dr.` 행으로 추가한다. 이 구간만 명시적 초기 이관이며 앱 로직에는 이름을 넣지 않는다.
- `schedule_people` RLS를 활성화한다. 조회는 `authenticated`, 추가·수정은 `public.my_role() in ('manager','chief','owner')`, 삭제 정책은 만들지 않는다.
- `anon`의 모든 권한을 철회하고 `authenticated`에 `select, insert, update`만 부여한다.

**Step 4: 2단계 확정 SQL 작성**

`db/unified_schedule_roster_finalize.sql`은 운영 이관 검증 후 실행하며, null `person_id`가 있으면 예외를 내고 `schedules.person_id not null`을 적용한다. 기존 `user_id`는 삭제하지 않는다.

**Step 5: 테스트 통과 확인**

Run: `node --test tests/schedule-roster-sql.test.js`

Expected: PASS.

**Step 6: 커밋**

```bash
git add db/unified_schedule_roster.sql db/unified_schedule_roster_finalize.sql tests/schedule-roster-sql.test.js
git commit -m "feat: 통합 근무명부 마이그레이션 추가"
```

---

### Task 2: 통합 명부 순수 함수와 로딩 경로 추가

**Files:**
- Modify: `hr.html`
- Create: `tests/schedule-roster.test.js`

**Step 1: 실패하는 순수 함수 테스트 작성**

`hr.html`의 `/* schedule-roster:test-start */`와 `/* schedule-roster:test-end */` 사이 코드를 `vm`으로 실행해 다음을 검증한다.

```js
test('Dr. 부서는 화면 이름에만 접두사를 붙인다', () => {
  assert.equal(ctx.schedulePersonLabel({ name: '정도경', department: 'Dr.' }), 'Dr. 정도경');
  assert.equal(ctx.schedulePersonLabel({ name: '홍길동', department: '진료실' }), '홍길동');
});

test('활성·포함 명부와 과거 일정 보존 대상을 구분한다', () => {
  const visible = ctx.schedulePeopleForWeek(people, rows);
  assert.deepEqual(visible.map(x => x.id), ['active', 'archived-with-row']);
});

test('날짜별 부서·야간·OFF·기타와 초안 상태를 집계한다', () => {
  const day = ctx.scheduleCalendarIndex(rows, people, weeks)['2026-09-18'];
  assert.deepEqual(day.departments['Dr.'].names, ['Dr. 정도경']);
  assert.deepEqual(day.evening, ['Dr. 정도경']);
  assert.equal(day.weekStatus, 'draft');
});
```

**Step 2: 테스트 실패 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: 테스트 블록 또는 함수 부재로 실패한다.

**Step 3: 최소 순수 함수 구현**

`hr.html`에 다음 책임만 가진 순수 함수를 테스트 블록 안에 둔다.

- `schedulePersonLabel(person)`: `department==='Dr.'`일 때만 `Dr. ` 접두사 추가
- `schedulePeopleForWeek(people, rows)`: 활성·포함 인원 + 해당 주차에 일정이 있는 비활성 인원 반환
- `scheduleDate(weekStart, day)`: 로컬 날짜 문자열을 안전하게 계산
- `scheduleCalendarIndex(rows, people, weeks)`: 날짜별 부서, 야간, OFF, 기타, 주차 상태 집계
- 동일 인원은 `person_id`로 중복 제거하고 표시 순서는 `sort_order`, 이름 순으로 고정

**Step 4: 명부 로딩 구현**

- 전역 `SCHEDULE_PEOPLE=[]`을 추가한다.
- `loadSchedulePeople()`에서 `schedule_people`을 `sort_order,name` 순으로 조회한다.
- 인증 완료 시 프로필과 명부를 함께 불러온 뒤 화면을 렌더링한다.
- 조회 실패 시 자동 저장 상태와 해당 화면에 `근무명부를 불러오지 못했습니다`를 표시한다.

**Step 5: 테스트 통과 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: PASS.

**Step 6: 커밋**

```bash
git add hr.html tests/schedule-roster.test.js
git commit -m "feat: 통합 근무명부 로딩과 집계 함수 추가"
```

---

### Task 3: 근무표를 person_id 기준으로 전환

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`

**Step 1: 실패하는 화면·저장 계약 테스트 추가**

다음을 정적·순수 함수 테스트로 추가한다.

- 근무표 행 키가 `person_id`를 사용한다.
- 신규 저장 payload에 `person_id`가 있고 비로그인 명부는 `user_id:null`을 허용한다.
- 부서 순서가 `Dr.`, `진료실`, `데스크`, `기공실`, `미지정`이다.
- 제외 인원은 새 주차에서 숨고 과거 일정 보유 비활성 인원은 해당 주차에서 보인다.
- 전주 복사 시 `person_id`, `user_id`, `day`, `shift`, `note`가 보존된다.

**Step 2: 실패 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: person_id 저장 계약 부재로 실패한다.

**Step 3: 근무표 렌더·저장 전환**

- `renderSched()`의 인원 정본을 `PROFILES`에서 `SCHEDULE_PEOPLE`로 바꾼다.
- 그룹 라벨과 순서를 설계대로 바꾸고 `기공팀`을 `기공실`로 통일한다.
- 일정 조회는 `person_id,user_id,week_start,day,shift,note`를 포함한다.
- 셀의 이벤트 핸들러에는 `person.id`와 `profile_user_id`를 전달한다.
- `setShift()` upsert 충돌키를 `week_start,person_id,day`로 바꾸고, 계정 연결 인원만 호환용 `user_id`를 채운다.
- 제외·활성 규칙은 `schedulePeopleForWeek()` 한 곳에서 적용한다.
- 전주 복사는 대상 주차의 기존 행을 지운 뒤 `person_id` 중심으로 복사한다.

**Step 4: 테스트 통과 확인**

Run: `node --test tests/schedule-roster.test.js tests/contract-preview.test.js tests/contract-expiry.test.js`

Expected: PASS.

**Step 5: 커밋**

```bash
git add hr.html tests/schedule-roster.test.js
git commit -m "feat: 근무표를 통합 명부 기준으로 전환"
```

---

### Task 4: 원장 화면에 명부 관리 기능 추가

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`

**Step 1: 실패하는 권한·UI 테스트 추가**

다음을 검증한다.

- 원장 화면에 `근무부서`, `근무표·집계 포함`, `재직 상태`가 있다.
- 관리자 판정은 `manager`, `chief`, `owner`만 허용한다.
- 비로그인 명부 추가 폼에 이름과 부서가 있다.
- 삭제 API 호출이 없고 `active=false` 방식만 사용한다.

**Step 2: 실패 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: 관리 UI 부재로 실패한다.

**Step 3: 관리 UI와 저장 함수 구현**

- 기존 권한 관리 표에 통합 명부 연결 행의 부서 선택, 포함 스위치, 재직 상태를 표시한다.
- `비로그인 근무명부` 카드에 이름·부서 추가 폼을 만든다.
- `saveSchedulePerson()`, `setSchedulePersonDepartment()`, `setSchedulePersonIncluded()`, `setSchedulePersonActive()`를 구현한다.
- mutation 직전에도 `['manager','chief','owner']` 역할을 확인하고, DB RLS를 최종 권한 경계로 유지한다.
- 저장 성공 시 `loadSchedulePeople()`을 다시 실행하고 관련 화면만 재렌더링한다.
- 퇴사/비활성화는 확인창 뒤 `active=false`; 재활성화는 같은 행에서 가능하게 한다.

**Step 4: 테스트 통과 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: PASS.

**Step 5: 커밋**

```bash
git add hr.html tests/schedule-roster.test.js
git commit -m "feat: 통합 근무명부 관리자 화면 추가"
```

---

### Task 5: 월간 캘린더에 부서별 근무 현황 통합

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`

**Step 1: 실패하는 캘린더 회귀 테스트 추가**

다음을 검증한다.

- `work`, `evening`, `off`, `etc`를 모두 조회한다.
- `work`와 `evening`은 부서 인원에 포함되고 `evening`은 별도 줄에도 표시한다.
- `off`, 승인 연차는 부서 근무 인원에서 제외한다.
- 공휴일과 근무자 태그가 같은 날짜에 함께 남는다.
- 초안은 `작성 중`, 공표는 `확정`으로 표시한다.
- 집계 제외 명부는 어떤 줄에도 포함하지 않는다.

**Step 2: 실패 확인**

Run: `node --test tests/schedule-roster.test.js`

Expected: 캘린더 통합 렌더 부재로 실패한다.

**Step 3: 조회와 렌더링 구현**

- `renderCalendar()`에서 표시 범위에 걸친 `schedules` 전체 시프트와 `schedule_weeks`를 조회한다.
- `scheduleCalendarIndex()` 결과를 기존 공휴일·관리자 이벤트·승인 연차에 합성한다.
- 표시 순서는 이벤트 → 부서 네 그룹 → 야간 → 연차 → OFF → 기타 → 주차 상태로 고정한다.
- 빈 부서는 생략한다. 이름이 길면 줄바꿈하고 셀 밖으로 넘치지 않게 한다.
- 모바일에서는 기본 태그를 축약하고 날짜 셀 클릭 시 전체 명단을 펼친다.
- 명부/일정 조회 실패는 빈 결과처럼 숨기지 않고 캘린더 상단 오류로 표시한다.

**Step 4: CSS와 접근성 검증**

- 부서·야간·OFF·연차·상태 태그에 기존 테마와 구별되는 클래스를 추가한다.
- 날짜 셀은 키보드 포커스와 `aria-expanded`를 제공한다.
- 공휴일 태그에는 치과 휴무를 뜻하는 문구를 추가하지 않는다.

**Step 5: 테스트 통과 확인**

Run: `node --test tests/schedule-roster.test.js tests/contract-preview.test.js tests/contract-expiry.test.js tests/employee-documents.test.js`

Expected: PASS.

**Step 6: 커밋**

```bash
git add hr.html tests/schedule-roster.test.js
git commit -m "feat: 캘린더에 부서별 근무 현황 표시"
```

---

### Task 6: 운영 Supabase 이관 및 데이터 검증

**Files:**
- Verify: `db/unified_schedule_roster.sql`
- Verify: `db/unified_schedule_roster_finalize.sql`

**Step 1: 변경 전 읽기 전용 스냅샷**

Supabase SQL로 다음을 기록한다.

```sql
select count(*) from public.schedules;
select week_start, count(*) from public.schedules group by week_start order by week_start;
select shift, count(*) from public.schedules group by shift order by shift;
select count(*) from public.profiles;
```

Expected: 총행수는 실행 시점 값을 기준으로 사용한다. 설계 당시 147건과 달라졌다면 최신 값을 정본으로 삼고 삭제 없이 이관한다.

**Step 2: 1단계 SQL 실행**

`db/unified_schedule_roster.sql` 전체를 운영 프로젝트 `texevhsxttfoqkrucfzl`에 실행한다.

Expected: 트랜잭션 성공, 기존 일정의 null `person_id` 0건.

**Step 3: 이관 검증**

다음을 비교한다.

- 총행수, 주차별 건수, 시프트별 건수가 변경 전과 동일
- 모든 프로필에 연결 명부가 하나씩 존재
- 세 테스트 계정은 로그인 계정 유지 + `included_in_schedule=false`
- 정용태·정도경·정규민이 `Dr.`로 존재하며 후자 둘은 `profile_user_id is null`
- `anon`은 접근 불가, 일반 로그인은 조회 가능, manager/chief/owner만 명부 추가·수정 가능

**Step 4: 2단계 확정 SQL 실행**

검증이 모두 맞으면 `db/unified_schedule_roster_finalize.sql`을 실행해 `person_id not null`을 적용한다.

**Step 5: 보안·성능 점검**

Supabase 보안/성능 어드바이저를 실행하고 이번 변경으로 생긴 오류를 수정한다. 기존 경고는 별도로 구분해 기록한다.

---

### Task 7: 전체 검증·배포·운영 확인

**Files:**
- Modify if needed: `hr.html`
- Modify if needed: `tests/schedule-roster.test.js`

**Step 1: 전체 테스트**

Run: `node --test tests/*.test.js`

Expected: 모든 테스트 PASS.

**Step 2: 인라인 JavaScript 구문 검사**

기존 프로젝트 방식대로 `hr.html`의 `<script>`를 추출하여 `node --check`로 검사한다.

Expected: exit 0.

**Step 3: 변경 범위 점검**

Run: `git diff --check`

Run: `git status --short`

Expected: 공백 오류 없음. 계획된 파일만 변경됨.

**Step 4: 로컬 브라우저 기능 확인**

- owner 계정: 통합 명부 추가, 부서 변경, 집계 제외, 비활성/재활성
- 비로그인 Dr.: 근무·야간·OFF 저장
- 캘린더: 부서별 이름·인원, 야간, OFF, 연차, 공휴일, 작성 중/확정 동시 표시
- 모바일 폭: 날짜 펼침과 이름 줄바꿈
- 테스트 계정 로그인은 유지되고 근무 집계에서 제외

**Step 5: 최종 커밋과 푸시**

```bash
git add hr.html tests/schedule-roster.test.js db/unified_schedule_roster.sql db/unified_schedule_roster_finalize.sql
git commit -m "feat: 통합 근무명부와 캘린더 연동 완성"
git push origin main
```

이미 앞 단계 커밋으로 깨끗하면 빈 커밋은 만들지 않는다.

**Step 6: 운영 배포 확인**

- GitHub 배포 완료 후 `https://jung-plant.com/hr.html`을 캐시 무효화 쿼리와 함께 연다.
- 운영 화면에서 로컬과 동일한 버전인지 확인한다.
- 실제 데이터는 삭제하지 않고 읽기·표시를 우선 확인한 뒤, 테스트용 비로그인 명부 한 건으로 저장·재조회하고 즉시 비활성화한다.
- 최종 결과에 테스트 수, DB 전후 행수, 배포 커밋, 남은 미검증 사항을 짧게 보고한다.
