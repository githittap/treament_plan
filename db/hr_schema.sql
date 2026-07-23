-- 치과 직원 허브(근태·노무) 스키마
-- Supabase Postgres 15+
-- 기존 ledger 및 ortho_* 객체는 변경하지 않는다.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'staff'
    check (role in ('owner', 'chief', 'manager', 'staff')),
  dept text,
  hire_date date,
  fp_id text,
  contract_hours jsonb not null default '{}'::jsonb,
  stamp text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  work_date date not null,
  clock_in time,
  clock_out time,
  source text default 'fp' check (source in ('fp', 'manual')),
  late_min int default 0,
  overtime_min int default 0,
  evening boolean default false,
  is_holiday boolean default false,
  memo text,
  unique (user_id, work_date)
);

create table if not exists public.att_months (
  month text primary key,
  status text not null default '집계중'
    check (status in ('집계중', '확정')),
  closed_by text,
  closed_at timestamptz
);

create table if not exists public.attendance_issues (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  work_date date not null,
  type text check (type in ('시업누락', '종업누락', '정정')),
  reason text,
  rule_label text,
  status text not null default '대기'
    check (status in ('대기', '실장승인', '원장확정', '반려')),
  chief_by text,
  chief_at timestamptz,
  owner_by text,
  owner_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.schedule_weeks (
  week_start date primary key,
  status text not null default '초안'
    check (status in ('초안', '공표')),
  confirmed_by text,
  confirmed_at timestamptz
);

create table if not exists public.schedules (
  id bigint generated always as identity primary key,
  week_start date not null
    references public.schedule_weeks(week_start) on delete cascade,
  user_id uuid not null,
  day int not null check (day between 0 and 6),
  shift text not null default 'work'
    check (shift in ('work', 'off', 'evening', 'half_am', 'half_pm')),
  note text,
  unique (week_start, user_id, day)
);

create table if not exists public.leave_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  type text not null default '연차'
    check (type in ('연차', '반차', '기타')),
  type_note text,
  date_from date not null,
  date_to date not null,
  days numeric(4,1) not null,
  reason text,
  special boolean default false,
  special_reason text,
  status text not null default '대기'
    check (status in ('대기', '1차승인', '승인', '반려')),
  chief_by text,
  chief_at timestamptz,
  owner_by text,
  owner_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.leave_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null check (kind in ('부여', '사용', '조정')),
  days numeric(5,1) not null,
  ref bigint,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.holidays (
  date date primary key,
  name text not null,
  kind text default '공휴일'
    check (kind in ('공휴일', '지정휴일', '단축'))
);

create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  date date not null,
  title text not null,
  kind text default '이벤트'
    check (kind in ('이벤트', '단축근무', '면접')),
  body text,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.notices (
  id bigint generated always as identity primary key,
  title text not null,
  body text,
  notion_url text,
  pinned boolean default false,
  author text,
  created_at timestamptz default now()
);

create table if not exists public.notice_reads (
  notice_id bigint references public.notices(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz default now(),
  primary key (notice_id, user_id)
);

create table if not exists public.contract_templates (
  id bigint generated always as identity primary key,
  name text not null,
  html text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.contracts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  template_id bigint references public.contract_templates(id),
  merged_html text,
  fields jsonb default '{}'::jsonb,
  sign_slots jsonb default '{}'::jsonb,
  status text not null default '대기'
    check (status in ('대기', '서명완료')),
  signed_at timestamptz,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.approval_docs (
  id bigint generated always as identity primary key,
  kind text not null
    check (kind in ('연차', '소명', '사직서', '보고', '기타')),
  title text not null,
  body text,
  attachments text[] default '{}'::text[],
  author uuid not null,
  status text not null default '진행'
    check (status in ('진행', '완결', '반려')),
  created_at timestamptz default now()
);

create table if not exists public.approval_steps (
  id bigint generated always as identity primary key,
  doc_id bigint not null
    references public.approval_docs(id) on delete cascade,
  seq int not null,
  approver_role text check (approver_role in ('chief', 'owner')),
  approver_id uuid,
  status text not null default '대기'
    check (status in ('대기', '승인', '반려')),
  stamp text,
  opinion text,
  acted_at timestamptz
);

create table if not exists public.payroll_rows (
  id bigint generated always as identity primary key,
  month text not null,
  user_id uuid not null,
  items jsonb not null default '{}'::jsonb,
  net numeric,
  imported_at timestamptz default now(),
  imported_by text,
  unique (month, user_id)
);

create table if not exists public.payslips (
  id bigint generated always as identity primary key,
  month text not null,
  user_id uuid not null,
  html text,
  issued boolean not null default false,
  issued_at timestamptz,
  unique (month, user_id)
);

create table if not exists public.monthly_reviews (
  id bigint generated always as identity primary key,
  month text not null,
  user_id uuid not null,
  quant_memo text,
  qual_memo text,
  revenue_note text,
  bonus_amount numeric,
  bonus_reason text,
  created_at timestamptz default now(),
  unique (month, user_id)
);

create table if not exists public.bonus_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  period_from date,
  period_to date,
  amount numeric,
  formula text,
  condition_note text,
  active boolean default true
);

create table if not exists public.applicants (
  id bigint generated always as identity primary key,
  name text not null,
  position text,
  stage text default '지원'
    check (stage in ('지원', '서류', '면접', '합격', '불합격')),
  phone text,
  notion_url text,
  interview_at timestamptz,
  eval_memo text,
  created_at timestamptz default now()
);

create table if not exists public.ledger_files (
  id bigint generated always as identity primary key,
  ledger_id bigint not null references public.ledger(id) on delete cascade,
  file text not null,
  created_by text,
  created_at timestamptz default now()
);

-- 07-24 증축: 입사 제출물 체크리스트 (열린 형태 — 항목은 owner/chief가 자유 정의)
create table if not exists public.onboarding_items (
  id bigint generated always as identity primary key,
  label text not null,
  required boolean not null default true,
  order_no int default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.onboarding_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  item_id bigint not null references public.onboarding_items(id) on delete cascade,
  status text not null default '미제출'
    check (status in ('미제출', '제출', '확인')),
  submitted_at timestamptz,
  checked_by text,
  checked_at timestamptz,
  note text,
  unique (user_id, item_id)
);

-- RLS 정책에서 공통으로 사용하는 현재 사용자 역할 조회 함수.
-- profiles에 행이 없으면 staff로 취급한다.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select p.role
      from public.profiles as p
      where p.user_id = auth.uid()
    ),
    'staff'
  );
