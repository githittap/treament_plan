# 연차캘린더 구현계획

> **For agentic workers:** 승인된 설계서를 `hr.html`과 자동테스트로 구현한다. 모든 구현 단계는 테스트 우선으로 진행한다.

**Goal:** 기존 `leavestatus` 탭의 표시 라벨을 `연차캘린더`로 바꾸고, 승인 연차만 달력·목록으로 역할에 맞게 표시한다.

**Architecture:** `hr.html`의 기존 `renderLeaveStatus()`를 확장하고, 날짜 확장·정렬·역할 라벨은 순수 함수로 분리한다. Supabase 조회는 선택 월과 겹치는 승인 행만 가져오고 날짜별 순번은 브라우저에서 계산한다. 테스트는 `tests/leave-calendar.test.js`에서 HTML의 테스트 경계와 렌더 함수를 VM으로 검증한다.

**Tech Stack:** 단일 HTML, 인라인 Vanilla JS, Supabase client, Node.js `node:test`, `node:vm`.

## Global Constraints

- 표시 라벨은 `연차캘린더`, 내부 `key: 'leavestatus'`는 유지한다.
- 조회 조건은 `status = '승인'`, `date_from <= monthTo`, `date_to >= monthFrom`이다.
- 날짜별 정렬은 `created_at` 오름차순, 동률은 `id` 오름차순이다.
- 비원장은 순번·이름과 목록의 기간·일수만 보고, 원장만 `created_at`, `owner_at`, `type`, `type_note`를 본다.
- 다일 연차는 선택 월 안의 각 날짜에 확장하고 각 날짜에서 순번을 다시 계산한다.
- 조회 오류는 오류 화면으로 표시하고 정상 0건만 빈 상태로 표시한다.
- 제품 코드는 `hr.html`만 변경한다. 자동테스트는 기존 테스트 파일 또는 `tests/leave-calendar.test.js`만 허용한다.
- DB·SQL·RLS·Edge Function·배포·push는 변경하지 않는다.

## Task 1: 구현계획과 테스트 경계 준비

**Files:**

- Create: `docs/superpowers/plans/2026-09-19-leave-calendar.md`
- Create: `tests/leave-calendar.test.js`

- [x] **Step 1: 기존 구조를 확인한다**

```powershell
rg -n "renderLeaveStatus|연차현황|schedule-roster:test-start|node:test" hr.html tests docs/superpowers/specs/2026-09-19-leave-calendar-design.md
```

기대결과: 기존 렌더 함수와 VM 기반 테스트 경계가 확인된다.

- [x] **Step 2: 계획을 자체검토한다**

```powershell
git diff --check
rg -n "TODO|TBD|placeholder|미정|추후|나중에" docs/superpowers/plans/2026-09-19-leave-calendar.md
```

기대결과: 문서 검사 성공 및 placeholder 검색 결과 없음.

- [x] **Step 3: 계획을 한국어 커밋한다**

```powershell
git add -- docs/superpowers/plans/2026-09-19-leave-calendar.md
git commit -m "연차캘린더 구현계획 작성"
```

기대결과: 계획 파일만 포함된 커밋이 생성된다.

## Task 2: 테스트를 먼저 작성하고 RED 확인

**Files:**

- Create: `tests/leave-calendar.test.js`

**Test boundary:** 이후 `hr.html`에 `/* leave-calendar:test-start */`와 `/* leave-calendar:test-end */`를 추가한다.

- [ ] **Step 1: 날짜 확장·정렬·역할 라벨 테스트를 작성한다**

다음 동작을 테스트한다.

```js
test('승인 연차는 다일 날짜마다 created_at 후 id 순서와 순번을 만든다', () => {
  const index = context.buildLeaveCalendarIndex(rows, '2026-09-01', '2026-09-30');
  assert.deepEqual(index['2026-09-11'].map(item => [item.rank, item.row.id]), [[1, 5], [2, 9]]);
  assert.deepEqual(index['2026-09-12'].map(item => [item.rank, item.row.id]), [[1, 5]]);
});

test('월 경계 연차는 선택 월 안에서만 확장한다', () => {
  const index = context.buildLeaveCalendarIndex(rows, '2026-09-01', '2026-09-30');
  assert.ok(index['2026-09-01']);
  assert.ok(index['2026-09-30']);
  assert.equal(index['2026-08-31'], undefined);
});

test('비원장은 순번과 이름만, 원장은 상세를 표시한다', () => {
  assert.equal(context.leaveCalendarLabel(item, 'staff'), '① 홍길동');
  assert.match(context.leaveCalendarLabel(item, 'owner'), /① 홍길동/);
  assert.match(context.leaveCalendarLabel(item, 'owner'), /연차/);
});
```

또한 탭 라벨 테스트를 작성한다.

```js
test('탭은 연차캘린더 라벨과 leavestatus 키를 유지한다', () => {
  assert.match(html, /\{key:'leavestatus',label:'연차캘린더'/);
});
```

- [ ] **Step 2: 단독 실행으로 RED를 확인한다**

```powershell
node --test tests/leave-calendar.test.js
```

기대결과: 테스트 경계 또는 함수가 없어 기능 부재를 원인으로 실패한다. 문법 오류가 아니라는 것을 확인한다.

## Task 3: 순수 함수와 조회 계약을 최소 구현해 GREEN 만들기

**Files:**

- Modify: `hr.html`의 연차현황 코드 블록과 `TABS`
- Test: `tests/leave-calendar.test.js`

- [ ] **Step 1: 테스트 경계와 순수 함수를 추가한다**

```js
/* leave-calendar:test-start */
function compareLeaveRowsByCreatedAtThenId(a, b) { /* null은 마지막, 동률 id */ }
function buildLeaveCalendarIndex(rows, monthFrom, monthTo) { /* clamp 후 날짜별 rank */ }
function leaveCalendarLabel(item, role) { /* 비원장 순번·이름, owner 상세 */ }
/* leave-calendar:test-end */
```

