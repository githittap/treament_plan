-- 치과 직원 허브(근태·노무) 테스트 시드
-- profiles는 auth.users의 실제 UUID가 필요하므로 자동 삽입하지 않는다.

/*
프로필 입력 예시 템플릿
아래 UUID 플레이스홀더를 Supabase Auth의 실제 user id로 바꾼 뒤 실행한다.

insert into public.profiles
  (user_id, name, role, dept, hire_date)
values
  ('여기에-owner-유저-UUID'::uuid,  '원장 예시',   'owner',   '진료', '2020-01-01'),
  ('여기에-chief-유저-UUID'::uuid,  '실장 예시',   'chief',   '경영지원', '2021-01-01'),
  ('여기에-manager-유저-UUID'::uuid,'매니저 예시', 'manager', '진료지원', '2022-01-01'),
  ('여기에-staff1-유저-UUID'::uuid, '직원 예시 1', 'staff',   '진료지원', '2023-01-01'),
  ('여기에-staff2-유저-UUID'::uuid, '직원 예시 2', 'staff',   '데스크', '2024-01-01')
on conflict (user_id) do nothing;
*/

insert into public.holidays (date, name, kind)
values
  ('2026-08-15', '광복절', '공휴일'),
  -- [원장 확인] 2026-08-15가 토요일인 경우의 대체공휴일 적용 여부
  ('2026-08-17', '광복절 대체공휴일', '공휴일'),
  ('2026-09-24', '추석 연휴', '공휴일'),
  ('2026-09-25', '추석', '공휴일'),
  ('2026-09-26', '추석 연휴', '공휴일'),
  ('2026-10-03', '개천절', '공휴일'),
  -- [원장 확인] 개천절 대체공휴일 지정 여부
  ('2026-10-05', '개천절 대체공휴일', '공휴일'),
  ('2026-10-09', '한글날', '공휴일'),
  ('2026-12-25', '성탄절', '공휴일')
on conflict (date) do nothing;

insert into public.contract_templates (name, html, active)
select
  '샘플 근로계약서',
  $html$
<article class="employment-contract">
  <h1>근로계약서</h1>
  <p>근로자 성명: {{name}}</p>
  <p>입사일: {{hire_date}}</p>
  <p>임금: {{salary}}</p>
  <section>
    <h2>서명</h2>
    <p>근로자 서명 1: <span data-sign=staff1></span></p>
    <p>근로자 서명 2: <span data-sign=staff1></span></p>
    <p>원장 도장: <span data-stamp=owner></span></p>
  </section>
</article>
$html$,
  true
where not exists (
  select 1
  from public.contract_templates
  where name = '샘플 근로계약서'
);

insert into public.notices (title, body, pinned, author)
select
  '직원 허브 이용 안내',
  '근태 정정, 연차 신청, 결재 문서는 직원 허브에서 등록해 주세요.',
  true,
  '시스템'
where not exists (
  select 1
  from public.notices
  where title = '직원 허브 이용 안내'
);
