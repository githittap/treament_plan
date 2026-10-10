-- 업무매뉴얼 설명덱 되돌리기. 덱이나 사진이 하나라도 있으면 자료를 남기고 중단한다(삭제 없음).
begin;
do $$ begin
  if exists (select 1 from public.manual_decks) or exists (select 1 from storage.objects where bucket_id='manual-media') then
    raise exception 'manual decks or media exist; rollback stopped without deleting data';
  end if;
end $$;
drop policy if exists manual_media_select on storage.objects;
drop policy if exists manual_media_insert on storage.objects;
drop policy if exists manual_media_delete on storage.objects;
delete from storage.buckets where id='manual-media';
drop table if exists public.manual_decks;
drop function if exists public.manual_decks_stamp();
commit;
