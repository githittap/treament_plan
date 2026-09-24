# 직원허브 직무 분류 통합 구현계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인 설계에 따라 일반 직원의 직무 분류를 네 코드로 정본화하고 관리·근무표·캘린더·계약 화면에서 같은 분류를 표시하되 Dr. 그룹과 기존 권한·일정·계약 스냅샷을 보존함.

**Architecture:** 인증 계정 직원은 `profiles.job_group`, 계정 없는 명부 직원은 `schedule_people.job_group`를 유일한 쓰기 정본으로 사용함. 하나의 화면 변환 함수가 네 코드의 이름·색·정렬과 Dr. 별도 표시를 제공하며, 관리 UI는 재직 일반 직원만 미리보기 후 저장함. DB 변경은 확장형 migration으로 로컬 검증하고 앱 롤백과 데이터 컬럼 제거를 분리함.

**Tech Stack:** `hr.html` 단일 페이지 JavaScript/CSS, Supabase PostgreSQL migration 및 SQL rollback, Node.js `node:test`, PGlite(`@electric-sql/pglite`), 기존 프로젝트의 inline JavaScript 시험 도구.

## Global Constraints

- 직무 코드는 `clinical_consult`, `sterilization_admin`, `lab`, `desk` 네 개와 미지정 `NULL`만 허용함.
- `profiles.role`, 기존 `profiles.dept`, 기존 `schedule_people.department` 및 계정 권한·접근 정책은 변경하지 않음.
- `schedule_people.department='Dr.'`인 명부와 연결 프로필은 backfill, 네 그룹 집계, 변경 선택에서 제외하고 기존 Dr. 별도 표시·관리 경로를 유지함.
- 연결 명부 행은 `profiles.job_group`만, `profile_user_id IS NULL` 일반 명부 행은 `schedule_people.job_group`만 수정함.
- 퇴사 기준은 `employment_status`와 `employment_effective_date`, 비로그인 명부는 `active`; 비재직자는 현재 배치에서만 제외하고 과거 이력은 보존함.
- 저장은 최신값 재확인 후에만 허용하고, 충돌·부분 실패·재조회 실패를 성공으로 표시하지 않음.
- 근무표·캘린더·계약·관리의 분류 이름·색·정렬은 공통 변환표만 사용함. 계약 문구·과거 계약 스냅샷은 그대로 둠.
- 화면은 데스크톱과 640px 이하 모바일에서 가로 스크롤 없이 읽고 조작할 수 있어야 함.
- migration, rollback, PGlite 및 모든 브라우저 스크립트 검증은 로컬에서 수행함. 운영 DB/Storage/Edge/Auth, `main`, 원격 push, 배포는 금지함.

---

## 파일 구조와 책임

- `hr.html`: 직무 상수·공통 화면 모델 변환, 관리 하위 영역, 미리보기/저장, 근무표·캘린더·계약의 공통 표시와 모바일 스타일을 변경함.
- `db/employee_job_groups.sql` (새 파일): 두 nullable 컬럼, 네 코드 제약, 확정 매핑 backfill, Dr. 제외 및 무결성 검사 포함.
- `db/employee_job_groups_rollback.sql` (새 파일): 기본은 앱 롤백용 보존 경로, 무변경 검증을 통과할 때만 컬럼 제거를 허용함.
- `tests/schedule-roster.test.js`: 명부 분류 표시, Dr. 별도 그룹, 재직 필터 회귀를 검증함.
- `tests/schedule-roster-sql.test.js`: SQL 산출물에 컬럼·제약·매핑·Dr. 제외 규칙이 있는지 정적으로 검증함.
- `tests/contract-preview.test.js`: 일반 직원 분류 참고표시, Dr. 제외, 계약 문구·스냅샷 불변을 검증함.
- `tests/sql/pglite-employee-job-groups.mjs` (새 파일): migration, backfill, 제약, 충돌·rollback 안전 조건을 PGlite로 검증함.
- `docs/superpowers/WORKLOG-employee-hub.md`, `docs/superpowers/HANDOFF-employee-hub-2026-09-21.md`, `docs/superpowers/DECISIONS-employee-hub.md`, `overview.md`, `todos.md`: 실제 변경 결과·결정·현재 상태·미완료를 각 파일의 기존 역할에 맞춰 갱신함. 완료 TODO는 지우지 않고 완료 표시함.

