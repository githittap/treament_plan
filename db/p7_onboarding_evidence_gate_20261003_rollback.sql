begin;
drop trigger p7_onboarding_evidence_gate on public.onboarding_checks;
drop function public.p7_require_onboarding_evidence();
commit;