$$;

revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

create or replace view public.v_leave_balance
with (security_invoker = true)
as
select
  p.user_id,
  p.name,
  coalesce(
    sum(
      case
        when l.kind in ('부여', '조정') then l.days
        when l.kind = '사용' then -l.days
        else 0
      end
    ),
    0::numeric
  ) as balance
from public.profiles as p
left join public.leave_ledger as l
  on l.user_id = p.user_id
group by p.user_id, p.name;

create or replace view public.v_holiday_work
with (security_invoker = true)
as
select
  a.user_id,
  p.name,
  a.work_date,
  h.name as holiday_name,
  a.clock_in,
  a.clock_out
from public.attendance as a
join public.holidays as h
  on h.date = a.work_date
join public.profiles as p
  on p.user_id = a.user_id;

create index if not exists idx_attendance_user_work_date
  on public.attendance(user_id, work_date);
create index if not exists idx_attendance_work_date
  on public.attendance(work_date);
create index if not exists idx_leave_requests_status
  on public.leave_requests(status);
create index if not exists idx_leave_requests_date_from
  on public.leave_requests(date_from);
create index if not exists idx_approval_steps_doc_seq
  on public.approval_steps(doc_id, seq);
create index if not exists idx_notices_pinned
  on public.notices(pinned);
create index if not exists idx_payroll_rows_month
  on public.payroll_rows(month);
create index if not exists idx_ledger_files_ledger_id
  on public.ledger_files(ledger_id);

insert into storage.buckets (id, name, public)
values ('hr-docs', 'hr-docs', false)
on conflict do nothing;

-- 이미 publication에 포함된 표는 duplicate_object 예외를 무시한다.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notices;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.approval_docs;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.leave_requests;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.attendance_issues;
  exception
    when duplicate_object then null;
  end;
end;
$$;
