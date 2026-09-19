# 직원 허브 건의함 설계서

작성일: 2026-09-19
상태: 사용자 최종 승인 후 구현
대상: treament_plan/hr.html 및 건의함 전용 Supabase 객체

## 1. 목표

직원 허브에 💡 건의함 탭을 추가한다. 하나의 월간 캠페인 동안 모든 직원이 아이디어를 한 건 게시하고 서로 열람하며 좋아요를 누를 수 있게 한다. 게시글 수와 받은 좋아요 수는 자동 집계하되 좋아요를 자동 순위로 사용하지 않는다. 원장만 독창성 점수·평가 메모·최종 순위를 관리하고, 캠페인 종료 후 전 직원에게 확정된 1·2·3등과 상금을 공개한다.

상금은 1등 50,000원, 2등 30,000원, 3등 10,000원이다. 지급 기능은 구현하지 않고 안내만 표시한다.

## 2. 확정 UX·업무 규칙

- staff, manager, chief, owner 모두 탭 열람·작성 가능하며 게시자 이름은 공개한다.
- 캠페인당 직원 한 명은 게시글 하나만 작성한다.
- 직원당 게시글 하나에 좋아요 1회만 가능하고 다시 누르면 취소한다.
- 자기 글에는 좋아요를 추가할 수 없다.
- 게시글 수·받은 좋아요 수는 자동 집계한다. 좋아요는 참고자료이며 자동 순위 결정에 사용하지 않는다.
- owner만 독창성 점수 1~5, 평가 메모, 최종 순위 1~3을 관리한다.
- 캠페인 시작일·종료일·상금은 owner가 수정한다. 초기 캠페인은 적용일 기준 한 달로 생성한다.
- 진행 중 작성자는 자신의 글을 수정·삭제할 수 있고 owner는 부적절한 글을 관리할 수 있다. 종료 후 작성자의 수정·삭제는 막는다.
- 종료 후 수상 순위·게시자·제목·상금 안내만 전 직원에게 공개한다. 평가 점수·메모·reviewer_id는 공개하지 않는다.
- 지급 버튼·지급 상태·송금 연동은 만들지 않는다.
- 조회·저장·좋아요·평가 실패는 빈 화면 또는 성공으로 위장하지 않고 오류를 표시한다.
- 노션 매뉴얼 이관은 범위 밖이다.

## 3. 데이터 모델

### suggestion_campaigns

id bigint identity primary key, title text, starts_at date, ends_at date, prize_1/prize_2/prize_3 numeric(12,0), created_by uuid, created_at/updated_at timestamptz를 둔다. 시작일은 종료일 이하이고 상금은 0 이상이다. 초기 SQL은 테이블이 비어 있을 때만 현재 날짜부터 현재 날짜 + 1개월 - 1일의 캠페인을 한 건 삽입한다. 기존 캠페인·기존 데이터는 수정·삭제하지 않는다.

### suggestions

id bigint identity primary key, campaign_id bigint references campaigns on delete cascade, user_id uuid references profiles, title/body text, created_at/updated_at timestamptz를 둔다. (campaign_id, user_id) unique로 캠페인당 1인 1글을 DB에서 보장한다.

### suggestion_likes

suggestion_id와 user_id의 복합 primary key, 부모 행 cascade foreign key, created_at timestamptz를 둔다. 복합키가 직원당 게시글당 1회를 보장한다.

### suggestion_reviews

id bigint identity primary key, campaign_id, suggestion_id, originality_score integer 1~5, review_note text, award_rank integer 1~3 nullable, reviewer_id uuid, created_at/updated_at timestamptz를 둔다. (campaign_id, suggestion_id) unique로 글당 평가 한 건을 보장하고, award_rank가 null이 아닐 때 캠페인별 순위 중복을 partial unique index로 막는다.

### 종료 후 공개 view

suggestion_awards_public security-invoker view는 종료일이 지난 캠페인의 award_rank가 있는 행만 반환한다. 반환 컬럼은 campaign_id, suggestion_id, award_rank, title, user_id, ends_at, prize_amount로 제한한다. 점수·메모·reviewer_id는 view에 포함하지 않는다. view가 private review 행을 직접 읽지 않도록 공개 ID·순위만 담은 suggestion_awards_public_rows 보조 테이블을 두고, 원본 suggestion_reviews는 owner만 직접 조회한다.

## 4. RLS·권한

Supabase Data API의 grant와 RLS를 함께 적용한다. 네 테이블 모두 RLS를 활성화하고 anon grant·anon policy는 만들지 않는다.