## 저장 계약 및 화면 모델

아래 계약을 `hr.html`에 한 번 정의하고 네 화면이 재사용함. `job_group`는 DB에서 `string | null`; 화면 모델은 `kind: 'job' | 'doctor' | 'unassigned'`임.

```js
const EMPLOYEE_JOB_GROUPS = [
  { code: 'clinical_consult', label: '진료·상담', color: '#2563eb', order: 0 },
  { code: 'sterilization_admin', label: '소독·행정', color: '#7c3aed', order: 1 },
  { code: 'lab', label: '기공', color: '#0891b2', order: 2 },
  { code: 'desk', label: '데스크', color: '#059669', order: 3 },
];

function employeeJobGroupModel(person, profileById) {
  const isDoctor = person.department === 'Dr.';
  if (isDoctor) return { kind: 'doctor', code: null, label: 'Dr.', color: null, order: -1 };
  const profile = person.profile_user_id ? profileById.get(person.profile_user_id) : null;
  const code = profile ? profile.job_group : person.job_group;
  const group = EMPLOYEE_JOB_GROUPS.find(item => item.code === code);
  return group
    ? { kind: 'job', ...group }
    : { kind: 'unassigned', code: null, label: '미지정', color: null, order: 4 };
}
```

미리보기 저장 입력은 `[{ personId, profileUserId, oldGroup, newGroup }]`이며 `oldGroup`은 저장 전 서버 분류임. 프로필 직원은 `profiles.id = profileUserId`에 조건부 갱신, 비로그인 인원은 `schedule_people.id = personId`에 조건부 갱신함. 조건부 갱신 행 수가 1이 아니면 충돌로 처리함.

### Task 1: 로컬 migration, backfill, 안전 rollback

**Files:**
- Create: `db/employee_job_groups.sql`
- Create: `db/employee_job_groups_rollback.sql`
- Modify: `tests/schedule-roster-sql.test.js`
- Test: `tests/sql/pglite-employee-job-groups.mjs`

**Interfaces:** migration은 기존 스키마 위에서 `profiles.job_group text NULL` 및 `schedule_people.job_group text NULL`를 추가하고 네 코드 또는 `NULL`만 허용함. rollback SQL은 기본 보존 모드와 컬럼 제거 사전조건을 분리함.

- [ ] **Step 1: PGlite 실패 시험 추가** (3분)

```js
// tests/sql/pglite-employee-job-groups.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  CREATE TABLE profiles (id uuid PRIMARY KEY, dept text, role text, employment_status text, employment_effective_date date);
  CREATE TABLE schedule_people (id uuid PRIMARY KEY, profile_user_id uuid, department text, active boolean);
`);
const migration = await readFile(new URL('../../db/employee_job_groups.sql', import.meta.url), 'utf8');
await db.exec(migration);
const profileCols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='job_group'`);
assert.equal(profileCols.rows.length, 1);
await assert.rejects(db.exec(`INSERT INTO profiles(id,job_group) VALUES ('00000000-0000-0000-0000-000000000001','Dr.')`));
console.log('PASS migration creates constrained nullable job_group columns');
await db.close();
```

- [ ] **Step 2: 실패 확인 명령 실행** (2분)

Run: `node tests/sql/pglite-employee-job-groups.mjs`
Expected: FAIL with `ENOENT` for `db/employee_job_groups.sql`.

- [ ] **Step 3: migration 및 롤백 최소 SQL 작성** (5분)

