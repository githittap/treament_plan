# 구글 특별 영업시간 연동 — 직원허브 데이터 계약 (T8 → T2)

작성: 2026-11-23 · 고침 2026-11-25 · T8 9차 B · 상태: **운영 적용됨(2026-11-25)** — `db/holiday_gbp_sync.sql` → `db/holiday_editors_20261125.sql` → `db/holiday_fix_20261125b.sql` 순서로 운영 DB(texevhsxttfoqkrucfzl)에 적용, 허브 화면 main 배포.
**T2 연동 작업이 아직 없음**: 허브는 지금 「구글에 보낼 대상」을 기록만 하고 구글 영업시간은 바뀌지 않음. 허브 화면은 설정 `gbp.sync_live`(허브 설정, 기본 꺼짐)가 꺼져 있는 동안 「구글 자동 반영은 아직 연결 전입니다 — 지금은 기록만 됩니다」라고 안내하고, 월말 알림 창도 「허브에 기록만 됩니다」로 안내함.
**첫 가동 순서(스위치와 첫 반영이 서로 기다리지 않게)**: ① 스위치가 꺼진 상태에서 T2가 **미리보기 실행**(읽기·비교만, 구글에 쓰지 않음)을 하고 날짜마다 `p_action=noop, p_result=skipped`, `p_sent_value`에 보낼 값으로 기록 → ② 원장(또는 T8)이 허브 「구글 반영 기록」에서 확인 → ③ 원장 지시가 오면 T2가 `gbp.sync_live`를 `true`로 켜고(원장 설정 화면 또는 app_settings 한 줄) 바로 첫 실제 반영. 스위치가 꺼져 있는 동안에는 `set`·`clear`를 절대 하지 않음.
T2가 만들 일(**매월 1일 1회 + 원장이 「휴진 반영」이라고 지시할 때** — 원장 11-25 「매일 연동은 비효율, 매월 혹은 내가 지시시」 · 앞으로 60일, 구글 비즈니스 프로필 specialHours와 비교 후 패치)이 읽고 쓰는 약속만 적음. 구글 API 호출·n8n 작업은 T8이 안 만듦.

## 1. 한눈에
1. 매월 1일(또는 원장 지시 때) `gbp_special_hours_due(60)`를 부름 → 앞으로 60일 안에 구글로 보낼 날짜 목록이 옴.
2. 구글 specialHours와 비교해서 다르면 패치.
3. 날짜마다 결과를 `gbp_special_hours_log_write(...)`로 남김 → 허브 「구글 반영 기록」(원장·실장·매니저·데스크)에 최근 20건이 보임.

## 2. 읽기 — `public.gbp_special_hours_due(p_days int default 60)`
- 호출: service_role 키로 Supabase REST `POST /rest/v1/rpc/gbp_special_hours_due` 본문 `{"p_days":60}`(키는 환경변수 이름으로만 다룸, 값은 어디에도 적지 않음). 원장 로그인 세션도 호출됨(허브 확인용). 익명·직원·실장은 거절됨(42501/permission denied).
- 범위: 오늘(서울 기준 날짜) ~ 오늘+p_days일, **포함**. p_days는 0~366으로 잘림. 기본 60(2026-11-25 `db/holiday_editors_20261125.sql`에서 30→60).
- 대상: `holidays.sync_gbp = true`인 행만. 날짜 오름차순.
- 돌려주는 칸:

