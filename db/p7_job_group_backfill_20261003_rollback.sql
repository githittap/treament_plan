-- P7 되돌리기 초안. 이 작업이 넣은 값이 그대로인 행만 원래 값으로 복원함.
-- 이후 원장이 바꾼 값과 원래 있던 값은 보존하며 백업도 지우지 않음.
BEGIN;
UPDATE public.profiles p SET job_group=b.old_job_group
FROM public.p7_job_group_backup_20261003 b
WHERE b.source_table='profiles' AND p.user_id=b.row_id AND p.job_group=b.applied_job_group;
UPDATE public.schedule_people s SET job_group=b.old_job_group
FROM public.p7_job_group_backup_20261003 b
WHERE b.source_table='schedule_people' AND s.id=b.row_id AND s.job_group=b.applied_job_group;
COMMIT;