```sql
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_group text;
ALTER TABLE public.schedule_people ADD COLUMN IF NOT EXISTS job_group text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_job_group_check;
ALTER TABLE public.schedule_people DROP CONSTRAINT IF EXISTS schedule_people_job_group_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_job_group_check
  CHECK (job_group IS NULL OR job_group IN ('clinical_consult','sterilization_admin','lab','desk'));
ALTER TABLE public.schedule_people ADD CONSTRAINT schedule_people_job_group_check
  CHECK (job_group IS NULL OR job_group IN ('clinical_consult','sterilization_admin','lab','desk'));
UPDATE public.profiles p SET job_group = CASE p.dept
  WHEN '진료실' THEN 'clinical_consult' WHEN '데스크' THEN 'desk' WHEN '기공팀' THEN 'lab' ELSE NULL END
WHERE p.job_group IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.schedule_people sp WHERE sp.profile_user_id=p.id AND sp.department='Dr.');
UPDATE public.schedule_people sp SET job_group = CASE sp.department
  WHEN '진료실' THEN 'clinical_consult' WHEN '상담' THEN 'clinical_consult'
  WHEN '행정' THEN 'sterilization_admin' WHEN '기공실' THEN 'lab' WHEN '데스크' THEN 'desk' ELSE NULL END
WHERE sp.profile_user_id IS NULL AND sp.job_group IS NULL AND sp.department <> 'Dr.';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.schedule_people WHERE department='Dr.' AND job_group IS NOT NULL) THEN
    RAISE EXCEPTION 'Dr. rows must have NULL job_group';
  END IF;
END $$;
COMMIT;
```

`profiles` backfill은 `job_group IS NULL`인 행만 처리하고 Dr. 명부 연결 프로필을 제외함. 비로그인 명부도 값이 아직 `NULL`인 행만 backfill해 재실행 시 관리자가 이미 지정한 새 분류를 덮지 않음. 연결된 명부의 `job_group`는 기록하지 않고 읽을 때 프로필 값으로 해석함. rollback 파일은 먼저 컬럼 존재 여부와 `job_group IS NOT NULL` 개수를 검사하며, 값이 있으면 컬럼 제거 대신 명시적인 보존 안내 예외를 내고 중단함. 무변경일 때만 명시적 `DROP COLUMN` 문을 실행하도록 별도 `-- @remove-columns-only-after-local-snapshot-check` 블록으로 격리함. 앱 롤백은 컬럼을 남기는 경로임.

- [ ] **Step 4: migration 시험을 확장** (4분)

PGlite 시험 fixture에 승인 설계의 모든 원본값을 각각 추가함: 프로필 `진료실/데스크/기공팀/기타/NULL`, 연결 명부 `department='미지정'` 및 각 프로필, 비로그인 명부 `진료실/상담/행정/기공실/데스크/미지정/Dr./NULL`. Assert로 정확한 결과 코드, 모든 Dr. 프로필·행 `NULL`, 연결 명부 job_group 미복제, 원본 열 불변을 확인함. 다시 migration을 실행한 뒤 관리자가 넣은 분류값이 보존되는지도 확인함. 허용되지 않은 코드 거부와 네 코드 및 `NULL` 입력 성공도 확인함.

- [ ] **Step 5: SQL 정적 시험 실패 확인** (2분)

Run: `node --test tests/schedule-roster-sql.test.js`
Expected: FAIL until the test asserts both columns, four allowed values, source mapping literals, and the Dr. exclusion predicate in the new migration.

- [ ] **Step 6: SQL 정적 시험 작성 및 통과 확인** (4분)

`tests/schedule-roster-sql.test.js`에서 migration 텍스트를 읽고 `profiles.job_group`, `schedule_people.job_group`, `clinical_consult`, `sterilization_admin`, `lab`, `desk`, `department <> 'Dr.'` 및 기존 원본 컬럼 UPDATE 부재를 각각 assert함. 실행: `node --test tests/schedule-roster-sql.test.js`; 예상: 해당 파일의 모든 subtest PASS.

- [ ] **Step 7: rollback 시험과 migration 시험 통과** (4분)

PGlite에서 신규 컬럼에 값이 없을 때 제거 조건이 성립하고, 한 값이라도 있을 때 rollback guard가 거부함을 확인함. Run: `node tests/sql/pglite-employee-job-groups.mjs`; Expected: `PASS migration creates constrained nullable job_group columns`, `PASS all legacy mappings and Dr. exclusions`, `PASS rollback refuses populated columns` 세 줄.

- [ ] **Step 8: DB 작업 커밋** (2분)