- 캠페인: authenticated select, owner insert/update. update는 USING과 WITH CHECK 모두 owner role이다. delete는 제공하지 않는다.
- 게시글: authenticated select. insert는 user_id=auth.uid()이고 현재 날짜가 캠페인 기간 안일 때만 허용한다. 작성자 update/delete는 진행 중 자기 글만, owner delete는 전 기간 허용한다. authenticated update grant는 title, body 컬럼으로 제한하여 작성자가 campaign_id·user_id·집계 필드를 바꾸지 못하게 한다. update에는 USING과 WITH CHECK를 모두 둔다.
- 좋아요: authenticated select. insert는 user_id=auth.uid(), 캠페인 진행 중, 게시글 작성자와 현재 사용자가 다를 때만 허용한다. delete는 자기 행이며 캠페인 진행 중일 때만 허용한다.
- 평가: suggestion_reviews select/insert/update/delete는 owner만 허용한다. 종료 후 전 직원은 제한 view로만 수상 정보를 읽는다.
- service_role·secret 키는 프런트 코드에 넣지 않는다.

## 5. 화면 설계

TABS에 key suggestions, label 💡 건의함, 네 역할을 추가하고 라우터는 renderSuggestions(m)을 호출한다.

상단에는 캠페인 제목·기간·진행 상태·상금 안내를 표시한다. 진행 중이면 제목·본문 입력과 게시 버튼을 표시하고, 본인 글이 있으면 편집 모드로 전환한다.

게시글 카드에는 게시자 이름, 제목·본문, 게시일, 받은 좋아요 수, 현재 사용자의 좋아요 여부를 표시한다. 자기 글의 좋아요는 비활성화하고 진행 중 본인 글에는 수정·삭제를 제공한다. 종료 후에는 작성자의 수정·삭제를 숨긴다.

owner에게는 캠페인 기간·상금 수정 폼과 각 글의 점수·평가 메모·1·2·3등 선택을 제공한다. 순위 중복·점수 범위·저장 오류는 화면에 표시한다. owner는 진행 중·종료 후 모두 부적절한 글을 삭제할 수 있다.

종료 후에는 제한 view에서 읽은 수상 순위·게시자·제목·상금만 표시하고 지급 기능 없음 안내를 표시한다. 종료 전에는 수상 영역을 표시하지 않는다.

정상 빈 상태는 활성 캠페인 없음, 아직 등록된 건의가 없음으로 구분한다. 캠페인·게시글·좋아요·평가 조회 오류와 mutation 오류는 각각 화면에 표시한다.

## 6. 집계

게시글 수는 현재 캠페인의 suggestions 행을 그룹화해 계산한다. 받은 좋아요 수는 suggestion_likes를 게시글별로 그룹화한다. 사람별 게시글 수·받은 좋아요 수도 같은 행 집계로 계산한다. 자동 순위 계산 함수는 만들지 않는다.

## 7. 테스트

자동테스트는 다음을 검증한다.

- 탭 라벨·라우터 키, 캠페인 날짜·상금 표시
- 캠페인당 1인 1글, 작성자 진행 중 수정·삭제, 종료 후 차단
- 좋아요 toggle, 자기 글 좋아요 금지, 중복 좋아요 방지
- 게시글 수·받은 좋아요 수·사람별 집계
- owner만 점수·메모·순위 관리
- 종료 전 비공개, 종료 후 순위·이름·제목·상금만 공개
- 조회·저장 실패가 빈 상태·성공으로 위장되지 않음

SQL 정적 테스트는 네 테이블 RLS, anon 차단, authenticated grant, owner policy, auth.uid 기간 조건, UPDATE USING/WITH CHECK, 자기 글 좋아요 금지, 순위 partial unique index, 공개 view의 민감 필드 제외를 검증한다.

라이브 적용 후 읽기 쿼리로 테이블·컬럼·제약·인덱스·RLS·정책·grant·초기 캠페인·view를 확인하고 기존 profiles·leave_requests 등의 행 수 불변을 확인한다. security advisor에서 기존 경고와 신규 경고를 구분한다.

## 8. 범위 밖·자체검토

노션 이관, 자동 순위, 상금 지급, 알림, 익명 게시글, 다중 캠페인 동시 운영 UI, 기존 데이터 수정·삭제, push·deploy는 범위 밖이다.

승인된 참여·좋아요·집계·owner 평가·종료 후 공개·상금 안내를 모두 포함했다. 평가 원본과 공개 수상 view를 분리했고 RLS·grant·기간·owner 조건·오류 상태를 명시했다.