| 칸 | 뜻 |
|---|---|
| `date` | 대상 날짜(서울 달력 날짜, 시각 없음). **날짜당 최대 1행**(holidays의 기본키) |
| `closed` | true = 그날 종일 휴진(구글에 closed 로 보냄). false = 단축 진료(open_time~close_time 구간만 진료). **시각이 있으면 false, 없으면 true**(종류와 상관없음 — 공휴일 단축 진료도 false) |
| `open_time` · `close_time` | 단축 진료일 때만 값(`HH:MM:SS`). 휴진이면 둘 다 null. 항상 open_time < close_time(자정 넘김 없음). 시각이 비었거나 거꾸로인 단축 행은 함수가 아예 돌려주지 않음(되돌림 뒤 복원 전 상태 포함) |
| `name` | 사유(예: 학회 참석 휴진). 구글에는 안 보내도 됨, 기록·디버그용 |
| `kind` | 원래 종류: `지정휴일`(원장·실장이 올린 휴진) · `단축` · `공휴일` |
| `note` | 메모(없으면 null). 공휴일 시드는 「2027 공휴일 시드」 |

- 시간대: **모든 시각은 한국 표준시(Asia/Seoul, UTC+9) 현지 시각**. 구글 specialHourPeriod의 openTime·closeTime은 영업장 현지 시각이라 변환 없이 그대로 씀. `date`도 서울 날짜 그대로 startDate/endDate에 씀.
- 구글 매핑 제안: `closed=true` → `{startDate, endDate, closed:true}` · `closed=false` → `{startDate, endDate, openTime, closeTime}`(둘 다 같은 날). 최종 필드명은 T2가 GBP API 문서로 확인.
- **스위치가 먼저임(Sol 4차 B1)**: 매 실행 처음에 app_settings의 `gbp.sync_live`를 읽어 `'true'`가 아니면 구글에 **set·clear를 하나도 하지 않음**(읽기와 `noop` 기록만). 되돌림 SQL(db/holiday_gbp_sync_rollback.sql)은 이 스위치를 자동으로 끄므로, 되돌림→재적용→복원 사이에 목록이 잠깐 비어도 구글 날짜가 지워지지 않음. 복원 뒤 목록을 확인하고 다시 켬.
- **지우기는 이 연동이 넣은 날짜만**: `clear`는 이 기록표에 `set`·`ok`로 남은 날짜 중 지금 목록에 없는 날짜에만 함. 사람이 구글에 직접 넣은 날짜는 건드리지 않음.
- 「없는 날은 평소 시간」: 목록에 없는 날짜는 구글 쪽 특별 영업시간이 없어야 맞음. 창(오늘~+60일) 안의 구글 특별 영업시간 중 목록에 없는 날짜는 `clear`로 지우는 것이 원칙(T2가 정함). 창 밖 날짜와 이 연동이 안 넣은 항목은 건드리지 않는 쪽 권장. 지금 구글 특별 영업시간은 비어 있음.
- 허브에서 행을 **삭제하거나 「구글에 보내기」를 끄면** 목록에서 사라짐 → 구글에 이미 올라간 날짜는 `clear`로 되돌려야 함(되돌리는 법 = 허브에서 행을 끄거나 지우고 다음 실행을 기다림).
- 병원이 공휴일에도 진료하는지 원장 확인 전이라 `공휴일` 행은 기본 `sync_gbp=false`(목록에 안 옴). 원장이 날짜별로 켜면 그날부터 옴.

## 3. 쓰기 — `public.gbp_special_hours_log_write(...)`
- service_role만 실행. 직원·익명·원장 로그인 세션은 거절됨. 표 `gbp_special_hours_sync_log`에는 직접 insert 못 함(함수로만).
- 호출: `POST /rest/v1/rpc/gbp_special_hours_log_write`

| 인자 | 뜻 |
|---|---|
| `p_holiday_date` | 대상 날짜(date). 실행 전체 오류처럼 날짜가 없으면 null |
| `p_action` | `set`(구글에 이 날짜를 넣음/바꿈) · `clear`(구글에서 이 날짜를 지움) · `noop`(이미 같아서 안 고침) · `error`(실패). 그 밖의 값은 거절 |
| `p_sent_value` | 구글에 보낸 값(jsonb, 20KB 이하). 예: `{"startDate":"2026-12-04","openTime":"09:00","closeTime":"13:00"}`. 안 보냈으면 null |
| `p_result` | `ok` · `failed` · `skipped`(예: 승인 전·점검 중이라 건너뜀). 기본 ok |
| `p_error` | 실패 사유(2000자까지 자름). 성공이면 null. 비밀값·토큰은 절대 넣지 않음 |
| `p_created_by` | 작업 이름(기본 `gbp-sync`, 60자까지) |

