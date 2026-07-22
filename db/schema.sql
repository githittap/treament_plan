-- 치과 교정 케이스 보드 스키마
-- Supabase PostgreSQL 15+ / 재실행 가능

CREATE TABLE IF NOT EXISTS public.ortho_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_name text NOT NULL,
    chart_no text,
    phone text,
    rrn text,
    diagnosis text,
    case_type text NOT NULL DEFAULT '슈어스마일',
    stage_key text NOT NULL DEFAULT 'stage01',
    flags jsonb NOT NULL DEFAULT '{}'::jsonb,
    early_rx boolean NOT NULL DEFAULT false,
    early_rx_note text,
    start_date date,
    fee_dx_amount integer,
    fee_dx_paid_at date,
    fee_half_amount integer,
    fee_half_paid_at date,
    depositor_name text,
    ship_requested_at date,
    appt_target_date date,
    tracking_no text,
    ship_status text,
    staff text,
    next_action text,
    next_due date,
    memo text,
    archived boolean NOT NULL DEFAULT false,
    deleted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ortho_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES public.ortho_cases(id) ON DELETE CASCADE,
    kind text NOT NULL,
    body text,
    author text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ortho_events_kind_check CHECK (kind IN ('call', 'pay', 'stage', 'note'))
);

CREATE TABLE IF NOT EXISTS public.ortho_visits (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES public.ortho_cases(id) ON DELETE CASCADE,
    visit_date date NOT NULL DEFAULT current_date,
    progress text,
    considerations text,
    plan_next text,
    plan_next_date date,
    author text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 행 수정 시 updated_at을 현재 시각으로 갱신한다.
CREATE OR REPLACE FUNCTION public.set_ortho_cases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ortho_cases_updated_at ON public.ortho_cases;
CREATE TRIGGER trg_ortho_cases_updated_at
BEFORE UPDATE ON public.ortho_cases
FOR EACH ROW
EXECUTE FUNCTION public.set_ortho_cases_updated_at();

-- 배송요청일 입력 또는 변경 시 예약목표일을 3주 뒤로 계산한다.
-- INSERT에서는 OLD를 참조하지 않도록 TG_OP를 먼저 분기한다.
CREATE OR REPLACE FUNCTION public.set_ortho_cases_appt_target_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.ship_requested_at IS NOT NULL THEN
            NEW.appt_target_date := NEW.ship_requested_at + 21;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.ship_requested_at IS DISTINCT FROM OLD.ship_requested_at
           AND NEW.ship_requested_at IS NOT NULL THEN
            NEW.appt_target_date := NEW.ship_requested_at + 21;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ortho_cases_appt_target_date ON public.ortho_cases;
CREATE TRIGGER trg_ortho_cases_appt_target_date
BEFORE INSERT OR UPDATE ON public.ortho_cases
FOR EACH ROW
EXECUTE FUNCTION public.set_ortho_cases_appt_target_date();

CREATE INDEX IF NOT EXISTS idx_ortho_cases_stage_key_active
    ON public.ortho_cases (stage_key)
    WHERE deleted = false;

CREATE INDEX IF NOT EXISTS idx_ortho_visits_plan_next_date
    ON public.ortho_visits (plan_next_date);

CREATE INDEX IF NOT EXISTS idx_ortho_visits_case_id_visit_date
    ON public.ortho_visits (case_id, visit_date);

CREATE INDEX IF NOT EXISTS idx_ortho_events_case_id_created_at
    ON public.ortho_events (case_id, created_at);

-- 호출자의 권한과 RLS 정책으로 기반 테이블을 조회한다.
CREATE OR REPLACE VIEW public.v_upcoming_plans
WITH (security_invoker = true)
AS
SELECT
    v.id AS visit_id,
    v.case_id,
    c.patient_name,
    c.chart_no,
    c.stage_key,
    v.visit_date,
    v.progress,
    v.considerations,
    v.plan_next,
    v.plan_next_date,
    v.author,
    v.created_at
FROM public.ortho_visits AS v
JOIN public.ortho_cases AS c ON c.id = v.case_id
WHERE v.plan_next_date IS NOT NULL
  AND v.plan_next_date >= current_date
  AND c.deleted = false
  AND c.archived = false
ORDER BY v.plan_next_date ASC;

-- 이미 publication에 포함된 테이블은 duplicate_object 예외를 무시한다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication AS p
        JOIN pg_catalog.pg_publication_rel AS pr ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime'
          AND pr.prrelid = 'public.ortho_cases'::regclass
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ortho_cases;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication AS p
        JOIN pg_catalog.pg_publication_rel AS pr ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime'
          AND pr.prrelid = 'public.ortho_events'::regclass
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ortho_events;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication AS p
        JOIN pg_catalog.pg_publication_rel AS pr ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime'
          AND pr.prrelid = 'public.ortho_visits'::regclass
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.ortho_visits;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END;
$$;
