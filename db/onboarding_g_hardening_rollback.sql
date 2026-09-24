-- G장 로컬 rollback 초안: migration이 추가한 요청 객체만 제거한다.
drop policy if exists fingerprint_registration_update_manager on public.fingerprint_registration_requests;
drop policy if exists fingerprint_registration_insert_self on public.fingerprint_registration_requests;
drop policy if exists fingerprint_registration_select_self_or_manager on public.fingerprint_registration_requests;
drop table if exists public.fingerprint_registration_requests;
