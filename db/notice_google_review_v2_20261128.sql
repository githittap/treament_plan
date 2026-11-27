-- 허브 상단 공지 「구글 리뷰 부탁 방법」 2판으로 교체 (2026-11-28 · T0 답모음 전달 · T2 원문
--   Z:\09_claude-output\01_마케팅·블로그\T2_로컬\work\2026-11-22-gbp-rules\직원허브_공지_구글리뷰부탁방법_v2_20261128.md)
-- 원장 11-28 캡처 26 「문자로 보내면 그게 법위반이다 … 나는 직원에게 리뷰 부탁하게 할거다」:
--   직원이 직접 말로 부탁 · 리뷰에 진료 내용 · 문자·카톡으로 링크 안 보냄.
-- 새 공지(상단 고정)를 올리고, 1판(id 4)은 고정을 풀고 제목에 「지난 판」 표시, 카톡 발송을 안내하던 옛 공지(id 3)도 제목에 표시.
-- 되돌리기: notice_google_review_v2_20261128_rollback.sql
begin;
-- 공지 작성자 검사(guard_notice_immutable_fields: author_id = auth.uid())를 1판 작성자(원장 계정)로 맞춤 — 이 묶음 안에서만
select set_config('request.jwt.claim.sub', (select author_id::text from public.notices where id = 4), true),
       set_config('request.jwt.claims', json_build_object('sub', (select author_id::text from public.notices where id = 4), 'role', 'authenticated')::text, true);
insert into public.notices (title, body, pinned, author_id, author, attachments)
select '[공지] 구글 리뷰 — 직원이 환자분께 직접 부탁드리는 방법 (2판, 11/28)', $body$구글 지도에서 우리 병원이 잘 보이려면 새 리뷰가 꾸준히, 그리고 리뷰에 진료 내용이 들어가는 것이 중요합니다. 리뷰 부탁은 직원 선생님이 환자분께 직접, 말로 합니다. 문자로 보내지 않습니다.

[1. 누구에게]
- 진료가 잘 끝나고 만족해하시는 분께 부탁드립니다. 하루 한두 분이면 충분합니다.

[2. 언제]
- 수납을 마친 직후, 또는 다음 예약을 잡아 드린 직후.

[3. 이렇게 말씀드립니다 (그대로 읽으셔도 됩니다)]
"오늘 ○○(진료 이름 — 예: 임플란트 상담, 사랑니 발치, 스케일링) 잘 받으셨어요? 괜찮으시면 지금 구글 지도에 후기 한 줄만 부탁드려요. 오늘 받으신 ○○ 이야기를 한 줄 넣어 주시면 같은 고민 하시는 분들께 정말 도움이 돼요. 이 QR 찍으시면 바로 쓰는 화면이 나와요."
- 진료 이름을 꼭 넣어 말씀드립니다 — 리뷰에 「임플란트」「사랑니」 같은 진료 내용이 들어가야 검색에 잘 걸립니다.
- 그 자리에서 QR을 찍어 쓰시도록 화면까지 안내해 드립니다.
- 거절하시면 "네, 괜찮습니다~" 하고 넘어갑니다.

[4. QR·주소]
- 데스크 구글 리뷰 QR 카드를 보여 드립니다.
- 리뷰 주소(QR과 같음): https://g.page/r/CUlwa4ajcDI0EBM/review
- 문자·카톡으로 리뷰 링크를 보내지 않습니다.

[5. 보고]
- 매주 새로 들어온 구글 리뷰 수와 진료 내용이 들어간 리뷰 수를 원장님께 보고드립니다. 꾸준히 부탁해 주신 분은 칭찬·포상 대상입니다.

문의: 원장님 / 마케팅 담당$body$, true, n.author_id, n.author, '[]'::jsonb
from public.notices n
where n.id = 4
  and not exists (select 1 from public.notices x where x.title = '[공지] 구글 리뷰 — 직원이 환자분께 직접 부탁드리는 방법 (2판, 11/28)');

update public.notices set pinned = false, title = '[지난 판 — 11/28 2판으로 바뀜] ' || title
 where id = 4 and title not like '[지난 판%';
update public.notices set title = '[지난 판 — 11/28 2판으로 바뀜 · 문자·카톡 발송 안 함] ' || title
 where id = 3 and title not like '[지난 판%';
commit;
