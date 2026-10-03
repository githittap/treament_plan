begin;
drop trigger if exists p7_onboarding_evidence_gate on public.onboarding_checks;
drop function if exists public.p7_require_onboarding_evidence();
commit;
