-- 로컬 초안: 기존 완료 여부 표를 읽어 증빙 없는 수동 제출·확인을 거절함. 권한·기존 기록은 변경하지 않음.
begin;
do $$ begin
  if to_regprocedure('public.p7_require_onboarding_evidence()') is not null and not exists(
    select 1 from pg_proc where oid=to_regprocedure('public.p7_require_onboarding_evidence()')
      and strpos(prosrc,'P7_ONBOARDING_EVIDENCE_20261003')>0 and prorettype='trigger'::regtype and not prosecdef
  ) then raise exception 'P7 onboarding function conflict'; end if;
  if exists(select 1 from pg_trigger where tgrelid='public.onboarding_checks'::regclass
    and tgname='p7_onboarding_evidence_gate' and (tgfoid is distinct from to_regprocedure('public.p7_require_onboarding_evidence()')
      or tgtype<>23 or tgnargs<>0 or tgqual is not null)) then
    raise exception 'P7 onboarding trigger conflict';
  end if;
end $$;
create or replace function public.p7_require_onboarding_evidence()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_label text;v_complete boolean;
begin
  -- P7_ONBOARDING_EVIDENCE_20261003
  if new.status not in ('제출','확인') then return new; end if;
  select label into v_label from public.onboarding_items where id=new.item_id;
  if v_label ~ '계좌' then
    select bank_complete into v_complete from public.onboarding_evidence_completion where user_id=new.user_id;
  elsif v_label ~* 'notion|노션' then
    select notion_complete into v_complete from public.onboarding_evidence_completion where user_id=new.user_id;
  else
    return new;
  end if;
  if not coalesce(v_complete,false) then raise exception 'onboarding evidence is required'; end if;
  return new;
end;
$$;
drop trigger if exists p7_onboarding_evidence_gate on public.onboarding_checks;
create trigger p7_onboarding_evidence_gate before insert or update on public.onboarding_checks
for each row execute function public.p7_require_onboarding_evidence();
commit;
