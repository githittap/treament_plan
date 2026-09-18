-- 근로계약서 작성 요청부터 취소까지 화면에서 사용하는 상태를 DB와 동기화한다.
begin;

alter table public.contracts
  drop constraint if exists contracts_status_check;

alter table public.contracts
  add constraint contracts_status_check
  check (status in ('발송요청', '대기', '서명완료', '취소'));

commit;
