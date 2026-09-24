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
create policy fingerprint_registration_update_manager on public.fingerprint_registration_requests for update to authenticated using (public.my_role() in ('manager','chief','owner') and user_id<>auth.uid()) with check (public.my_role() in ('manager','chief','owner') and user_id<>auth.uid() and manager_id=auth.uid() and status in ('완료','반려'));

-- 원본 13항은 UI 안내로 항상 표시하고, 기존 onboarding_items 자유 편집값은 덮어쓰지 않는다.
insert into public.onboarding_items(label,required,order_no,active)
select v.label,true,100+v.ord,true from (values
 ('병원 시설·식당·출퇴근 기록 장치 안내',1),('조직도·호칭·예절·업무분장·근로계약·복리후생',2),('무전기 사용법과 업무용 대화 범위',3),('담당자·보고 라인·당일 교육 항목',4),('기본 도구와 오픈·마감',5),('무전 최초 1회 응답',6),('환자 앞 사담·내부 판단 논의 금지',7),('납부·비급여 차감 기록 일치',8),('대기시간과 환자 동선 안내',9),('컴플레인 경청·보고·단독 약속 금지',10),('신환 구강포토·상담 차트 기록',11),('임플란트 1차·3주·6주 내원 주기',12),('기구 정리·후속 계획 기록',13)
) v(label,ord) where not exists(select 1 from public.onboarding_items i where i.label=v.label);
