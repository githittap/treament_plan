# 직원허브 확정 결정

## 최신 결정 — 상담문의 일원화 1차 운영 반영과 외부 연동 보류 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | 통합 문의함의 DB·Edge·공개본 반영을 완료 상태로 기록한다. | migration `employee_hub_consultation_inbox_20260922` success, 실제 중복 ingest 1행/rollback PASS, Edge v1 ACTIVE·`verify_jwt=true`, no-auth/위조 JWT 401, `f28379f` main push, Pages run `35699819135` build/deploy success 및 공개 HTTP/표식 확인을 근거로 한다. |
| 2026-09-22 | 외부 문의 connector·자동 회신·평문 secret은 계속 보류한다. | Kakao Developers 채널 webhook은 1:1 상담 수신 API가 아니고, 당근 공개 채팅 수신 API는 미확인, Naver IMAP 993은 별도 서버 자격증명이 필요하다. 공식 API·자격증명·별도 승인 전에는 구현하지 않는다. |
| 2026-09-22 | 실제 Auth 계정 영구삭제는 선택하지 않고 기록보존형 영구 접속차단을 유지한다. | 감사·기록 보존을 우선하는 의도된 안전 대체이며, 계정 삭제 완료로 기록하지 않는다. |

## 최신 결정 — 상담문의 일원화 1차의 연동 경계 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | 문의 수집의 공통 저장소와 수기 접수만 1차에 구현한다. | `consultation_inbox`와 원자 전환 RPC는 로컬 검증했다. 외부 connector·자동 회신·평문 secret은 구현하지 않는다. |
| 2026-09-22 | 외부 수신은 공식 API·자격증명·별도 승인 후에만 검토한다. | Kakao Developers 채널 webhook은 채널 추가/차단용이고 1:1 상담 수신이 아니다. 당근 공개 채팅 수신 API는 미확인, Naver IMAP 993은 별도 서버 자격증명이 필요하다. |

## 최신 결정 — Task11 문서화 종료와 다음 활성 범위 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | Task11 문서화를 완료 상태로 기록한다. | 결과보고서=`Z:\11_codex\00_결과보고서\직원허브_구현결과보고서_2026-09-22.html`, SHA256 `7AACA57558B9D6F6CEE9EB35E4781C1205CEA4217DF70BB5F5AC7E0C48A748F4`; 사용설명서=`Z:\11_codex\03_병원운영·전산\직원허브_수정지침_시안\직원허브_사용설명서.docx`, SHA256 `9CB2DB42EB8C78E2E43F4375C7E5F7F3CD47EB14A4234434BB9AA4B3F81E2B07`. |
| 2026-09-22 | 사용설명서는 조건부 인도로 유지한다. | Sol High HTML/content/OOXML/a11y/privacy PASS. 번들 LibreOffice 부재로 전 페이지 PNG visual QA는 미실행이며, 실제 4역할 로그인·저장/재조회와 실제 직원 데이터·메일·Push·생체정보는 미검증·금지다. |
| 2026-09-22 | 최초 `직원허브 수정 지침.zip`의 외부자료 없이 가능한 승인 범위는 종료한다. | Task10 기록 커밋 `41327995d523e6583db14db4840e5628052d20e0`는 `origin/main` push 완료, 최신 Pages run `35666985589` success. 기능 배포 `eeac4f2`·run `35640892992`는 역사 증거로 보존한다. |
| 2026-09-22 | 다음 활성 범위는 `직원허브 5차.zip` 원본 보존·해시·인벤토리·요구 대조다. | 아직 열람·구현하지 않는다. `상담문의 등 일원화.zip`은 직원허브 5차 완료 뒤 별도 후속이다. |

