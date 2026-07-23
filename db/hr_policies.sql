-- 치과 직원 허브(근태·노무) RLS 정책
-- 모든 정책은 authenticated 역할을 대상으로 한다.

alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.att_months enable row level security;
alter table public.attendance_issues enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.schedules enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger enable row level security;
alter table public.holidays enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.approval_docs enable row level security;
alter table public.approval_steps enable row level security;
alter table public.payroll_rows enable row level security;
alter table public.payslips enable row level security;
alter table public.monthly_reviews enable row level security;
alter table public.bonus_rules enable row level security;
alter table public.applicants enable row level security;
alter table public.ledger_files enable row level security;

-- profiles
-- my_role() 재귀를 막기 위해 profiles 조회 정책은 역할 함수를 호출하지 않는다.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles for select to authenticated
using (true);

drop policy if exists profiles_insert_owner on public.profiles;
create policy profiles_insert_owner
on public.profiles for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner
on public.profiles for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists profiles_delete_owner on public.profiles;
create policy profiles_delete_owner
on public.profiles for delete to authenticated
using (public.my_role() = 'owner');

-- attendance
drop policy if exists attendance_select_scoped on public.attendance;
create policy attendance_select_scoped
on public.attendance for select to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('manager', 'chief', 'owner')
);

drop policy if exists attendance_insert_leadership on public.attendance;
create policy attendance_insert_leadership
on public.attendance for insert to authenticated
with check (public.my_role() in ('manager', 'chief', 'owner'));

drop policy if exists attendance_update_leadership on public.attendance;
create policy attendance_update_leadership
on public.attendance for update to authenticated
using (public.my_role() in ('manager', 'chief', 'owner'))
with check (public.my_role() in ('manager', 'chief', 'owner'));

drop policy if exists attendance_delete_owner on public.attendance;
create policy attendance_delete_owner
on public.attendance for delete to authenticated
using (public.my_role() = 'owner');

-- att_months
drop policy if exists att_months_select_authenticated on public.att_months;
create policy att_months_select_authenticated
on public.att_months for select to authenticated
using (true);

drop policy if exists att_months_insert_owner on public.att_months;
create policy att_months_insert_owner
on public.att_months for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists att_months_update_owner on public.att_months;
create policy att_months_update_owner
on public.att_months for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

-- attendance_issues
drop policy if exists attendance_issues_insert_self on public.attendance_issues;
create policy attendance_issues_insert_self
on public.attendance_issues for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists attendance_issues_select_scoped on public.attendance_issues;
create policy attendance_issues_select_scoped
on public.attendance_issues for select to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('manager', 'chief', 'owner')
);

drop policy if exists attendance_issues_update_approvers on public.attendance_issues;
create policy attendance_issues_update_approvers
on public.attendance_issues for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- schedule_weeks
drop policy if exists schedule_weeks_select_authenticated on public.schedule_weeks;
create policy schedule_weeks_select_authenticated
on public.schedule_weeks for select to authenticated
using (true);

drop policy if exists schedule_weeks_insert_authenticated on public.schedule_weeks;
create policy schedule_weeks_insert_authenticated
on public.schedule_weeks for insert to authenticated
with check (true);

drop policy if exists schedule_weeks_update_approvers on public.schedule_weeks;
create policy schedule_weeks_update_approvers
on public.schedule_weeks for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- schedules
drop policy if exists schedules_select_authenticated on public.schedules;
create policy schedules_select_authenticated
on public.schedules for select to authenticated
using (true);

drop policy if exists schedules_insert_authenticated on public.schedules;
create policy schedules_insert_authenticated
on public.schedules for insert to authenticated
with check (true);

-- 초안 작성 편의를 위해 DB 정책은 전 직원 수정을 허용한다.
-- 공표 후 편집 UI는 프론트에서 chief/owner에게만 노출해야 한다.
drop policy if exists schedules_update_authenticated on public.schedules;
create policy schedules_update_authenticated
on public.schedules for update to authenticated
using (true)
with check (true);

