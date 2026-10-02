-- 로컬 초안: 기존 완료 여부 표를 읽어 증빙 없는 수동 제출·확인을 거절함. 권한·기존 기록은 변경하지 않음.
begin;
create function public.p7_require_onboarding_evidence()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_label text;v_complete boolean;
begin
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
create trigger p7_onboarding_evidence_gate before insert or update on public.onboarding_checks
for each row execute function public.p7_require_onboarding_evidence();
commit;
