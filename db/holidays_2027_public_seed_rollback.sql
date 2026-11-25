-- 2027 공휴일 시드 되돌리기: 시드가 넣은 그대로인 행(note 표지 + 2027년 + 공휴일 + 구글 전송 꺼짐 + 허브에서 수정 기록 없음)만 지움.
-- 원장이 허브에서 「구글에 보내기」를 켰거나 이름·종류를 고친 행(수정 기록이 남음)은 남김.
begin;
delete from public.holidays
where date between '2027-01-01' and '2027-12-31' and kind='공휴일' and note='2027 공휴일 시드'
  and sync_gbp=false and updated_by is null;
commit;