-- leave_requests
drop policy if exists leave_requests_insert_self on public.leave_requests;
create policy leave_requests_insert_self
on public.leave_requests for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists leave_requests_select_scoped on public.leave_requests;
create policy leave_requests_select_scoped
on public.leave_requests for select to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('chief', 'owner')
  or status = '승인'
);

drop policy if exists leave_requests_update_approvers on public.leave_requests;
create policy leave_requests_update_approvers
on public.leave_requests for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- leave_ledger
drop policy if exists leave_ledger_select_scoped on public.leave_ledger;
create policy leave_ledger_select_scoped
on public.leave_ledger for select to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('chief', 'owner')
);

drop policy if exists leave_ledger_insert_owner on public.leave_ledger;
create policy leave_ledger_insert_owner
on public.leave_ledger for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists leave_ledger_update_owner on public.leave_ledger;
create policy leave_ledger_update_owner
on public.leave_ledger for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists leave_ledger_delete_owner on public.leave_ledger;
create policy leave_ledger_delete_owner
on public.leave_ledger for delete to authenticated
using (public.my_role() = 'owner');

-- holidays
drop policy if exists holidays_select_authenticated on public.holidays;
create policy holidays_select_authenticated
on public.holidays for select to authenticated
using (true);

drop policy if exists holidays_insert_approvers on public.holidays;
create policy holidays_insert_approvers
on public.holidays for insert to authenticated
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists holidays_update_approvers on public.holidays;
create policy holidays_update_approvers
on public.holidays for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists holidays_delete_approvers on public.holidays;
create policy holidays_delete_approvers
on public.holidays for delete to authenticated
using (public.my_role() in ('chief', 'owner'));

-- calendar_events
drop policy if exists calendar_events_select_scoped on public.calendar_events;
create policy calendar_events_select_scoped
on public.calendar_events for select to authenticated
using (
  kind <> '면접'
  or public.my_role() in ('chief', 'owner')
);

drop policy if exists calendar_events_insert_approvers on public.calendar_events;
create policy calendar_events_insert_approvers
on public.calendar_events for insert to authenticated
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists calendar_events_update_approvers on public.calendar_events;
create policy calendar_events_update_approvers
on public.calendar_events for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists calendar_events_delete_approvers on public.calendar_events;
create policy calendar_events_delete_approvers
on public.calendar_events for delete to authenticated
using (public.my_role() in ('chief', 'owner'));

-- notices
drop policy if exists notices_select_authenticated on public.notices;
create policy notices_select_authenticated
on public.notices for select to authenticated
using (true);

drop policy if exists notices_insert_approvers on public.notices;
create policy notices_insert_approvers
on public.notices for insert to authenticated
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists notices_update_approvers on public.notices;
create policy notices_update_approvers
on public.notices for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- notice_reads
drop policy if exists notice_reads_insert_self on public.notice_reads;
create policy notice_reads_insert_self
on public.notice_reads for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists notice_reads_select_authenticated on public.notice_reads;
create policy notice_reads_select_authenticated
on public.notice_reads for select to authenticated
using (true);

-- contract_templates
drop policy if exists contract_templates_select_owner on public.contract_templates;
create policy contract_templates_select_owner
on public.contract_templates for select to authenticated
using (public.my_role() = 'owner');

drop policy if exists contract_templates_insert_owner on public.contract_templates;
create policy contract_templates_insert_owner
on public.contract_templates for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists contract_templates_update_owner on public.contract_templates;
create policy contract_templates_update_owner
on public.contract_templates for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists contract_templates_delete_owner on public.contract_templates;
create policy contract_templates_delete_owner
on public.contract_templates for delete to authenticated
using (public.my_role() = 'owner');

-- contracts
drop policy if exists contracts_select_scoped on public.contracts;
create policy contracts_select_scoped
on public.contracts for select to authenticated
using (
  public.my_role() = 'owner'
  or (
    user_id = auth.uid()
    and (
      status <> '서명완료'
      or signed_at > now() - interval '5 days'
    )
  )
);

