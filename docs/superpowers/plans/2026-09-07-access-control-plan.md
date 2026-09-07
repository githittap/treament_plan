# 접근제어 개편 구현 계획 (로그인 승인제 + 비밀 진료기록)

> **실행 방식**: 이 프로젝트는 `superpowers:subagent-driven-development`/`executing-plans`가 아니라 **codex exec 위임 + Claude 검수**로 구현한다(CLAUDE.md 고정 규칙). 이 문서는 codex에게 넘길 정확한 사양이자, Claude가 결과를 검수할 체크리스트다.
> 스펙 원본: `docs/superpowers/specs/2026-09-06-access-control-design.md`

**목표**: (A) 신규 직원 가입을 원장 승인 후에만 데이터 접근 가능하게 하고, (B) 원장이 지정한 소수만 열람하는 "비밀 진료기록" 탭을 hr.html에 신설한다.

**아키텍처**: DB 쪽은 `profiles.approved` 컬럼 1개 + `my_role()` 함수 1곳 수정(A), 신규 표 2개(B)로 최소화한다. 프론트는 `hr.html` 한 파일만 수정한다(`ortho.html`·기공차트는 RLS로만 간접 방어, 코드 변경 없음).

**Tech Stack**: Vanilla JS, Supabase JS v2, Postgres RLS. 새 라이브러리 없음.

## Global Constraints (스펙에서 그대로)
- `ortho_cases`/`ortho.html`/기공차트 코드는 건드리지 않는다.
- 개인정보(환자명·차트번호) 마스킹·경고 없이 그대로 저장(기존 방침).
- 비밀 진료기록 탭은 명단에 없으면 렌더링 자체를 생략한다(존재 노출 금지).
- 기존 25개 계정은 전부 `approved=true`로 일괄 처리, 재검토 없음.
- git commit·push는 codex가 하지 않는다(Claude가 검수 후 처리).

---

## Task 1: DB — 승인 게이트 (`db/access_approval.sql`)

**Files**
- Create: `db/access_approval.sql`

**현재 상태(실측 완료, 그대로 인용)**

`profiles` 컬럼: `user_id uuid not null`, `name text not null`, `role text not null default 'staff'`, `dept text`, `hire_date date`, `fp_id text`, `contract_hours jsonb not null default '{}'`, `stamp text`, `active boolean not null default true`, `created_at timestamptz default now()`. `approved` 컬럼 없음.

`my_role()` 원본(정확히 이 텍스트):
```sql
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select p.role
      from public.profiles as p
      where p.user_id = auth.uid()
    ),
    'staff'
  );
$function$
```

- [ ] **Step 1: 컬럼 추가 + 1회성 백필**

```sql
alter table public.profiles add column if not exists approved boolean not null default false;

-- 1회성: 기존 전원(약 25명, owner 포함) 일괄 승인. 이 UPDATE는 배포 직후 1번만 실행하는 것이 목적 —
-- 나중에 이 파일을 다시 통째로 실행하면 그 시점의 미승인자도 함께 승인돼버리니 주의(재실행 시 이 문장은 빼고 실행).
update public.profiles set approved = true;
```

- [ ] **Step 2: `my_role()`을 승인 게이트를 포함하도록 교체**

```sql
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when exists (
      select 1 from public.profiles as p
      where p.user_id = auth.uid() and p.approved = false
    ) then 'pending'
    else coalesce(
      (select p.role from public.profiles as p where p.user_id = auth.uid()),
      'staff'
    )
  end;
$function$;
```

`my_role()`을 참조하는 정책들(hr의 role-gated 표 대부분, `confidential_*`)은 이 수정만으로 미승인자를 자동 차단한다. **그러나 실측 결과, 환자·기공 데이터 표는 `using(true)`라 `my_role()`을 참조하지 않아 자동 차단이 안 된다** — 미승인자가 hr.html(프론트 게이트로 막힘)이 아니라 `ortho.html`·기공차트를 직접 열면 그대로 읽힌다. 스펙의 "ortho/기공은 RLS로 방어" 전제를 실제로 충족시키려면 아래 Step 3에서 이 표들의 open 정책을 조여야 한다.

