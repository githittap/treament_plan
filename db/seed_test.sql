-- 치과 교정 케이스 보드 테스트 데이터
-- ★테스트 접두어의 기존 케이스를 지운 뒤 다시 생성하므로 재실행 가능하다.

DELETE FROM public.ortho_cases
WHERE patient_name LIKE '★테스트%';

DO $$
DECLARE
    case_a_id uuid;
    case_b_id uuid;
BEGIN
    -- 케이스 A: 배송중. 트리거가 appt_target_date를 배송요청일 + 21일로 설정한다.
    INSERT INTO public.ortho_cases (
        patient_name,
        chart_no,
        diagnosis,
        case_type,
        stage_key,
        start_date,
        fee_dx_amount,
        fee_dx_paid_at,
        fee_half_amount,
        fee_half_paid_at,
        depositor_name,
        ship_requested_at,
        tracking_no,
        ship_status,
        staff,
        next_action,
        next_due,
        memo
    ) VALUES (
        '★테스트 홍길동',
        'TEST-ORTHO-001',
        '총생 및 전치부 반대교합 테스트',
        '슈어스마일',
        'stage06',
        current_date - 35,
        300000,
        current_date - 30,
        1500000,
        current_date - 14,
        '홍길동',
        current_date - 7,
        'TEST123456789',
        '배송중',
        '테스트직원',
        '배송 도착 확인 후 장착 예약',
        current_date + 14,
        '배송 및 예약목표일 트리거 확인용 케이스'
    )
    RETURNING id INTO case_a_id;

    INSERT INTO public.ortho_events (case_id, kind, body, author)
    VALUES
        (case_a_id, 'pay', '진단비 및 50% 입금 확인', 'test.staff@example.com'),
        (case_a_id, 'stage', '제작 완료 후 배송중 단계로 이동', 'test.staff@example.com'),
        (case_a_id, 'call', '배송 후 장착 예약 안내 통화', 'test.staff@example.com');

    INSERT INTO public.ortho_visits (
        case_id,
        visit_date,
        progress,
        considerations,
        plan_next,
        plan_next_date,
        author
    ) VALUES
        (
            case_a_id,
            current_date - 28,
            '구강스캔 및 진단자료 채득',
            '배송 일정 확인 필요',
            '장치 도착 후 첫 세트 전달',
            current_date + 14,
            'test.staff@example.com'
        ),
        (
            case_a_id,
            current_date - 14,
            '치료계획 최종 확인',
            '부착물 위치 재확인',
            '배송상태 확인 전화',
            current_date + 3,
            'test.staff@example.com'
        );

    -- 케이스 B: 진단비 대기 및 조기 처방논의.
    INSERT INTO public.ortho_cases (
        patient_name,
        chart_no,
        diagnosis,
        case_type,
        stage_key,
        early_rx,
        early_rx_note,
        start_date,
        fee_dx_amount,
        staff,
        next_action,
        next_due,
        memo
    ) VALUES (
        '★테스트 김영희',
        'TEST-ORTHO-002',
        '상악 전돌 및 공간 부족 테스트',
        '슈어스마일',
        'stage02',
        true,
        '성장기 치료 시점 조기 논의 필요',
        current_date - 3,
        300000,
        '테스트직원',
        '진단비 입금 확인',
        current_date + 2,
        '진단비 대기 및 early_rx 확인용 케이스'
    )
    RETURNING id INTO case_b_id;

    INSERT INTO public.ortho_events (case_id, kind, body, author)
    VALUES
        (case_b_id, 'call', '진단비 및 향후 일정 안내', 'test.staff@example.com'),
        (case_b_id, 'note', '조기 처방논의 플래그 설정', 'test.staff@example.com');

    INSERT INTO public.ortho_visits (
        case_id,
        visit_date,
        progress,
        considerations,
        plan_next,
        plan_next_date,
        author
    ) VALUES (
        case_b_id,
        current_date - 3,
        '초진 상담 및 파노라마 촬영',
        '성장 상태를 고려해 처방 시점 논의',
        '진단비 확인 후 원장 처방논의',
        current_date + 7,
        'test.staff@example.com'
    );
END;
$$;
