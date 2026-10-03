-- 로컬 초안: 기존 호출자 권한·RLS 그대로 문서와 결재선을 한 트랜잭션에 저장함.
begin;
do $$ begin
  if to_regprocedure('public.submit_approval_document(text,text,text)') is not null and not exists(
    select 1 from pg_proc where oid=to_regprocedure('public.submit_approval_document(text,text,text)')
    and strpos(prosrc,'P7_APPROVAL_ATOMIC_20261003')>0
    and proargnames=array['p_kind','p_title','p_body']::text[] and prorettype='bigint'::regtype and not prosecdef
  ) then raise exception 'P7 approval function conflict'; end if;
end $$;
create or replace function public.submit_approval_document(p_kind text,p_title text,p_body text)
returns bigint language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  -- P7_APPROVAL_ATOMIC_20261003
  insert into public.approval_docs(kind,title,body,author)
  values(p_kind,p_title,p_body,auth.uid()) returning id into v_id;
  insert into public.approval_steps(doc_id,seq,approver_role)
  values(v_id,1,'chief'),(v_id,2,'owner');
  return v_id;
end;
$$;
commit;