```powershell
git add db/employee_job_groups.sql db/employee_job_groups_rollback.sql tests/schedule-roster-sql.test.js tests/sql/pglite-employee-job-groups.mjs
git commit -m "직원 직무 분류 DB 확장 추가"
```

Expected: 변경 네 파일만 포함한 커밋 생성.

### Task 2: 공통 변환 함수와 기존 명부·Dr. 회귀

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`
- Test: `tests/sql/pglite-employee-job-groups.mjs`

**Interfaces:** `EMPLOYEE_JOB_GROUPS` 및 `employeeJobGroupModel(person, profileById)`는 위 저장 계약 그대로 제공함. 기존 명부의 직원별 그룹 표시는 이 함수 반환값만 소비함.

- [ ] **Step 1: 그룹 변환 회귀 시험 추가** (3분)

`tests/schedule-roster.test.js`에서 페이지 스크립트 내 공통 함수의 source를 추출해 `vm` context에서 평가함. 네 코드의 label/order, 프로필 연결 직원은 프로필 값 우선, 비로그인 직원은 행 값 사용, `department='Dr.'`는 `{kind:'doctor',label:'Dr.'}`, `NULL`·미지정 코드는 `{kind:'unassigned'}`임을 assert함.

- [ ] **Step 2: 실패 확인** (2분)

Run: `node --test tests/schedule-roster.test.js`
Expected: FAIL with `EMPLOYEE_JOB_GROUPS is not defined` 또는 공통 변환 함수 부재.

- [ ] **Step 3: 공통 상수·변환 함수 적용** (5분)

`hr.html`의 직원 공통 함수 구역에 저장 계약에 적힌 상수 배열과 변환 함수를 그대로 추가함. 그룹 색은 CSS에서 같은 상수표의 색을 사용하고 화면마다 별도 색·라벨 맵을 만들지 않음. 직원 자료 로딩 시 연결된 프로필의 `job_group`를 읽고 `profileById` Map으로 전달함. Dr. 행은 이 값을 무시해 항상 기존 별도 그룹으로 반환함.

- [ ] **Step 4: 명부 Dr.·분류 시험 통과** (3분)

Run: `node --test tests/schedule-roster.test.js`; Expected: 네 그룹 변환, 프로필 우선순위, 미지정, Dr. 제외, 기존 Dr. 관리 경로 관련 subtest PASS.

- [ ] **Step 5: 현재 재직 필터 경계 회귀 추가 및 실행** (4분)

`tests/schedule-roster.test.js`에 현재 날짜 기준으로 `employment_effective_date` 이전·당일·이후의 `employment_status !== '재직'` 계정과 `active=false` 명부를 배치함. 현재 그룹 집계에서는 유효일 당일부터 비재직 및 비활성을 제외하고, 과거 일정 렌더 경로는 기존 스냅샷을 유지하는지 assert함. Run: `node --test tests/schedule-roster.test.js`; Expected: PASS.

- [ ] **Step 6: 화면 작업 커밋** (2분)

```powershell
git add hr.html tests/schedule-roster.test.js
git commit -m "직원 분류 공통 화면 모델 추가"
```

Expected: 변경 두 파일만 포함.

### Task 3: 관리자 분류 화면, 미리보기, 조건부 저장

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`
- Test: `tests/sql/pglite-employee-job-groups.mjs`

**Interfaces:** 선택 입력 `[{personId, profileUserId, oldGroup, newGroup}]`; preview 결과 `{beforeCounts, afterCounts, moves, unassignedAfter, canSave}`. 프로필 행은 profile id 및 기존 `job_group` 조건으로 profiles만 갱신하고, 비로그인 행은 schedule_people id 및 기존 `job_group` 조건으로 명부만 갱신함.

- [ ] **Step 1: preview 검증 실패 시험 작성** (4분)

`tests/schedule-roster.test.js`에서 고립된 `buildJobGroupPreview(people, selectedIds, newGroup, today)` 함수로 시험함. 일반 재직 직원 둘을 한 그룹으로 이동한 before/after/moves/미지정 수, 빈 대상, 허용되지 않은 값, 퇴사자, Dr. 선택, 기존값 불일치, 변경 0건에 대해 `canSave:false`를 assert함.

