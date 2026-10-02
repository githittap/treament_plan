-- 문의함: 누가·언제 처리됨(closed)·상담일지 전환(converted)으로 바꿨는지를 서버가 직접 기록한다.
-- 기존 RLS 정책·열 권한·RPC는 바꾸지 않는다. 직원은 이 두 칸을 update할 수 있는 열 권한이 없고, 트리거가 있어도 값을 못 바꾼다.
-- handled_by에는 FK를 걸지 않는다: 계정 영구 삭제 흐름과 엮이면 처리 기록 때문에 삭제가 막히거나 문의가 같이 지워질 수 있어서다.
--   (이름은 화면에서 profiles로 찾고, 지워진 계정이면 이름 대신 id 앞부분이 보인다.)
-- 이미 closed인 옛 문의는 누가 처리했는지 알 수 없으므로 handled_*를 비워 둔다(지어내지 않음).
alter table public.consultation_inbox
  add column if not exists handled_by uuid,
  add column if not exists handled_at timestamptz;

create or replace function public.consultation_inbox_set_handled()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  was_open boolean := old.status not in ('closed','converted');
  now_open boolean := new.status not in ('closed','converted');
begin
  if was_open and not now_open then
    -- 열림 → 처리됨/전환: 지금 호출한 사람과 시각을 서버가 기록
    new.handled_at := now();
    new.handled_by := auth.uid();
  elsif not was_open and now_open then
    -- 다시 열림: 처리 기록을 비움
    new.handled_at := null;
    new.handled_by := null;
  else
    -- 그 밖(담당만 바꿈, 이미 처리됨끼리 바꿈 등)은 옛 값 그대로 — 호출자가 직접 쓴 값은 버림
    new.handled_at := old.handled_at;
    new.handled_by := old.handled_by;
  end if;
  return new;
end
$$;

revoke all on function public.consultation_inbox_set_handled() from public, anon, authenticated;
drop trigger if exists consultation_inbox_set_handled on public.consultation_inbox;
create trigger consultation_inbox_set_handled
before update on public.consultation_inbox
for each row execute function public.consultation_inbox_set_handled();