## 최신 결정 — Task10 배포 정본과 미검증 경계 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | Task10을 배포 및 공개 smoke 완료로 기록한다. | `main`=`eeac4f2d9827f01764be66f8616717b732623fd0`, Pages run `35640892992` success, 두 공개 URL HTTP/표식 확인, CDP reload 오류·실패·Log error/warn 0건, JS 24/24·PGlite 9/9·인라인 구문·diff check PASS. |
| 2026-09-22 | 실제 4역할 로그인·저장/재조회는 완료로 주장하지 않는다. | 시험 계정·자격증명 없이 실제 데이터·메일·Push·생체정보를 사용하지 않았다. 프론트 롤백은 `4865f89`, DB 롤백은 별도 증거 게이트를 유지하며 다음은 Task11 설명서다. |

## 최신 결정 — Task7·Task8 운영 완료 후속 순서 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | Task7·Task8 운영 migration을 완료 상태로 기록한다. | Task7 `employee_hub_push_subscriptions_v6_20260922`: PG17.6, rows=0, RLS, policy 4개, trigger 1개, constraints 5개, canonical `4f7a3ffc459b04e0a3c87ea8dfda8c28`, advisor 0건. Task8 `employee_hub_attendance_owner_chief_gate_20260922`: marker 1건, FORCE RLS·역할 SELECT 없음, `prosrc=08d9fa62fcc82616dd9f7cb3f8ebafac`, chief gate=true·old bypass=false, entries=8·history=9 보존, Task7 canonical 유지. private marker no-policy INFO는 deny-all 의도다. |
| 2026-09-22 | 다음 작업은 Task9 → Task10 → Task11 순서로 한다. | Task9 메뉴 도움말 → Task10 단계배포·최종인수 → Task11 보고서·설명서. 실제 직원 Push·실기기·VAPID는 미수행·금지, `직원허브 5차.zip`은 미열람, `상담문의 등 일원화`는 별도 후속이다. |

## 최신 결정 — Sol High 7차 Minor 1 stale 문서 보완 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | overview/todos의 6차 대기 상태를 7차 결과와 8차 대기로 정정한다. | 7차 코드 안전성 PASS에도 두 stale 줄 때문에 Minor 1 FAIL했다. 이번 변경은 기록-only다. |
| 2026-09-22 | Task7/Task8 production은 Sol High 8차 문서 대조 PASS 뒤 PG17 읽기 전용 preflight를 거친다. | 순서는 preflight → Task7 적용/검증 → Task8 적용/검증이며 push·배포는 여전히 범위 밖이다. |

## 최신 결정 — Sol High 6차 Minor 1 기록 동기화 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | `e607ff6`의 exact equality·전체 시험 PASS를 기록 정본에 반영한다. | 6차는 기능·전체 시험 PASS였으나 이 커밋의 기록 미기재로 Minor 1 FAIL했다. 이번 변경은 기록-only다. |
| 2026-09-22 | Task7/Task8 production은 Sol High 7차 최종 문서 대조 PASS 전 미적용이다. | 운영 DB/apply, push, deploy는 이번 범위 밖이다. |

## 최신 결정 — Sol High 5차 Minor 2 보완 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | rollback 오류 8건은 PGlite `Error.message` 전체를 동등 비교한다. | 기능·독립 시험 PASS에도 partial match는 접두·접미 변화를 놓친다. targeted JSON 4종과 `95c296d` 복원 4건은 하나의 `exact` 상수로 고정하며 4차 FAIL 이력은 유지한다. |
| 2026-09-22 | Task7/Task8 production은 Sol High 6차 PASS 전 미적용이다. | 5차는 기록 미동기·exact assertion Minor 2 FAIL이며, 이번 보완은 테스트·기록만이다. |

## 최신 결정 — Sol High 4차 FAIL 보완 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | 원본 rollback의 기존 데이터 보호 4건을 영구 회귀로 복원한다. | 4차 FAIL의 대상은 빈 DB, existing profile 없음, 유효 row, endpoint same-name CHECK(true)이며 targeted JSON CHECK 4종은 유지한다. 원본 `rollbackError(db)`의 정확 오류와 행/객체 보존을 검증하고 preflight 삭제 변형은 금지한다. |
| 2026-09-22 | Task7/Task8 production은 독립 재검증 PASS 전 계속 미적용이다. | 이번 보완은 테스트·기록만이며 운영 DB, push, 배포를 수행하지 않는다. |