- [ ] **Step 3: 환자·기공 데이터 표의 `using(true)` 정책을 미승인자 제외로 교체**

아래 6개 표의 select/insert(및 ortho_cases update) 정책만 `true` → `(my_role() <> 'pending')`로 바꾼다. 나머지 hr 운영 표(notices·schedules·att_months·holidays·onboarding_items·notice_reads 등)는 (a) 민감도 낮고 (b) hr.html 프론트 게이트로만 접근되므로 이번엔 그대로 두고, 필요 시 후속 하드닝으로 남긴다. `profiles_select_authenticated`와 `app_settings_select_all`은 앱 부팅·승인상태 감지에 필요하므로 **건드리지 않는다**(미승인자가 직원 명단·설정을 읽는 건 환자정보 노출에 비해 사소, 게이트 감지가 더 중요).

```sql
-- ortho_cases
drop policy if exists ortho_cases_authenticated_select on public.ortho_cases;
create policy ortho_cases_authenticated_select on public.ortho_cases for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_cases_authenticated_insert on public.ortho_cases;
create policy ortho_cases_authenticated_insert on public.ortho_cases for insert to authenticated with check (my_role() <> 'pending');
drop policy if exists ortho_cases_authenticated_update on public.ortho_cases;
create policy ortho_cases_authenticated_update on public.ortho_cases for update to authenticated using (my_role() <> 'pending') with check (my_role() <> 'pending');
-- ortho_events
drop policy if exists ortho_events_authenticated_select on public.ortho_events;
create policy ortho_events_authenticated_select on public.ortho_events for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_events_authenticated_insert on public.ortho_events;
create policy ortho_events_authenticated_insert on public.ortho_events for insert to authenticated with check (my_role() <> 'pending');
-- ortho_visits
drop policy if exists ortho_visits_authenticated_select on public.ortho_visits;
create policy ortho_visits_authenticated_select on public.ortho_visits for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_visits_authenticated_insert on public.ortho_visits;
create policy ortho_visits_authenticated_insert on public.ortho_visits for insert to authenticated with check (my_role() <> 'pending');
-- ortho_rescans
drop policy if exists ortho_rescans_authenticated_select on public.ortho_rescans;
create policy ortho_rescans_authenticated_select on public.ortho_rescans for select to authenticated using (my_role() <> 'pending');
drop policy if exists ortho_rescans_authenticated_insert on public.ortho_rescans;
create policy ortho_rescans_authenticated_insert on public.ortho_rescans for insert to authenticated with check (my_role() <> 'pending');
-- ledger (기공차트)
drop policy if exists "read" on public.ledger;
create policy "read" on public.ledger for select to authenticated using (my_role() <> 'pending');
drop policy if exists "insert" on public.ledger;
create policy "insert" on public.ledger for insert to authenticated with check (my_role() <> 'pending');
-- ledger_files
drop policy if exists ledger_files_select_authenticated on public.ledger_files;
create policy ledger_files_select_authenticated on public.ledger_files for select to authenticated using (my_role() <> 'pending');
drop policy if exists ledger_files_insert_authenticated on public.ledger_files;
create policy ledger_files_insert_authenticated on public.ledger_files for insert to authenticated with check (my_role() <> 'pending');
```

주의: 위 정책들의 기존 이름·정의는 실측(pg_policies)에서 그대로 가져온 것이다. `ledger`의 정책명은 `"read"`/`"insert"`(따옴표 필요). `same_day`/`today` 같은 날짜-가드 update/delete 정책은 미승인자가 애초에 insert를 못 해 자기 행이 없으므로 손대지 않는다.

