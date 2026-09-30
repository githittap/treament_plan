-- G장 로컬 migration 초안: 지문 등록은 직원 보고 후 관리자 승인으로만 완료한다.
create table if not exists public.fingerprint_registration_requests (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  status text not null default '요청' check (status in ('요청','완료','반려')),
  requested_at timestamptz not null default now(),
  manager_id uuid references public.profiles(user_id),
  approved_at timestamptz
);
alter table public.fingerprint_registration_requests enable row level security;
revoke all on table public.fingerprint_registration_requests from anon,authenticated;
grant select,insert,update on table public.fingerprint_registration_requests to authenticated;
drop policy if exists fingerprint_registration_select_self_or_manager on public.fingerprint_registration_requests;
create policy fingerprint_registration_select_self_or_manager on public.fingerprint_registration_requests for select to authenticated using (user_id=auth.uid() or public.my_role() in ('manager','chief','owner'));
drop policy if exists fingerprint_registration_insert_self on public.fingerprint_registration_requests;
create policy fingerprint_registration_insert_self on public.fingerprint_registration_requests for insert to authenticated with check (user_id=auth.uid() and status='요청');
drop policy if exists fingerprint_registration_update_manager on public.fingerprint_registration_requests;
create policy fingerprint_registration_update_manager on public.fingerprint_registration_requests for update to authenticated using (public.my_role() in ('manager','owner') and user_id<>auth.uid()) with check (public.my_role() in ('manager','owner') and user_id<>auth.uid() and manager_id=auth.uid() and status in ('완료','반려'));

-- 원본 13항은 UI 안내로 항상 표시하고, 기존 onboarding_items 자유 편집값은 덮어쓰지 않는다.
insert into public.onboarding_items(label,required,order_no,active)
select v.label,true,100+v.ord,true from (values
 ('병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.',1),('조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.',2),('무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.',3),('소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.',4),('무전은 들었다는 뜻으로 최초 1회 응답한다.',5),('진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않는다.',6),('환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.',7),('대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.',8),('컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.',9),('신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.',10),('임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.',11),('사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.',12),('치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.',13)
) v(label,ord) where not exists(select 1 from public.onboarding_items i where i.label=v.label);
insert into public.onboarding_items(label,required,order_no,active)
select v.label,true,100+v.ord,true from (values
 ('기본 도구와 오픈·마감 절차를 확인한다.',14),
 ('상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.',15),
 ('환자 앞에서 필요한 설명과 양해를 먼저 제공한다.',16)
) v(label,ord) where not exists(select 1 from public.onboarding_items i where i.label=v.label);