- [ ] **Step 2: 실패 확인** (2분)

Run: `node --test tests/schedule-roster.test.js`; Expected: FAIL with `buildJobGroupPreview is not defined`.

- [ ] **Step 3: preview 순수 함수 작성** (4분)

순수 함수가 재직 일반 직원만 받으며 위 계약의 다섯 필수 조건을 검증하고, 고정 코드 순서에 따른 count 및 이름·이전값·새값 이동 목록을 생성하게 함. 선택 인원 수와 변경 행 수가 다르거나 합계가 대상 인원 수와 다르면 저장을 잠금.

- [ ] **Step 4: preview 시험 통과** (2분)

Run: `node --test tests/schedule-roster.test.js`; Expected: 모든 preview 조건 PASS.

- [ ] **Step 5: 관리 UI 실패 시험 추가** (4분)

`tests/schedule-roster.test.js`에서 관리 UI HTML에 `직무 분류`, `미지정`, `미리보기`, `저장`, 읽기 전용 `Dr.` 안내, aria-label 그룹·대상 선택 필드가 존재하는지 검사함. 모바일 CSS `@media (max-width: 640px)`에서 한 열 레이아웃 규칙도 확인함.

- [ ] **Step 6: 관리 UI 실패 확인** (2분)

Run: `node --test tests/schedule-roster.test.js`; Expected: FAIL at missing `직무 분류` UI assertion.

- [ ] **Step 7: 관리 하위 영역 구현** (5분)

기존 직원 권한 관리 화면 안에 하위 영역을 추가함. 재직 일반 직원 수·네 그룹별 수·미지정 수, 고정 순서 네 카드, 미지정 경고 목록, 읽기 전용 Dr. 명부 안내와 기존 Dr. 관리 경로를 표시함. 직원 행의 계정 권한 필드와 분류를 별도 열·문구로 둠. 그룹 이동 선택은 일반 재직 직원만 허용함.

- [ ] **Step 8: preview 및 저장 대화상자 구현** (5분)

대상 체크, 새 분류 선택, `미리보기` 순서로만 동작하게 함. preview 화면에 현재/변경 후 그룹 수, 이동 대상 이름·이전/새 분류, 변경 인원 수, 저장 후 미지정 수를 표시함. `canSave`가 참일 때에만 저장 활성화. 저장 도중 중복 입력 차단, 성공 후 서버 재조회, 서버 오류/세션 만료/권한 거부/동시 변경/부분 실패를 구분하고 실제 성공이 불명확하면 성공 문구를 표시하지 않음.

- [ ] **Step 9: 조건부 저장 DB 시험 추가** (4분)

PGlite에 프로필 연결 직원과 비로그인 명부 직원을 각각 만든 뒤 profile 대상 변경은 profiles만, 비로그인 대상 변경은 schedule_people만 변경하는 업데이트 쿼리를 실행해 assert함. 기존값이 preview 값과 달라진 후 조건부 UPDATE가 0행을 반환하고 충돌 상태가 됨을 assert함. 일부 성공 후 실패 시 성공·실패 id를 분리하고 재조회로 최종 상태를 결정함.

- [ ] **Step 10: 데스크톱·모바일 규칙 추가 및 시험** (4분)

데스크톱 네 카드 4열/2열, 좁은 폭 640px 이하에서는 1열, 선택 필드 세로 배치, preview 전체 폭, 하단 고정 저장·취소 버튼을 구현함. 긴 이름은 줄바꿈하고 페이지·카드에 가로 overflow가 발생하지 않게 함. 정적 시험에서 breakpoint와 overflow 규칙, preview action bar 고정을 assert함. 예상: `node --test tests/schedule-roster.test.js` PASS.

- [ ] **Step 11: 관리자 기능 커밋** (2분)

```powershell
git add hr.html tests/schedule-roster.test.js tests/sql/pglite-employee-job-groups.mjs
git commit -m "관리자 직무 분류 미리보기 저장 추가"
```

Expected: 변경 세 파일만 포함.