이 한 함수 수정(Step 2) + 6개 표 정책(Step 3)으로, 미승인자는 hr.html에서는 프론트 게이트로, 교정보드·기공차트에서는 DB RLS로 이중 차단된다.

**검증**
- `select proname, prosrc from pg_proc where proname='my_role';`로 함수 본문이 바뀐 것을 확인.
- `select approved, count(*) from profiles group by 1;`로 기존 전원 `approved=true` 확인.
- 신규 테스트 계정(가입만 하고 미승인 상태로 둔 것)으로 `select my_role();`을 실행하면 `'pending'`이 나오는지 확인(원장 계정으로 `set local role authenticated; set request.jwt.claim.sub = '<신규계정 uuid>';` 류로 시뮬레이션하거나, 실제 신규가입 계정으로 직접 로그인해 확인).
- Step 3 확인: 미승인 계정으로 `ortho.html`을 직접 열어 로그인 → 케이스가 0건으로 보이는지(select 차단), `pg_policies`에서 6개 표 정책 qual/with_check가 `(my_role() <> 'pending')`로 바뀐 것 확인. 승인된 계정에선 종전대로 전부 보이는지(회귀 없음) 확인.

---

## Task 2: hr.html — 승인 대기 게이트 (로그인 직후)

**Files**
- Modify: `hr.html:96-119` (`#gate` 근처에 새 대기화면 블록 추가)
- Modify: `hr.html:216` (`ME` 객체에 `approved` 필드 추가)
- Modify: `hr.html:760-778` (`onAuthed()` 함수)

**Interfaces**
- 소비: `profiles.approved`(Task 1에서 추가된 컬럼), 기존 `PROFILES`/`loadProfiles()`/`ME` 전역.
- 생성: 이후 Task 3·5·6이 `ME.approved`를 참조할 수 있다.

- [ ] **Step 1: HTML — 승인 대기 화면 추가**

`#gate` div(96번 줄) 바로 아래에, `#app`(120번 줄) 시작 전에 새 블록을 추가:

```html
<div id="pendingGate" style="display:none;position:fixed;inset:0;background:var(--bg,#0d1715);display:none;align-items:center;justify-content:center;z-index:99">
  <div style="max-width:360px;text-align:center;padding:24px">
    <div style="font-size:30px">⏳</div>
    <h1 style="font-size:19px;margin:6px 0 8px">승인 대기 중입니다</h1>
    <p style="font-size:13px;color:var(--gray,#8fa5a0)">가입 확인 후 원장님이 승인하면 자동으로 사용할 수 있습니다. 승인되면 새로고침해 주세요.</p>
    <button class="hbtn" style="margin-top:14px" onclick="location.reload()">새로고침</button>
    <button class="hbtn" style="margin-top:8px" onclick="sb.auth.signOut().then(()=>location.reload())">로그아웃</button>
  </div>
</div>
```

기존 CSS 변수(`--bg`/`--gray`/`.hbtn`)를 이미 쓰고 있으면(파일 상단 `:root` 확인) 인라인 fallback 값은 생략해도 된다 — 기존 `.gate`/`.box` 클래스 스타일을 그대로 재사용하는 형태로 만들어도 무방(코드 스타일에 맞춰 codex가 판단).

- [ ] **Step 2: `ME` 객체에 `approved` 필드 추가**

```js
let ME={id:'',email:'',name:'',role:'staff',approved:true}, PROFILES=[], TAB='home', xlRows=[];
```

- [ ] **Step 3: `onAuthed()`에 승인 체크 삽입**

`ME.name=p?p.name:ME.email.split('@')[0];ME.role=p?p.role:'staff';ME.stamp=p?p.stamp:null;` 줄 바로 다음에 삽입:

```js
ME.approved=p?p.approved!==false:true; // 프로필 없으면(이론상 발생 안 함) 통과
if(!ME.approved){$('#app').style.display='none';$('#pendingGate').style.display='flex';return;}
```