## 최신 결정 — Task6/7/8 운영 순서 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | Task6 production migration을 완료로 기록한다. | `employee_hub_notice_attachments_deposit_access_20260921` 적용 후 `notices=1`·`deposits=264` 보존, private `notice-attachments` 10MB/6 MIME/objects=0 확인. Storage API 실제 업로드는 자격증명 없이 미검증이다. |
| 2026-09-22 | Task7 첫 production apply 실패는 운영 변경 없는 rollback으로 고정한다. | fixed canonical mismatch에서 transaction rollback됐다. Sol High 첫 독립 검증은 HEAD `39604f8`에서 Important 6건 FAIL했고, 이 판정은 삭제하지 않는다. |
| 2026-09-22 | Task7 v6·Task8 보완의 상위 재실행 PASS는 최종 독립 검증 PASS가 아니다. | Task7 `fa61fb2`는 v6 fingerprint/manifest/hash/MD5 및 rollback·endpoint·policy/JSON gate를 보강했다. Task8 `77d0f11`·`33d8491`·`2ad9341`은 default 의미·new `prosrc` MD5·동시 self-spoof 음성시험을 보강했다. |
| 2026-09-22 | Sol High 2차 FAIL 이력을 보존한다. | HEAD `c38964a`에서 Important 2·Minor 1 FAIL: endpoint backslash 2개, JSON probes 위양성, 기록 상세 모순. Task7 원본 rollback/policy 및 Task8 default/self-spoof는 PASS였다. |
| 2026-09-22 | `a521d1b`의 로컬 회귀 PASS는 3차 독립 재검증 PASS가 아니다. | dot escape 1개·dotted FCM/Mozilla 허용·JSON drift 4종 독립 fixture/목표 probe·rollback reject 및 객체 보존을 보강했고 상위 재실행 Task7/Task8/push는 PASS다. |
| 2026-09-22 | Sol High 3차 FAIL 이력을 보존한다. | HEAD `771ccf5`에서 Important 1·Minor 1 FAIL: 운영 SQL 새 결함 없음, tests/sql 원본 rollback preflight 제거로 정확 목표 증거 부족, 기록 과장. |
| 2026-09-22 | `4dec81f`의 상위 재실행 PASS는 4차 독립 재검증 PASS가 아니다. | 테스트만 수정해 same-name targeted CHECK 4종의 원본 rollback·정확 오류·private schema/public table 보존을 고정했다. |
| 2026-09-22 | Sol High 4차 재검증 PASS 전 Task7/Task8 production 적용을 금지한다. | 같은 Sol 재검증 PASS 후에만 Task7 apply/verify → Task8 apply/verify → 승인된 단계배포·실사이트 확인으로 진행한다. 실제 직원 메일·Push·생체입력, 자격증명, 원본 삭제, 대량 이관, 보안 완화, 새 비용도 금지한다. |

## 최신 결정 정정 — Task 6 Sol High PASS (2026-09-21)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-21 | Task 6 로컬 보안 구현은 Sol High 최종 PASS다. | HEAD `d0222684dd7da4607752c22b2912ad8bf4f0d87a`; Critical/Important/Minor 없음, 직접 Node 30개·PGlite·인라인 JS·diff check PASS, clean worktree. |
| 2026-09-21 | 운영 적용은 별도 검증 후 단일 migration으로만 한다. | 실제 Storage DELETE/ALL 정책·ACL·RLS·버킷/객체 snapshot, 시험계정 upload/download/cleanup/게시 후 DELETE 거부/MIME·10MB, 복제환경 rollback이 선행 조건이다. |
| 2026-09-21 | K3와 5차 ZIP은 현재 범위에서 제외한다. | BUSD MCP_INTERNAL_ERROR·managed Kimi 403 해결 및 사용자 연결 완료 전 Terra 유지; `직원허브 5차.zip`은 기존 승인 미완료 뒤 열어 원본 보존·요구 대조한다. |

