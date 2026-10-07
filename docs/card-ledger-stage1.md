# 카드 통합 원장 1단계 구현 메모

삼성·국민 승인과 취소를 공통 파서로 읽어 card_transactions에 기록하도록 구현했음. 하나카드는 표본 수집 자리만 마련했음. 가맹점 사전은 DB에 두며 같은 가맹점의 원장 편집값을 새 문자로 덮어쓰지 않음. 화면 편집·알림·월 대조는 2단계 범위임.

## 기록과 호환

- 성공한 카드 문자는 통합 원장과 기존 AI 이벤트 어디에도 원문을 저장하지 않음. 기존 AI 화면의 분류에는 새 card_merchant 열을 사용함.
- 읽기 실패 카드 문자만 card_sms_failed_raw에 30일 만료로 보관함. 중복 수신으로 만료를 연장하지 않음. pg_cron 설치 시 매일 정리하며 미설치 시 문자 수신 때 정리 함수를 호출함. 수신이 없는 환경에서 정확한 주기 정리가 필요하면 운영 반영 때 pg_cron 설치 여부를 확인해야 함.
- 기존 marketing_expense_events·ai_billing_events와 푸시 트리거를 유지했음. 새 원장 실패는 응답 card_ledger로 알림. 새 card_merchant 열 미설치 오류에는 해당 열을 빼고 기존 이벤트 쓰기를 재시도함.
- 기존 platform 라우팅을 유지함. 모든 카드만 모을 전용 수신은 platform=card_ledger로 보낼 수 있음. 이 경로는 기존 두 표에 쓰거나 외부 환율을 조회하지 않음. 실제 MacroDroid 설정은 바꾸지 않았음.
- 통합 원장의 USD는 1,500원 고정 추정값이며 fx_source=fixed_estimate임. 기존 AI 환율 경로는 유지했음. USD 외 외화의 원화액은 null이며 실제 명세서 대조 때 채워야 함.
- 취소는 원장 금액을 음수로 기록하고 같은 카드·통화·가맹점·금액의 미취소 승인이 하나일 때만 연결함. 여러 후보·이미 취소·대상 없음은 cancellation_review로 구분함.
- 기존 v12 동결 fixture를 기준으로 KRW 앞표시와 누적액 제외 처리를 실제 웹훅에도 보존했음. 동결 fixture는 수정하지 않았음.

## SQL과 백업 파일

db/card_ledger_v1.sql은 기존 테이블을 유지하는 추가 마이그레이션임. 되돌리는 SQL은 새 표나 card_merchant에 데이터가 있으면 데이터 보존을 위해 중단함. 운영 SQL은 실행하지 않았음. 로컬 PGlite에서 중복·취소 연결·권한 정책·만료 정리·재실행·빈 상태 되돌리기를 확인했음.

백업 변환은 다음 명령으로 실행할 수 있음. 출력 폴더는 절대경로로 지정해야 함.

```text
python scripts/import_card_sms_backup.py --source <읽기 전용 문자 XML> --out <시험·결과 폴더의 절대경로>
```

XML을 순회하며 SMS와 MMS 수신 시각을 먼저 읽고 공통 JS 파서로 전달함. 원문 중간 파일은 만들지 않음. CSV/JSON은 직접 table COPY용이 아닌 record_card_transaction RPC 입력 초안임. 시간순으로 전달하면 가맹점 ID와 취소 연결을 DB에서 채움. cancellation_pairs.json의 해시는 대조용임. 실제 적재는 실행하지 않았음.

이번 출력과 검증 로그는 초인종 일 폴더 work에 있음. 과거 성공 건 1,789건, SMS 1,741건·MMS 48건임. 실패 8건은 과거 0원 승인으로 적재에서 제외하고 원문도 복사하지 않았음. 운영 문자에서 같은 꼴을 받으면 실패 원문 정책이 적용됨. 정확한 통화별 합계와 월별 표는 import/summary.json과 monthly_summary.csv에 있음. 전체 원문을 저장하지 않는 파일이며 거래 정보는 포함됨.

## 검증 조건

Node 전체 tests/*.test.js와 Deno 전체 supabase/functions를 실행했음. 웹훅 시험의 환율은 합성 응답으로 대체했음. SQL 시험은 tests/sql/pglite-card-ledger.mjs임.

Deno 전체 검사는 외부 연결 없이 work/deno-cache와 deno-offline-importmap.json을 사용했음. 캐시에 없는 Supabase 2.110.9와 @2를 기존 설치 2.57.4로 시험에서만 연결했음. 운영 의존성 소스는 수정하지 않았으며 실제 2.110.9 전체 의존성 빌드는 이번에 검증하지 못했음. 웹훅의 기존·신규 핵심 시험은 import-map 없이도 실행했음.

## 저장소와 다음 단계

공용 .git이 잠금 밖이므로 work/repo-backup.git의 독립 Git 저장소에 feat/card-ledger-20261008 워크트리를 연결했음. 기준선은 source repository의 읽기 전용 origin/main 캐시 97281251e8ee242cf13ba3a0dcb848bea6967f43임. 공용 main·다른 일의 워크트리·운영 DB는 변경하지 않았음. 로컬 커밋과 bundle만 만들었으며 push하지 않았음.

다음에는 독립 검증, 하나카드 표본 보강, 가맹점 편집 화면, 즉시·주간 알림, 월별 명세서 대조를 이어갈 수 있음. 운영 반영은 별도 지시 뒤임.