`renderNav();await render();await refreshBadges();` 등 이후 로직은 이 `return` 때문에 미승인자에게는 실행되지 않는다 — 정상 화면 렌더링을 아예 스킵.

**검증**
- 신규 테스트 계정으로 가입 → 로그인 → "승인 대기 중입니다" 화면만 보이고 nav/data 요청이 안 나가는지(Network 탭에서 `attendance`/`deposits` 등 호출이 없어야 함) 확인.
- 기존 계정(approved=true) 로그인 → 평소와 동일하게 정상 진입 확인(회귀 없음).

---

## Task 3: hr.html — 원장 탭에 "가입 승인 대기" 목록 추가

**Files**
- Modify: `hr.html:741-754` (`renderOwner()`)
- Modify: `hr.html:755-756` 부근 (새 함수 `approveProfile` 추가)

**Interfaces**
- 소비: `PROFILES`(이미 `select('*')`라 `approved` 컬럼 자동 포함), `setRole()`과 동일한 패턴.
- 생성: `approveProfile(uid)` — Task 없음, 여기서 끝나는 리프 함수.

- [ ] **Step 1: `renderOwner()` 안에 승인 대기 섹션 추가**

`renderOwner()`의 `<h3>직원 권한 관리...` 섹션 **앞**에 삽입:

```js
function renderOwner(m){
  const pending=PROFILES.filter(p=>p.approved===false);
  m.innerHTML=`<div class="card"><h2>🔑 원장 전용</h2>
    <div class="rowflex">
      <div class="stat"><div class="sub">직원 명부</div><div>${PROFILES.length}명 · owner ${PROFILES.filter(p=>p.role==='owner').length}·chief ${PROFILES.filter(p=>p.role==='chief').length}·manager ${PROFILES.filter(p=>p.role==='manager').length}·staff ${PROFILES.filter(p=>p.role==='staff').length}</div></div>
    </div>
    ${pending.length?`<h3>🆕 가입 승인 대기 (${pending.length}명)</h3>
    <div class="tblwrap"><table><tr><th>이름</th><th>이메일</th><th>가입일</th><th></th></tr>
    ${pending.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.dept||'')}</td><td>${p.created_at?md(p.created_at):''}</td>
      <td><button class="mini stamp" onclick="approveProfile('${p.user_id}')">승인</button></td></tr>`).join('')}</table></div>`:''}
    <h3>직원 권한 관리 <span class="sub">(입퇴사·승진 시 여기서 변경)</span></h3>
    ...
```

(`...` 이하는 기존 코드 그대로 유지 — 여기부터는 기존 `renderOwner()` 본문을 그대로 이어붙인다. 위 예시는 삽입 지점을 보여주는 것이지 전체 치환이 아니다.)

`profiles` 테이블에 이메일 컬럼이 없으므로(`name`/`dept`만 존재), 이메일 대신 `dept`(부서)를 보여주거나 비워도 된다 — codex가 실제 화면에서 자연스러운 쪽으로 채운다.

- [ ] **Step 2: `approveProfile()` 함수 추가**

`setRole()` 함수 바로 아래에 추가:

```js
async function approveProfile(uid){
  await sb.from('profiles').update({approved:true}).eq('user_id',uid);
  await loadProfiles();setStatus('saved');render();
}
```

**검증**
- 원장 계정으로 "원장" 탭 진입 → 승인 대기 중인 신규 계정이 목록에 뜨는지 확인.
- [승인] 클릭 → 목록에서 사라지고, 해당 계정으로 새로고침하면 정상 진입되는지 확인(Task 2와 연결 검증).

---

## Task 4: DB — 비밀 진료기록 표 2개 (`db/confidential_records.sql`)

**Files**
- Create: `db/confidential_records.sql`

- [ ] **Step 1: 표 생성**