## 과거 결정 정정 — Task 6 Sol High FAIL (2026-09-21)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-21 | Task 6은 최종 Sol High FAIL이며 배포를 차단한다. | `storage.foldername(name)`에서 `uid/tmp/file`은 `[uid,tmp]` 길이 2인데 SQL이 길이 3을 요구한다. 실제 업로드/cleanup DELETE가 RLS 거부되며 기존 PGlite helper는 파일명 포함 위양성 모사였다. |
| 2026-09-21 | 성공 첨부의 tmp 잔류를 허용하지 않는다. | `uid/tmp/...`에 게시 첨부가 남으면 작성자 DELETE 정책으로 링크가 깨질 수 있다. 성공 후 tmp 밖 확정 경로 이동 또는 서버 확정 절차와 게시 객체 DELETE 차단이 필요하다. |
| 2026-09-21 | 실제 의미 반영 수용시험을 먼저 고정한다. | RED는 helper 길이 2·게시 첨부 DELETE 거부, GREEN은 path 조건 수정·tmp 밖 확정·타인/게시/비tmp DELETE 차단으로 한다. |

이 정정 전의 PASS·로컬 검증 이력은 삭제하지 않는다. Node 23/23, 기존 PGlite 7/7은 helper 오모사로 Storage 판정이 무효이고, 실제 helper 의미 반영 시험은 FAIL, 인라인 2 및 `git diff --check`는 PASS였다. push·운영 적용·Opus는 미실행이다. Sol High PASS와 사용자 승인된 Opus 읽기전용 외부 검사 전에는 push·운영 DB/Storage 적용을 하지 않는다.

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-21 | 원본 ZIP 명칭을 구분한다. | 시간상 최초 업로드=`직원허브설명서관련.zip`; 승인 구현 정본=`직원허브 수정 지침.zip`. 상세 해시·수량은 source ZIP 인벤토리가 정본이다. |
| 2026-09-21 | Task 6은 공지 첨부와 예치금 조회를 분리한다. | 공지는 승인·활성 직원의 단일 `author_id` INSERT 정책, 서버 이름 고정·불변 필드, UUID tmp 경로·MIME·10MB Storage 검증을 사용한다. 예치금은 데스크 부서·chief·owner 조회로 한정한다. |
| 2026-09-21 | Task 6 SQL은 운영 적용 전 초안이다. | `db/notice_attachments_deposit_access_draft.sql`과 private `notice-attachments` 버킷/RLS·롤백 SQL은 로컬 합성시험만 완료했다. 운영 DB·Storage·계정·실데이터는 변경하지 않았다. |
| 2026-09-21 | Task 6 DELETE와 롤백은 데이터 보존을 우선한다. | 승인·활성 본인의 `uid/tmp/...` DELETE만 허용한다. 롤백은 기존 정책·버킷 설정·권한을 복원하고, 신규 버킷은 객체 0개일 때만 제거하며 객체가 있으면 중단·보존한다. |
| 2026-09-21 | Task 6 rollback snapshot은 migration/rollback 실행 주체만 접근한다. | PUBLIC·anon·authenticated의 모든 table ACL을 회수하고 RLS를 활성화한다. 공지 INSERT의 작성자·생성·갱신 시각은 클라이언트 값을 무시하고 서버가 고정한다. |
| 2026-09-21 | 로컬 커밋과 배포를 구분한다. | `origin/main`은 `4865f89`이고, Task 6 기능·시험 커밋은 아직 push·배포하지 않았다. |
| 2026-09-21 | 후속 범위를 순서대로 유지한다. | Task 7~11은 미완료이며, `상담문의 등 일원화.zip`은 Task 11 이후 별도 범위다. |

최초 ZIP의 승인된 추가형 DB/RLS·비공개 Storage·단계배포는 새 승인 없이 진행할 수 있다. 단, Sol/Opus 등 독립 검토 PASS, 백업·롤백 경로, 별도 시험 계정의 역할별 시험 조건을 충족한 뒤에만 실행한다. 별도 승인이 필요한 일은 원본 삭제·대량 이관/수정·보안 완화·새 비용·자격증명 입력·실제 직원 메일/push/알림·외부 공개뿐이다.