drop policy if exists contracts_insert_owner on public.contracts;
create policy contracts_insert_owner
on public.contracts for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists contracts_update_scoped on public.contracts;
create policy contracts_update_scoped
on public.contracts for update to authenticated
using (
  public.my_role() = 'owner'
  or (user_id = auth.uid() and status = '대기')
)
with check (
  public.my_role() = 'owner'
  or (user_id = auth.uid() and status = '대기')
);

-- approval_docs
drop policy if exists approval_docs_insert_author on public.approval_docs;
create policy approval_docs_insert_author
on public.approval_docs for insert to authenticated
with check (author = auth.uid());

drop policy if exists approval_docs_select_scoped on public.approval_docs;
create policy approval_docs_select_scoped
on public.approval_docs for select to authenticated
using (
  author = auth.uid()
  or public.my_role() in ('chief', 'owner')
);

drop policy if exists approval_docs_update_scoped on public.approval_docs;
create policy approval_docs_update_scoped
on public.approval_docs for update to authenticated
using (
  author = auth.uid()
  or public.my_role() in ('chief', 'owner')
)
with check (
  author = auth.uid()
  or public.my_role() in ('chief', 'owner')
);

-- approval_steps
drop policy if exists approval_steps_insert_authenticated on public.approval_steps;
create policy approval_steps_insert_authenticated
on public.approval_steps for insert to authenticated
with check (true);

drop policy if exists approval_steps_select_scoped on public.approval_steps;
create policy approval_steps_select_scoped
on public.approval_steps for select to authenticated
using (
  public.my_role() in ('chief', 'owner')
  or exists (
    select 1
    from public.approval_docs as d
    where d.id = approval_steps.doc_id
      and d.author = auth.uid()
  )
);

drop policy if exists approval_steps_update_approvers on public.approval_steps;
create policy approval_steps_update_approvers
on public.approval_steps for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- payroll_rows
drop policy if exists payroll_rows_select_owner on public.payroll_rows;
create policy payroll_rows_select_owner
on public.payroll_rows for select to authenticated
using (public.my_role() = 'owner');

drop policy if exists payroll_rows_insert_owner on public.payroll_rows;
create policy payroll_rows_insert_owner
on public.payroll_rows for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists payroll_rows_update_owner on public.payroll_rows;
create policy payroll_rows_update_owner
on public.payroll_rows for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists payroll_rows_delete_owner on public.payroll_rows;
create policy payroll_rows_delete_owner
on public.payroll_rows for delete to authenticated
using (public.my_role() = 'owner');

-- payslips
drop policy if exists payslips_select_scoped on public.payslips;
create policy payslips_select_scoped
on public.payslips for select to authenticated
using (
  public.my_role() = 'owner'
  or (user_id = auth.uid() and issued = true)
);

drop policy if exists payslips_insert_owner on public.payslips;
create policy payslips_insert_owner
on public.payslips for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists payslips_update_owner on public.payslips;
create policy payslips_update_owner
on public.payslips for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

-- monthly_reviews
drop policy if exists monthly_reviews_select_owner on public.monthly_reviews;
create policy monthly_reviews_select_owner
on public.monthly_reviews for select to authenticated
using (public.my_role() = 'owner');

drop policy if exists monthly_reviews_insert_owner on public.monthly_reviews;
create policy monthly_reviews_insert_owner
on public.monthly_reviews for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists monthly_reviews_update_owner on public.monthly_reviews;
create policy monthly_reviews_update_owner
on public.monthly_reviews for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists monthly_reviews_delete_owner on public.monthly_reviews;
create policy monthly_reviews_delete_owner
on public.monthly_reviews for delete to authenticated
using (public.my_role() = 'owner');

-- bonus_rules
drop policy if exists bonus_rules_select_owner on public.bonus_rules;
create policy bonus_rules_select_owner
on public.bonus_rules for select to authenticated
using (public.my_role() = 'owner');

drop policy if exists bonus_rules_insert_owner on public.bonus_rules;
create policy bonus_rules_insert_owner
on public.bonus_rules for insert to authenticated
with check (public.my_role() = 'owner');

