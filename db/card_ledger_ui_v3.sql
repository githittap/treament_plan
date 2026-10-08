-- 지출 점검: 해외 거래 구분 추가. 화면 글은 원장이 허브 설정에서 고칠 수 있음.
begin;
insert into public.hub_ui_texts(key,value) values
 ('ledger.abroad_filter','해외 여부'),
 ('ledger.abroad_section','해외 거래'),
 ('ledger.abroad','해외'),
 ('ledger.overseas','해외'),
 ('ledger.domestic','국내')
on conflict(key) do nothing;
commit;