### Task 4: 근무표·캘린더·계약의 공통 표시

**Files:**
- Modify: `hr.html`
- Modify: `tests/schedule-roster.test.js`
- Modify: `tests/contract-preview.test.js`

**Interfaces:** 근무표, 캘린더, 계약 미리보기는 동일한 `employeeJobGroupModel` 반환값을 소비하며 로컬 label/order/color 사전을 선언하지 않음. Dr.는 `kind='doctor'` 분기로 이전 표시를 사용함.

- [ ] **Step 1: 소비 화면 불일치 회귀 시험 추가** (4분)

명부·근무표·캘린더 렌더 source가 공통 변환 함수 결과를 참조하며 옛 `dept`/`department`를 일반 분류 라벨로 직접 렌더하지 않는다는 정적 시험을 `tests/schedule-roster.test.js`에 추가함. Dr. 별도 분기, 기존 개인별 날짜 배치 유지 assertion 포함.

- [ ] **Step 2: 실패 확인** (2분)

Run: `node --test tests/schedule-roster.test.js`; Expected: FAIL on at least one existing direct department label rendering.

- [ ] **Step 3: 근무표·캘린더 표시 전환** (5분)

행·필터·요약의 일반 직원 직무 표지만 공통 모델의 label/color/order로 렌더함. 일정 날짜, 야간 근무, 기존 개별 배치/선택/관리 로직은 그대로 둠. Dr. 행은 기존 Dr. 표시·정렬·배치 경로를 사용함. 일반 분류 `NULL`은 미지정으로 표시하고 Dr. 명부를 미지정 수에 더하지 않음.

- [ ] **Step 4: 근무표·캘린더 시험 통과** (3분)

Run: `node --test tests/schedule-roster.test.js`; Expected: 공통 모델 소비, 네 분류, 미지정, Dr. 별도, 일정 유지 subtests PASS.

- [ ] **Step 5: 계약 preview 회귀 시험 추가** (3분)

`tests/contract-preview.test.js`에 일반 직원 선택 시 현재 분류를 참고 정보로 표시하고 분류가 NULL이면 미지정 안내를 표시하며, Dr. 인원은 분류 라벨 없이 기존 역할을 유지하는 fixture를 추가함. 계약 역할 문구 및 과거 계약 스냅샷 값이 원본과 동일한지 assert함.

- [ ] **Step 6: 실패 확인** (2분)

Run: `node --test tests/contract-preview.test.js`; Expected: FAIL until contract preview renders the shared classification reference.

- [ ] **Step 7: 계약 참고 표시 적용** (4분)

직원 선택 결과에만 공통 모델 label을 참고 문구로 붙임. 계약 역할·수행업무 입력값을 자동 치환하지 않고 기존 template field 및 snapshot 저장 구조를 건드리지 않음. Dr. 역할 표시는 이전 로직 유지.

- [ ] **Step 8: 계약·통합 회귀 시험 통과** (3분)

Run: `node --test tests/contract-preview.test.js tests/schedule-roster.test.js`; Expected: 양 파일 전체 PASS.

- [ ] **Step 9: 표시 통합 커밋** (2분)

```powershell
git add hr.html tests/schedule-roster.test.js tests/contract-preview.test.js
git commit -m "직원 화면의 직무 분류 표시 통합"
```

Expected: 변경 세 파일만 포함.

### Task 5: 전체 검증, rollback 증거, 기존 기록 갱신

**Files:**
- Modify: `docs/superpowers/WORKLOG-employee-hub.md`
- Modify: `docs/superpowers/HANDOFF-employee-hub-2026-09-21.md`
- Modify: `docs/superpowers/DECISIONS-employee-hub.md`
- Modify: `overview.md`
- Modify: `todos.md`
- Test: `tests/sql/pglite-employee-job-groups.mjs`
- Test: `hr.html` inline script compilation

**Interfaces:** 완료 상태·증거는 실제 명령 결과만 기록함. 운영 적용 상태는 계속 “미적용”으로 적음. 완료 TODO는 기존 목록에서 삭제하지 않음.

- [ ] **Step 1: SQL rollback guard 실패·통과 사례 보강** (4분)

