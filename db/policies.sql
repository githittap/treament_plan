-- 치과 교정 케이스 보드 RLS 정책
-- 직원 전원(authenticated)이 사용하는 내부 업무용 정책

ALTER TABLE public.ortho_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ortho_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ortho_visits ENABLE ROW LEVEL SECURITY;

-- ortho_cases: 조회·추가·수정 허용, 물리 삭제 정책 없음
DROP POLICY IF EXISTS ortho_cases_authenticated_select ON public.ortho_cases;
CREATE POLICY ortho_cases_authenticated_select
ON public.ortho_cases
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS ortho_cases_authenticated_insert ON public.ortho_cases;
CREATE POLICY ortho_cases_authenticated_insert
ON public.ortho_cases
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS ortho_cases_authenticated_update ON public.ortho_cases;
CREATE POLICY ortho_cases_authenticated_update
ON public.ortho_cases
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ortho_events: 추가만 가능한 감사 이력(조회·추가만 허용)
DROP POLICY IF EXISTS ortho_events_authenticated_select ON public.ortho_events;
CREATE POLICY ortho_events_authenticated_select
ON public.ortho_events
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS ortho_events_authenticated_insert ON public.ortho_events;
CREATE POLICY ortho_events_authenticated_insert
ON public.ortho_events
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ortho_visits: 조회·추가 허용, 작성 당일에만 수정 허용
DROP POLICY IF EXISTS ortho_visits_authenticated_select ON public.ortho_visits;
CREATE POLICY ortho_visits_authenticated_select
ON public.ortho_visits
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS ortho_visits_authenticated_insert ON public.ortho_visits;
CREATE POLICY ortho_visits_authenticated_insert
ON public.ortho_visits
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS ortho_visits_authenticated_update_same_day ON public.ortho_visits;
CREATE POLICY ortho_visits_authenticated_update_same_day
ON public.ortho_visits
FOR UPDATE
TO authenticated
USING (created_at::date = current_date)
WITH CHECK (created_at::date = current_date);