drop policy if exists bonus_rules_update_owner on public.bonus_rules;
create policy bonus_rules_update_owner
on public.bonus_rules for update to authenticated
using (public.my_role() = 'owner')
with check (public.my_role() = 'owner');

drop policy if exists bonus_rules_delete_owner on public.bonus_rules;
create policy bonus_rules_delete_owner
on public.bonus_rules for delete to authenticated
using (public.my_role() = 'owner');

-- applicants
drop policy if exists applicants_select_approvers on public.applicants;
create policy applicants_select_approvers
on public.applicants for select to authenticated
using (public.my_role() in ('chief', 'owner'));

drop policy if exists applicants_insert_approvers on public.applicants;
create policy applicants_insert_approvers
on public.applicants for insert to authenticated
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists applicants_update_approvers on public.applicants;
create policy applicants_update_approvers
on public.applicants for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

-- ledger_files
drop policy if exists ledger_files_select_authenticated on public.ledger_files;
create policy ledger_files_select_authenticated
on public.ledger_files for select to authenticated
using (true);

drop policy if exists ledger_files_insert_authenticated on public.ledger_files;
create policy ledger_files_insert_authenticated
on public.ledger_files for insert to authenticated
with check (true);

drop policy if exists ledger_files_delete_owner on public.ledger_files;
create policy ledger_files_delete_owner
on public.ledger_files for delete to authenticated
using (public.my_role() = 'owner');

-- 07-24 증축: 입사 제출물 체크리스트
alter table public.onboarding_items enable row level security;
alter table public.onboarding_checks enable row level security;

drop policy if exists onboarding_items_select_authenticated on public.onboarding_items;
create policy onboarding_items_select_authenticated
on public.onboarding_items for select to authenticated
using (true);

drop policy if exists onboarding_items_insert_approvers on public.onboarding_items;
create policy onboarding_items_insert_approvers
on public.onboarding_items for insert to authenticated
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists onboarding_items_update_approvers on public.onboarding_items;
create policy onboarding_items_update_approvers
on public.onboarding_items for update to authenticated
using (public.my_role() in ('chief', 'owner'))
with check (public.my_role() in ('chief', 'owner'));

drop policy if exists onboarding_items_delete_owner on public.onboarding_items;
create policy onboarding_items_delete_owner
on public.onboarding_items for delete to authenticated
using (public.my_role() = 'owner');

drop policy if exists onboarding_checks_select_scoped on public.onboarding_checks;
create policy onboarding_checks_select_scoped
on public.onboarding_checks for select to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('manager', 'chief', 'owner')
);

drop policy if exists onboarding_checks_insert_scoped on public.onboarding_checks;
create policy onboarding_checks_insert_scoped
on public.onboarding_checks for insert to authenticated
with check (
  user_id = auth.uid()
  or public.my_role() in ('chief', 'owner')
);

drop policy if exists onboarding_checks_update_scoped on public.onboarding_checks;
create policy onboarding_checks_update_scoped
on public.onboarding_checks for update to authenticated
using (
  user_id = auth.uid()
  or public.my_role() in ('chief', 'owner')
)
with check (
  user_id = auth.uid()
  or public.my_role() in ('chief', 'owner')
);

drop policy if exists onboarding_checks_delete_owner on public.onboarding_checks;
create policy onboarding_checks_delete_owner
on public.onboarding_checks for delete to authenticated
using (public.my_role() = 'owner');

-- Storage: hr-docs 비공개 버킷
drop policy if exists hr_docs_select_authenticated on storage.objects;
create policy hr_docs_select_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'hr-docs');

drop policy if exists hr_docs_insert_authenticated on storage.objects;
create policy hr_docs_insert_authenticated
on storage.objects for insert to authenticated
with check (bucket_id = 'hr-docs');

drop policy if exists hr_docs_delete_owner on storage.objects;
create policy hr_docs_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'hr-docs'
  and public.my_role() = 'owner'
);