날짜 계산은 기존 `addDays`와 `YYYY-MM-DD` 규칙을 사용하고 새 DB 필드는 만들지 않는다.

- [ ] **Step 2: 순수 함수 GREEN을 확인한다**

```powershell
node --test tests/leave-calendar.test.js
```

기대결과: 날짜 확장, 월 경계, 동률 정렬, 역할 라벨 테스트가 PASS한다.

- [ ] **Step 3: 승인·월경계 조회를 구현한다**

```js
sb.from('leave_requests')
  .select('id,user_id,type,type_note,date_from,date_to,days,status,owner_at,created_at')
  .eq('status','승인')
  .lte('date_from', monthTo)
  .gte('date_to', monthFrom)
```

조회 오류는 즉시 오류 카드로 반환하고 성공한 빈 배열만 빈 상태로 렌더링한다.

- [ ] **Step 4: 조회 계약 GREEN을 확인한다**

```powershell
node --test tests/leave-calendar.test.js
```

기대결과: 승인 필터, 양방향 월 겹침, 오류 분기 테스트가 PASS한다.

## Task 4: 달력·목록 전환과 역할별 렌더링

**Files:**

- Modify: `hr.html`의 `TABS` 및 `renderLeaveStatus()`
- Test: `tests/leave-calendar.test.js`

- [ ] **Step 1: 렌더링 RED 테스트를 추가한다**

Supabase builder harness로 다음을 검증한다.

- staff/manager/chief 결과에는 `created_at`, `owner_at`, `type`, `type_note`가 없다.
- owner 결과에는 신청 시각·승인 시각·종류가 있다.
- 달력·목록 전환 컨트롤과 목록의 이름·기간·일수가 있다.
- 조회 오류는 오류 문구를 표시하고 빈 상태 문구를 표시하지 않는다.

```powershell
node --test tests/leave-calendar.test.js
```

기대결과: 기존 렌더링이 전체 상태와 비원장 종류를 출력하므로 새 테스트가 RED다.

- [ ] **Step 2: 탭 라벨과 화면 상태를 구현한다**

`key:'leavestatus'`는 유지하고 `label:'연차캘린더'`만 변경한다. `LVSTATUS_MONTH`는 오늘의 `YYYY-MM`, `LVSTATUS_VIEW`는 `calendar`로 초기화한다. 보기 버튼은 화면 상태만 바꾸고 `render()`를 호출한다.

- [ ] **Step 3: 달력과 목록을 구현한다**

승인 행만 `buildLeaveCalendarIndex()`에 넘긴다. 달력은 날짜별 순번·이름을 표시하고 owner만 상세 시각·종류를 표시한다. 목록은 기간·일수를 유지하고 owner만 종류·시각 열을 추가한다.

- [ ] **Step 4: GREEN을 확인한다**

```powershell
node --test tests/leave-calendar.test.js
```

기대결과: 연차캘린더 자동테스트 전체 PASS.

## Task 5: 전체 검증과 논리 단위 커밋

**Files:**

- Verify: `hr.html`, `tests/leave-calendar.test.js`, `docs/superpowers/plans/2026-09-19-leave-calendar.md`

- [ ] **Step 1: 새 테스트와 전체 테스트를 실행한다**

```powershell
node --test tests/leave-calendar.test.js
node --test tests/*.test.js
```

기대결과: 새 테스트와 기존 테스트 모두 PASS한다.

- [ ] **Step 2: 인라인 script 두 블록을 구문검사한다**

```powershell
node -e "const fs=require('fs'),vm=require('vm'); const h=fs.readFileSync('hr.html','utf8'); const b=[...h.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(s=>s.trim()); if(b.length!==2) throw new Error('inline script block count: '+b.length); for(const s of b) new vm.Script(s); console.log('INLINE_SCRIPT_SYNTAX=PASS');"
```

기대결과: `INLINE_SCRIPT_SYNTAX=PASS`.

- [ ] **Step 3: 변경 범위와 요구사항을 확인한다**

```powershell
git diff --check
git status --short
git diff -- hr.html tests/leave-calendar.test.js docs/superpowers/plans/2026-09-19-leave-calendar.md
```

기대결과: 제품 코드는 `hr.html`, 자동테스트는 허용된 테스트 파일, 계획 파일만 변경되고 DB·SQL·RLS·배포 파일은 없다.

- [ ] **Step 4: 논리 단위별 한국어 커밋을 남긴다**

```powershell
git add -- tests/leave-calendar.test.js
git commit -m "연차캘린더 자동테스트 추가"
git add -- hr.html tests/leave-calendar.test.js
git commit -m "연차캘린더 달력과 목록 구현"
```

기대결과: 테스트 커밋과 구현 커밋이 분리되고 push는 실행하지 않는다.

## Self-Review Checklist

- [ ] 설계서의 승인 필터, 월 경계, 다일 확장, 정렬 동률, 역할 표시, 오류 구분을 각각 테스트로 연결했다.
- [ ] `key:'leavestatus'`는 유지하고 표시 라벨만 `연차캘린더`로 바꿨다.
- [ ] 비원장 HTML에는 `created_at`, `owner_at`, `type`, `type_note`가 출력되지 않는다.
- [ ] 정상 0건과 조회 실패가 서로 다른 화면 상태다.
- [ ] 자동테스트 RED를 구현 전에 확인했다.
- [ ] 전체 테스트, 인라인 script 구문검사, `git diff --check`를 실행했다.
- [ ] DB·SQL·RLS·Edge Function·다른 제품 코드·배포·push를 변경하지 않았다.