PGlite에 분류값이 없는 DB에서 rollback 사전검사 통과, 분류값이 있는 DB에서 컬럼 제거 거부, 원본 dept/department 값 변화 없음, Dr. 행·프로필 보존을 assert함. rollback 스크립트는 테스트 DB에만 실행함.

- [ ] **Step 2: DB 시험 수행** (3분)

Run: `node tests/sql/pglite-employee-job-groups.mjs`; Expected: migration, mappings, Dr. exclusion, constraints, stale-write, rollback guard 관련 모든 출력 `PASS`.

- [ ] **Step 3: 관련 JS 시험 수행** (3분)

Run: `node --test tests/schedule-roster.test.js tests/schedule-roster-sql.test.js tests/contract-preview.test.js`; Expected: 세 파일 전체 `# fail 0`.

- [ ] **Step 4: 전체 JavaScript 시험 수행** (5분)

Run: `node --test --test-isolation=none tests/*.test.js`; Expected: `tests 367 이상`, `fail 0`. 기준 실행에서 확인된 전체 JS test 명령을 사용함. 기존 무관 실패가 있으면 기준 브랜치에서도 재현되는지 확인하고 새 실패와 분리해 기록함.

- [ ] **Step 5: hr.html inline script 구문 검증** (3분)

Run: `node --input-type=module -e "import {readFileSync} from 'node:fs'; import vm from 'node:vm'; const s=readFileSync('hr.html','utf8'); const blocks=[...s.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(x=>x[1]).filter(x=>x.trim()); for (const b of blocks) new vm.Script(b); console.log('PASS inline scripts:',blocks.length);"`
Expected: `PASS inline scripts: N` and no syntax exception.

- [ ] **Step 6: diff 및 보호 범위 점검** (3분)

Run: `git diff --check`; Expected: no output. Run: `git status --short --branch`; inspect every changed path and confirm no `main`, credentials, deployment, remote DB, Storage, Edge, Auth, or generated bundle change exists.

- [ ] **Step 7: 기록 5종 갱신** (5분)

`WORKLOG`에 날짜별 구현 커밋·시험·rollback 결과를 덧붙임. `HANDOFF`의 맨 위 현재 상태를 갱신하고 기존 이력을 보존함. `DECISIONS`에는 승인 설계의 확정 코드·Dr. 예외·정본 규칙과 이전 결정이 있으면 대체 상태·일시·이유를 남김. `overview`는 현재 상태만 짧게 최신화함. `todos`는 승인된 남은 일과 운영 DB/배포 별도 승인 게이트를 구분하고 완료 항목은 완료 표시함.

- [ ] **Step 8: 기록 일치·diff 재확인** (3분)

실제 Git 상태와 시험 결과를 기록 내용과 대조함. `git diff --check` 및 `git status --short` 재실행, 문서·테스트·코드 변경 모두 확인.

- [ ] **Step 9: 검증 커밋** (2분)

```powershell
git add docs/superpowers/WORKLOG-employee-hub.md docs/superpowers/HANDOFF-employee-hub-2026-09-21.md docs/superpowers/DECISIONS-employee-hub.md overview.md todos.md
git commit -m "직원 직무 분류 검증과 인계 기록"
```

Expected: 기존 기록 파일 다섯 개만 포함.

## 최종 자체 점검표

- [ ] 승인 설계 요구가 Task 1~5에 빠짐없이 배정됐는지 확인함: 네 그룹, Dr. backfill·편집 제외/별도 표시 회귀, 미지정·퇴사자·동시 변경·미리보기, PC/mobile, 근무표·캘린더·계약·관리 공통 표시, migration·rollback, PGlite·전체 JS·inline·diff, 기록 갱신.
- [ ] 모든 시험 파일·migration·rollback 파일 경로가 실제 저장 계약과 일치하는지 확인함.
- [ ] 함수명·입출력 필드·그룹 코드가 Task 간 일치하는지 확인함.
- [ ] 구체성이 없는 자리표시 문구, 운영 DB·Storage·Edge·Auth·`main`·push·배포 작업이 없는지 확인함.
