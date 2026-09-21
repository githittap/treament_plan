# 직원허브 확정 결정

## 최신 결정 — Task6/7/8 운영 순서 (2026-09-22)

| 시각 | 결정 | 근거와 경계 |
|---|---|---|
| 2026-09-22 | Task6 production migration을 완료로 기록한다. | `employee_hub_notice_attachments_deposit_access_20260921` 적용 후 `notices=1`·`deposits=264` 보존, private `notice-attachments` 10MB/6 MIME/objects=0 확인. Storage API 실제 업로드는 자격증명 없이 미검증이다. |
| 2026-09-22 | Task7 첫 production apply 실패는 운영 변경 없는 rollback으로 고정한다. | fixed canonical mismatch에서 transaction rollback됐다. Sol High 첫 독립 검증은 HEAD `39604f8`에서 Important 6건 FAIL했고, 이 판정은 삭제하지 않는다. |
| 2026-09-22 | Task7 v6·Task8 보완의 상위 재실행 PASS는 최종 독립 검증 PASS가 아니다. | Task7 `fa61fb2`는 v6 fingerprint/manifest/hash/MD5 및 rollback·endpoint·policy/JSON gate를 보강했다. Task8 `77d0f11`·`33d8491`·`2ad9341`은 default 의미·new `prosrc` MD5·동시 self-spoof 음성시험을 보강했다. |
| 2026-09-22 | Sol High 2차 FAIL 이력을 보존한다. | HEAD `c38964a`에서 Important 2·Minor 1 FAIL: endpoint backslash 2개, JSON probes 위양성, 기록 상세 모순. Task7 원본 rollback/policy 및 Task8 default/self-spoof는 PASS였다. |
| 2026-09-22 | `a521d1b`의 로컬 회귀 PASS는 3차 독립 재검증 PASS가 아니다. | dot escape 1개·dotted FCM/Mozilla 허용·JSON drift 4종 독립 fixture/목표 probe·rollback reject 및 객체 보존을 보강했고 상위 재실행 Task7/Task8/push는 PASS다. |
| 2026-09-22 | Sol High 3차 재검증 PASS 전 Task7/Task8 production 적용을 금지한다. | 같은 Sol 재검증 PASS 후에만 Task7 apply/verify → Task8 apply/verify → 승인된 단계배포·실사이트 확인으로 진행한다. 실제 직원 메일·Push·생체입력, 자격증명, 원본 삭제, 대량 이관, 보안 완화, 새 비용도 금지한다. |

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