- 돌려주는 값: 새 기록 id(bigint).
- 한 날짜당 한 줄이 원칙(성공이든 noop이든 이번 실행에서 확인한 날짜를 남기면 원장 화면에서 「확인됨」을 볼 수 있음). 실행마다 noop을 전부 남기면 최근 20건이 noop으로 채워지므로 **noop은 실제로 비교했을 때 기록이 필요할 때만**(예: 실행 1번에 1줄 요약은 `p_holiday_date=null, p_action=noop`) 권장.
- 허브 화면(원장·실장)이 이 표를 최근 20건 읽음. 직원 화면에는 안 보임.

## 4. 허브 쪽 바뀐 것(참고)
- `holidays` 새 칸: `open_time` · `close_time` · `sync_gbp`(기본 true, 기존 공휴일 행은 false) · `note` · `updated_at` · `updated_by`.
- 「단축」은 쉬는 날이 아님: 연차 일수·월차 결근 후보·공휴일 근무 보기·노무사 회신 공휴일 집합에서 단축 행을 휴일로 세지 않도록 같이 고침(PGlite 시험 있음).
- 2027년 공휴일 24일 시드(`db/holidays_2027_public_seed.sql`): 근거 우주항공청 월력요항(2026-06-29). 전부 `sync_gbp=false`. 설날 2027-02-06~08 + 대체공휴일 02-09, 추석 09-14~16(대체 없음), 노동절·제헌절 포함. 운영 미적용.
- 공휴일 행(병원은 365일 진료 · 원장 11-25): `sync_gbp=false` → 평소대로 진료(목록에 안 나옴, 구글 그대로) · `sync_gbp=true`+시각 → 단축 진료(`closed=false`) · `sync_gbp=true`+시각 없음 → 휴진(`closed=true`). 공휴일은 연차·급여의 휴일 기준이라 종류는 그대로 둠. 2026-11-25부터 `sync_gbp` 기본값은 false(전송 여부를 안 적은 행은 안 보냄).
- 입력 화면: 허브 캘린더 아래 「🏥 병원 휴진·단축 진료」 카드(원장·실장·매니저·데스크 — 원장 11-25 · 매니저·데스크는 휴진(지정휴일)·단축을 넣고 고치고 지움 · 공휴일 행은 「진료 방식」만 고침, 공휴일 추가·삭제·날짜·이름은 원장·실장만). 매달 마지막 월요일부터 말일까지 이 사람들이 허브를 열면 「다음 달 휴진·단축 진료 입력」 알림 창이 뜸(설정 `hgbp.remind_on`, 기본 켬). 병원은 365일 진료라 공휴일 행은 `sync_gbp=false`(구글로 안 보냄)가 기본. 글은 허브 설정 › 글 고치기에서 원장이 고침(키 접두 `hgbp.`).

## 4b. 휴진을 바꿀 때의 안전장치(DB 트리거 `holidays_guard_status_change`)
- 어떤 날짜의 「쉬는 날」 여부(휴진·공휴일 행이 있는지)가 바뀌는 저장(행 추가·삭제·휴진↔단축 전환·날짜 변경)은 아래를 따름. 오류는 안정된 코드 문자열로 나오고 화면이 글(`hgbp.err_leave_conflict`·`hgbp.err_month_closed`)로 바꿔 보여 줌.
  1. 그날을 지나는 승인·대기(대기·1차승인·승인) 연차(연차·기타)가 있으면 `holiday_conflicts_leave`로 거절 → 연차 「날짜 바꾸기」로 먼저 조정한 뒤 다시 저장.
  2. 그날의 기존 근태 `attendance.is_holiday`를 같은 트랜잭션에서 새 상태로 고침(휴일근로·급여 회신이 새로 계산한 값과 같아짐). 그 달이 이미 확정(`att_months.status='확정'`)이고 바뀔 근태가 있으면 `holiday_month_closed`로 거절.