```sql
create table if not exists public.confidential_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.confidential_records (
  id bigint generated always as identity primary key,
  patient_name text not null,
  chart_no text,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: RLS**

```sql
alter table public.confidential_access enable row level security;
alter table public.confidential_records enable row level security;

drop policy if exists confidential_access_select on public.confidential_access;
create policy confidential_access_select on public.confidential_access
  for select to authenticated
  using (my_role() = 'owner' or user_id = auth.uid());

drop policy if exists confidential_access_owner_write on public.confidential_access;
create policy confidential_access_owner_write on public.confidential_access
  for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');

drop policy if exists confidential_records_select on public.confidential_records;
create policy confidential_records_select on public.confidential_records
  for select to authenticated
  using (my_role() = 'owner' or exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid()));

drop policy if exists confidential_records_insert on public.confidential_records;
create policy confidential_records_insert on public.confidential_records
  for insert to authenticated
  with check (my_role() = 'owner' or exists (select 1 from public.confidential_access ca where ca.user_id = auth.uid()));
```

(`confidential_access_select`에 `user_id = auth.uid()`를 포함한 이유: 본인이 명단에 있는지 클라이언트가 스스로 확인해서 탭을 보여줄지 판단해야 하므로, 최소한 자기 자신의 행은 조회할 수 있어야 한다 — owner 전체 목록 조회는 owner만.)

**검증**
- `select tablename,policyname,cmd,qual,with_check from pg_policies where tablename in ('confidential_access','confidential_records');`로 4개 정책 확인.
- owner 계정으로 `confidential_access`에 자기 자신 또는 테스트 계정 삽입 → 그 계정으로 로그인해 `confidential_records` select/insert가 되는지, 명단 밖 계정은 둘 다 막히는지 확인.

---

## Task 5: hr.html — "비밀 진료기록" 탭

**Files**
- Modify: `hr.html:236-246` (`TABS` 배열)
- Modify: `hr.html:250-256` (`renderNav()`/`go()` — 탭 노출 조건에 `ME.confidAccess` 반영)
- Modify: `hr.html:286-...` (`render()` 디스패처에 분기 추가)
- Modify: `hr.html:760-778` (`onAuthed()` — `ME.confidAccess` 로드)
- 신규 함수: `renderConfid(m)`, `submitConfidRecord()`

**Interfaces**
- 소비: Task 2에서 확장된 `onAuthed()`, `ME` 전역, 기존 `esc()`/`md()`/`setStatus()` 유틸.
- 생성: 없음(리프 UI).

- [ ] **Step 1: `TABS`에 항목 추가**

```js
const TABS=[
  {key:'home',  label:'홈',        roles:['staff','manager','chief','owner']},
  {key:'att',   label:'출퇴근',    roles:['staff','manager','chief','owner']},
  {key:'deposit',label:'입금',     roles:['staff','manager','chief','owner']},
  {key:'sched', label:'근무표',    roles:['staff','manager','chief','owner']},
  {key:'leave', label:'연차',      roles:['staff','manager','chief','owner']},
  {key:'appr',  label:'결재함',    roles:['staff','manager','chief','owner']},
  {key:'notice',label:'공지',      roles:['staff','manager','chief','owner']},
  {key:'onbo',  label:'입사서류',  roles:['staff','manager','chief','owner']},
  {key:'confid',label:'비밀 진료기록',roles:['staff','manager','chief','owner'],needsConfid:true},
  {key:'owner', label:'원장',      roles:['owner']},
];
```

- [ ] **Step 2: `renderNav()`에서 `needsConfid` 탭은 `ME.confidAccess`일 때만 노출**

```js
function renderNav(){
  $('#nav').innerHTML=TABS.filter(t=>t.roles.includes(ME.role)&&(!t.needsConfid||ME.confidAccess)).map(t=>{
    const c=BADGE[t.key]?`<span class="cnt">${BADGE[t.key]}</span>`:'';
    return `<button class="${t.key===TAB?'on':''}" onclick="go('${t.key}')">${t.label}${c}</button>`;
  }).join('');
}
```

- [ ] **Step 3: `render()` 디스패처에 분기 추가**

`else if(TAB==='onbo')await renderOnbo(m);` 다음에:

```js
else if(TAB==='confid')await renderConfid(m);
```

- [ ] **Step 4: `onAuthed()`에 `ME.confidAccess` 로드**

Task 2에서 넣은 승인 체크 다음, `renderNav();await render();...` 전에 추가:

```js
try{
  const {data:ca}=await sb.from('confidential_access').select('user_id').eq('user_id',ME.id).maybeSingle();
  ME.confidAccess=!!ca||ME.role==='owner';
}catch(e){ME.confidAccess=false;} // 조회 실패 시 fail closed — 탭을 숨기는 쪽으로
```

- [ ] **Step 5: `renderConfid()` 구현**

```js
async function renderConfid(m){
  const {data,error}=await sb.from('confidential_records').select('*').order('created_at',{ascending:false});
  if(error){m.innerHTML='<div class="empty">불러오기 오류</div>';return;}
  m.innerHTML=`<div class="card"><h2>🔒 비밀 진료기록</h2>
    <input id="cfQ" placeholder="환자명·차트번호 검색" style="margin-bottom:8px" oninput="filterConfid()">
    <div id="cfList"></div></div>
    <div class="card"><h3>➕ 기록 추가</h3>
    <input id="cfName" placeholder="환자명 *"> <input id="cfChart" placeholder="차트번호(선택)">
    <textarea id="cfBody" placeholder="내용" style="width:100%;min-height:80px;margin-top:6px"></textarea>
    <button class="hbtn pri" style="margin-top:6px" onclick="submitConfidRecord()">저장</button>
    <div id="cfMsg" class="sub" style="color:var(--red,#ff7b76)"></div></div>`;
  window._cfRecords=data||[];
  filterConfid();
}
function filterConfid(){
  const q=($('#cfQ')?.value||'').trim().toLowerCase();
  const list=(window._cfRecords||[]).filter(r=>!q||String(r.patient_name||'').toLowerCase().includes(q)||String(r.chart_no||'').toLowerCase().includes(q));
  $('#cfList').innerHTML=list.length?list.map(r=>`<div style="padding:8px 0;border-bottom:1px dashed var(--line,#24332f)">
    <b>${esc(r.patient_name)}</b> ${r.chart_no?`<span class="sub">${esc(r.chart_no)}</span>`:''} <span class="sub">${md(r.created_at)} · ${esc(r.author||'')}</span>
    <div style="margin-top:4px;white-space:pre-wrap">${esc(r.body)}</div></div>`).join(''):'<div class="empty">기록 없음</div>';
}
async function submitConfidRecord(){
  const patient_name=$('#cfName').value.trim(),body=$('#cfBody').value.trim();
  if(!patient_name||!body){$('#cfMsg').textContent='환자명과 내용은 필수입니다.';return;}
  const {error}=await sb.from('confidential_records').insert({patient_name,chart_no:$('#cfChart').value.trim()||null,body,author:ME.name});
  if(error){$('#cfMsg').textContent='저장 실패: '+error.message;return;}
  $('#cfName').value='';$('#cfChart').value='';$('#cfBody').value='';$('#cfMsg').textContent='';
  renderConfid($('#main'));setStatus('saved');
}
```

**검증**
- 접근 명단에 없는 계정 로그인 → 네비게이션에 "비밀 진료기록" 탭 자체가 안 보이는지 확인(DOM에 버튼이 렌더링되지 않아야 함, `display:none` 아님).
- 명단에 있는 계정 → 탭 보임, 목록/검색/작성 정상 동작 확인.
- owner 계정 → 명단에 없어도(Task 6에서 자기 자신을 명단에 안 넣었어도) `my_role()==='owner'` 조건으로 탭이 보이고 데이터도 보이는지 확인.

---

## Task 6: hr.html — 원장 탭에 "비밀 진료기록 접근 명단" 관리 추가

**Files**
- Modify: `hr.html:741-754` (`renderOwner()`, Task 3 섹션 뒤에 이어 추가)

**Interfaces**
- 소비: Task 3에서 이미 확장된 `renderOwner()`, `PROFILES`.
- 생성: `grantConfid(uid)`, `revokeConfid(uid)`.

- [ ] **Step 1: `renderOwner()`에 명단 관리 섹션 추가 (직원 권한 관리 표 다음)**

```js
async function renderOwner(m){
  const pending=PROFILES.filter(p=>p.approved===false);
  const {data:accessRows}=await sb.from('confidential_access').select('user_id');
  const accessSet=new Set((accessRows||[]).map(r=>r.user_id));
  m.innerHTML=`... (기존 + Task 3 내용 그대로) ...
    <h3>🔒 비밀 진료기록 접근 명단</h3>
    <div class="tblwrap"><table><tr><th>이름</th><th>권한</th><th>접근</th><th></th></tr>
    ${PROFILES.filter(p=>p.approved!==false).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.role}</td>
      <td>${accessSet.has(p.user_id)?'✅':'—'}</td>
      <td>${accessSet.has(p.user_id)
        ?`<button class="mini rej" onclick="revokeConfid('${p.user_id}')">제거</button>`
        :`<button class="mini" onclick="grantConfid('${p.user_id}')">추가</button>`}</td></tr>`).join('')}</table></div>
  </div>...`;
}
```

