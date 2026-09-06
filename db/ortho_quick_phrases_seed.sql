-- 교정 케이스 보드 자주쓰는 문구. 검토 후 Supabase SQL Editor에서 실행하세요.
insert into public.app_settings (key, value)
values (
  'ortho_quick_phrases',
  $json${
    "visit_progress": ["세트 ○~○ 전달", "재평가 필요", "특이사항 없음"],
    "visit_considerations": ["착용시간 부족", "구강위생 불량", "특이사항 없음"],
    "visit_plan": ["2주 후 재내원", "다음 세트 전달 예정", "장착 준비"],
    "next_action": ["다음 내원 시 재점검", "입금 확인 필요", "배송 상태 확인"],
    "diagnosis": ["특이사항 없음", "양측 비대칭 소견", "연장 치료 필요"]
  }$json$
)
on conflict (key) do update
set value = excluded.value;
