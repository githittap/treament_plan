-- P7 전용 되돌리기: 함수 원문만 복원함. 알림·설정·인사 기록을 삭제하지 않음.
begin;
do $$ declare r record; begin
 if to_regclass('public.p7_settings_notify_backup') is null then raise exception 'P7 function backup missing';end if;
 if (select count(*) from public.p7_settings_notify_backup)<>9 then raise exception 'P7 function backup incomplete';end if;
 for r in select definition from public.p7_settings_notify_backup loop execute r.definition;end loop;
end $$;
-- 내부 helper와 회차별 함수 백업은 보존함. 다시 적용할 때 새 정상 수정 여부를 대조함.
commit;