`renderOwner`가 이제 `await`를 쓰므로, `render()` 디스패처에서 호출하는 부분(`renderOwner(m)`)도 `await renderOwner(m)`으로 바뀌어야 한다 — 기존 `else if(TAB==='owner')` 줄 확인 후 필요하면 `await` 추가.

- [ ] **Step 2: `grantConfid`/`revokeConfid` 함수**

```js
async function grantConfid(uid){await sb.from('confidential_access').insert({user_id:uid});setStatus('saved');render();}
async function revokeConfid(uid){await sb.from('confidential_access').delete().eq('user_id',uid);setStatus('saved');render();}
```

**검증**
- 원장이 특정 직원에게 [추가] 클릭 → 그 직원 계정으로 로그인(또는 새로고침) 시 "비밀 진료기록" 탭이 나타나는지 확인.
- [제거] 클릭 → 탭이 다시 사라지는지 확인.

---

## 전체 커밋 단위 (Claude가 검수 후 진행)

1. `db/access_approval.sql` 실행 (Task 1) → 검증 통과 확인 후 `db/confidential_records.sql` 실행 (Task 4).
2. `hr.html` 전체 diff(Task 2·3·5·6) 한 번에 검수 — JS 구문 검사(`node -e`), remake류 잔여 문자열 없는지, RLS 정책 DB 대조.
3. `git commit` (feat 1개로 묶어도 되고, A/B로 나눠도 됨 — codex 결과 보고 Claude가 판단) → **push까지 바로 진행**(2026-09-07 방침).

## 실행 순서(원장 승인 후)
1. Claude가 이 문서를 codex 프롬프트로 압축해 `hr.html` + 2개 SQL 파일 작성을 codex exec에 위임(백그라운드).
2. Claude가 위 각 Task의 "검증" 항목대로 diff·SQL을 실측 검수.
3. SQL 2개 실행(Task 1 → Task 4 순서, Task 4는 `my_role()` 최신판을 참조하므로 반드시 Task 1 이후).
4. `hr.html` 커밋 + push.
5. 원장에게 신규가입 승인 플로우 + 비밀 진료기록 탭 실사용 확인 요청.
