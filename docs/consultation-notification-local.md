# 카카오·당근 알림 → 기존 문의함: 로컬 연결 계약

이 문서는 코드에 추가된 수신 형식만 설명한다. 운영 Edge 배포, 비밀값 등록, 원장 휴대폰 설정은 아직 하지 않았다.

1. 기존 고객 알림 수집 매크로와 계좌연동 매크로는 그대로 둔다. 카카오 파트너센터와 당근에 각각 **새 MacroDroid 매크로**를 만든다.
2. 새 매크로는 알림 도착 시 `POST /functions/v1/consultation-notification?source=kakao` 또는 `?source=daangn`으로 HTTP 요청을 보낸다. 요청 본문은 **알림 텍스트 원문**이며 JSON으로 조립하지 않는다.
3. 헤더 `X-Webhook-Token`은 원장 금고의 해당 토큰을 기기 설정에서 참조한다. 값은 코드·문서·로그에 적지 않는다. 서버는 `public.webhook_secrets`의 `consultation_notification_sha256` 해시와 비교한다. 헤더 `X-Event-Id`에는 알림마다 고유하고 재시도 때 같은 1~160자 ID를 넣는다. 영문·숫자·점·밑줄·콜론·하이픈만 허용한다. 기기에서 이 값을 안정적으로 만드는 방법은 실기기 설정 때 확인해야 한다.
4. 수신 함수는 토큰·출처·ID·본문을 확인한 뒤 기존 `consultation_inbox_ingest_service`만 호출한다. 같은 출처와 ID의 재시도는 기존 문의 한 줄에 합쳐진다. 출처는 카카오 `kakao`, 당근 `daangn`으로 보존된다. 본문은 최대 4000자다.

톡톡은 기존 `navertalk-webhook`·`consultation_inbox_navertalk_source_draft.sql`·`consultation_inbox_ingest_role_check_patch.sql` 경로를 쓴다. 상담일지 전환은 기존 `consultation_inbox_convert_to_journal`이 내용 복사와 `converted` 상태 변경을 같은 트랜잭션에서 처리한다. 홈페이지 메일은 D-4 결정 뒤 진행한다.

운영 전 확인: 금고에서 알림 토큰 준비, 대응 해시를 기존 `webhook_secrets`에 등록, Edge 함수와 톡톡 관련 SQL 적용, 새 폰 매크로의 실제 알림 전송, 카카오·당근·톡톡 각각 중복 재전송 및 10분 이내 수신 실측. 운영 행·환자 실자료를 로컬 시험에 쓰지 않는다.