- 시드·SQL 편집기처럼 충돌이 없으면 그대로 적용됨. 충돌하는 날짜가 있으면 그 문장에서 멈추므로 연차를 먼저 조정.

## 4c. 되돌리기와 복원
- `db/holiday_gbp_sync_rollback.sql`은 새 칸·기록 표를 지우기 **전에** `holidays_gbp_backup_20261123`(holidays 전 행의 새 칸 값)과 `gbp_special_hours_sync_log_backup_20261123`(기록 전체)에 복사하고, 백업 표는 되돌린 뒤에도 남김(RLS 켜고 직원·익명 접근 없음, 서비스 롤·SQL 편집기만 봄). 백업 삭제는 원장 승인 뒤에만.
- 되살리기: `db/holiday_gbp_sync.sql` 다시 적용 → `db/holiday_gbp_sync_restore.sql` 실행(날짜·종류가 같은 행의 시각·전송 여부·메모·수정 기록과 반영 기록 전체를 되돌림, 여러 번 실행해도 같음).
- 옛 「단축」 행의 시각이 롤백으로 사라진 채 다시 적용해도 막히지 않도록 시각 검사 제약은 `not valid`(이미 있던 행은 면제, 새로 넣거나 고치는 행은 검사)로 만듦.

## 5. 파일
- `db/holiday_gbp_sync.sql`(적용) · `db/holiday_gbp_sync_rollback.sql`(되돌리기, 백업 남김) · `db/holiday_gbp_sync_restore.sql`(백업에서 복원)
- `db/holidays_2027_public_seed.sql` · `db/holidays_2027_public_seed_rollback.sql`
- 시험: `tests/holiday-gbp-sync.test.js` · `tests/sql/pglite-holiday-gbp-sync.mjs`

## 배포 순서

1. `db/holiday_gbp_sync.sql` 적용(재적용해도 원장이 켠 「구글에 보내기」는 그대로) → `db/holiday_editors_20261125.sql` → `db/holiday_fix_20261125b.sql` 적용  2. `hr.html` 배포  3. (T2) 위 「첫 가동 순서」대로 미리보기 실행 → 원장 확인·지시 → `gbp.sync_live`를 `true`로 켜고 첫 실제 반영.
되돌릴 때는 `hr.html` 먼저, 그다음 `db/holiday_gbp_sync_rollback.sql`. 달력·첫 화면은 새 칸이 없으면 옛 칸(`date,name,kind`)으로 다시 읽어 깨지지 않음.

## 되돌리기 순서(2026-11-25)
1. `db/holiday_fix_20261125b_rollback.sql` → 2. `db/holiday_editors_20261125_rollback.sql` → 3. `db/holiday_gbp_sync_rollback.sql`. 기반 롤백(3)만 돌려도 1·2에서 더한 권한·트리거를 함께 걷음. 모든 롤백은 먼저 `gbp.sync_live`를 끔.
- 다시 적용한 뒤 `db/holiday_gbp_sync_restore.sql`로 되살림 — 그 사이에 새로 쓴 기록이 백업과 같은 번호를 차지했으면 새 기록을 뒤 번호로 옮기고 백업 기록을 원래 번호로 넣음.
- 근태 `attendance.is_holiday`는 2026-11-25부터 DB가 holidays 표로 직접 정함(`attendance_set_is_holiday`) — 근태 업로드와 휴진 입력이 동시에 일어나도 같은 날짜 잠금으로 어긋나지 않음.
