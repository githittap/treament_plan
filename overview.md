# overview — 아산정플란트치과 내부 도구 (T8/D 인프라)

## 최신 실행 정본 — Task11 문서화 완료 및 다음 범위 (2026-09-22)

- Task10 기록 커밋 `41327995d523e6583db14db4840e5628052d20e0`는 `origin/main` push 완료이며, 최신 GitHub Pages run `35666985589` build/deploy success를 확인했다. 기능 배포 `eeac4f2`·run `35640892992`는 기존 역사 증거로 보존한다.
- Task11 결과보고서 정본은 `Z:\11_codex\00_결과보고서\직원허브_구현결과보고서_2026-09-22.html`(SHA256 `7AACA57558B9D6F6CEE9EB35E4781C1205CEA4217DF70BB5F5AC7E0C48A748F4`), 사용설명서 정본은 `Z:\11_codex\03_병원운영·전산\직원허브_수정지침_시안\직원허브_사용설명서.docx`(SHA256 `9CB2DB42EB8C78E2E43F4375C7E5F7F3CD47EB14A4234434BB9AA4B3F81E2B07`)다.
- Sol High 독립검증은 HTML/content/OOXML/a11y/privacy PASS다. 번들 LibreOffice 부재로 사용설명서 전 페이지 PNG visual QA는 미실행인 조건부 인도 경계다. 실제 4역할 로그인·저장/재조회와 실제 직원 데이터·메일·Push·생체정보는 계속 미검증·금지다.
- 최초 `직원허브 수정 지침.zip`에서 외부자료 없이 가능한 승인 범위 구현·운영적용·배포·문서화는 종료했다. 다음 활성 범위는 아직 열지 않은 `직원허브 5차.zip`의 원본 보존·해시·인벤토리·요구 대조이며, `상담문의 등 일원화.zip`은 직원허브 5차 완료 뒤 별도 후속이다.

## 최신 실행 정본 — Task10 배포·공개 smoke 완료 (2026-09-22)

- `eeac4f2d9827f01764be66f8616717b732623fd0`를 `main`에 배포했다. GitHub Pages run `35640892992`는 build/deploy success이며, `jung-plant.com/hr.html?v=eeac4f2` HTTP 200(498479 bytes), GitHub Pages는 501015 bytes로 확인했다.
- 두 공개 URL에서 `push_subscriptions`·`WORK_DOC_GUIDE_OPEN`·`consultation_journals` 표식을 확인했고, 앱 내 로그인 UI를 열어 CDP reload의 Runtime.exception·Network.loadingFailed·Log error/warn은 모두 0건이었다. 비밀번호 입력칸 form 권고 verbose 5건만 남았다.
- 직접 JS 24/24·PGlite 9/9·인라인 구문·`git diff --check`는 PASS다. 실제 4역할 로그인·데이터 저장/재조회·메일·Push·생체정보는 시험 계정/자격증명이 없어 미검증이다. 다음은 Task11 설명서이며, 프론트 롤백 기준은 `4865f89`이고 DB 롤백은 별도 증거 게이트를 따른다.

## 최신 실행 정본 (2026-09-22)

- Task7 운영 migration `employee_hub_push_subscriptions_v6_20260922` 성공: PG17.6에서 rows=0, RLS, policy 4개, trigger 1개, constraints 5개, canonical=`4f7a3ffc459b04e0a3c87ea8dfda8c28` 및 관련 advisor 0건을 확인했다. 실제 직원 Push·실기기·VAPID는 미수행이다.
- Task8 운영 migration `employee_hub_attendance_owner_chief_gate_20260922` 성공: marker 1건, FORCE RLS·역할 SELECT 없음, function `prosrc`=`08d9fa62fcc82616dd9f7cb3f8ebafac`, chief gate=true·old bypass=false, `attendance_manual_entries=8`·history=9 보존 및 Task7 canonical 유지를 확인했다. private marker의 no-policy INFO는 의도된 deny-all이다.
- Task9 메뉴 도움말 완료: 기존 `hr.html` workdocs 탭 안의 직원 허브 사용 설명서·열기/닫기·메뉴별 안내·권한 차이를 확인했고 새 상단탭·민감정보는 없다. 정적 시험은 work-documents 4/4, guide 2/2, home-work-docs 1/1 PASS다. 통합 `node --test`의 spawn EPERM은 코드 실패가 아니다.
- 다음 순서: Task10 역할별 단계배포·최종인수 → Task11 설명서. `직원허브 5차.zip`은 미열람이며 `상담문의 등 일원화`는 별도 후속이다. 실제 직원 Push는 계속 금지한다.
- Sol High 6차 결과는 기능·전체 JS/PGlite 시험 PASS였으나, 기록에 `e607ff6`의 오류 8건 exact equality 보완이 빠져 Minor 1 FAIL했다. production은 미적용이며 다음은 Sol High 7차 최종 문서 대조 대기다.
- Sol High 5차 독립검증은 기능·독립 시험은 PASS였으나 기록 미동기와 targeted JSON 4종/복원 4건 오류의 exact assertion 부재로 Minor 2 FAIL했다. `95c296d` 복원 이력은 유지하고, 실제 PGlite `Error.message`를 접두·접미까지 동등 비교로 고정했다. Task7/Task8 production은 미적용이며 Sol High 6차 재검증 대기다.
- Sol High 4차 재검증은 핵심 targeted same-name JSON CHECK 4종은 PASS였지만, 빈 DB·기존 profile 없음·유효 row·endpoint CHECK(true)에서 원본 rollback이 기존 객체를 보존하는 영구 회귀 4건이 삭제되어 Important 1로 FAIL했다. 이 보완은 원본 `rollbackError(db)`와 fresh fixture로 정확 오류·행/객체 보존을 다시 고정하며, Task7/Task8 production은 계속 미적용이다.
- Task6 production 완료: migration `employee_hub_notice_attachments_deposit_access_20260921`을 적용했다. 기존 `notices=1`, `deposits=264`는 보존했고, private `notice-attachments` 버킷은 10MB·6 MIME 제한으로 생성됐으며 객체 수는 0이다. Storage API 실제 업로드는 자격증명이 없어 미검증이다.
- Task7 첫 production apply는 고정 canonical 불일치로 transaction rollback됐다. 운영 스키마·데이터 변화는 없다.
- Sol High 첫 독립 검증은 HEAD `39604f8`에서 Important 6건으로 FAIL했다. Task7 원본 rollback `proconfig`, dotted endpoint, policy drift, JSON CHECK drift와 Task8 `applied_at` default/self-spoof, 기록 과장이 대상이다.
- Task7 v6 보완 `fa61fb2`: fingerprint=`task7-push-v6-catalog`, manifest=`push-v6-catalog-20260922`, SHA256=`b0cd63d9427445de8f2a03113dddd7bc6251cc9667a8655d160cf59512f0d3ff`, semantic MD5=`e4f10430874631e3ca0a9ed1423384d1`, snapshot MD5=`8774aede303f69fccd80680d8e283c4b`로 갱신했다. 원본 apply→rollback, dotted endpoint, policy exact·JSON behavior gate를 추가했고 상위 재실행은 PASS다.
- Task8 보완 `77d0f11`, `33d8491`, `2ad9341`: v6 동기화, `now/current_timestamp` default 의미 gate, 독립 new `prosrc` MD5=`08d9fa62fcc82616dd9f7cb3f8ebafac`, marker+identity 동시 self-spoof 음성시험을 추가했다. 상위 재실행 Task7/Task8/push는 PASS다.
- Sol High 2차 재검증은 HEAD `c38964a`에서 Important 2·Minor 1로 FAIL했다. endpoint regex가 실제 backslash 2개라 dotted FCM을 거부했고, JSON drift probes는 endpoint check에서 먼저 실패해 위양성이었으며 기록 상세도 모순됐다. Task7 원본 rollback/policy drift와 Task8 default/self-spoof는 PASS였다.
- 보완 `a521d1b`: dot escape를 실제 1개로 고치고 FCM/Mozilla dotted 허용시험을 추가했다. JSON drift 4종은 각각 독립 fresh fixture와 정확한 목표 probe로 원본 rollback reject·객체 보존을 확인했으며 상위 재실행 Task7/Task8/push PASS다.
- Sol High 3차 재검증은 HEAD `771ccf5`에서 Important 1·Minor 1로 FAIL했다. 운영 SQL 새 결함은 없었으나 tests/sql `onlyJsonProbe`/`checkBehaviorRollback`이 원본 rollback preflight를 제거해 정확한 목표 증거가 부족했고 기록이 과장됐다.
- `4dec81f`는 테스트만 수정했다. preflight 삭제 변형을 제거하고 same-name targeted CHECK 4종에서 원본 `rollbackError(db)`, 각 정확 오류, private schema/public table 보존을 확인한다. 상위 Task7/Task8/push 재실행 PASS다.
- 최종 상태는 **Sol High 7차 코드 안전성 PASS·문서 두 줄 stale Minor 1 FAIL 후, 기록 수정 완료 및 8차 최종 문서 대조 대기**이며 Task7/Task8 production 미적용이다. 다음은 8차 PASS 후 Supabase PG17 읽기 전용 preflight → Task7 적용/검증 → Task8 적용/검증이다. 실제 직원 메일·Push·생체입력, 자격증명 입력, 원본 삭제, 대량 이관, 보안 완화, 새 비용은 금지한다. `직원허브 5차.zip`은 최초 승인 범위 완료 뒤에만 읽으며 `상담문의 등 일원화.zip`은 직원허브 전체 후속이다.

## 재부팅 정본 (2026-09-21)

- Task8 보완 완료(로컬): Task7 canonical/identity 정합과 Task8 marker owner/ACL/RLS drift, old ACL 필수 EXECUTE 및 Sol M1 EOF 빈 줄을 보강했다. 고정 PGlite 0.5.8 Task8·Task7 회귀 및 `git diff --check` PASS. Sol 재검증 전에는 완료 주장·운영 적용을 금지한다.
- Task7 hardening 로컬 PASS: helper body·trigger·same-name CHECK·private namespace 및 Task8 marker shape drift를 fail-closed fixture로 검증했다. 운영 미적용.
- 다음: Sol 독립 재검증. 운영 DB·push·배포와 `직원허브 5차.zip` 열람은 계속 금지한다.

## Task 8 로컬 체크포인트 (2026-09-21)

- `db/attendance_owner_chief_gate_patch.sql`과 rollback은 Task 7 private manifest 선행·수기근태 원장 승인 실장승인 제한·private marker fail-closed를 위한 **로컬 초안**이다. 운영 DB/행·push·배포는 수행하지 않았다.
- 고정 PGlite 0.5.8에서 적용×2·함수 drift 거부·RESET·rollback 구 함수 해시·재적용 왕복을 확인했다. 운영 적용 판단은 별도다.
- 순서: Task 8 rollback을 먼저 성공시킨 뒤에만 Task 7 rollback을 검토한다. 5차 ZIP은 열지 않는다.

> 이 폴더는 병원 내부에서 쓰는 단일 HTML 웹도구 모음이다. 한 저장소에서 여러 도구를 배포한다.
> 담당 세션: **CC 치료계획(T8 인프라 개발 + T6 CS 인계 대상)**. 마케팅본부 지침의 T#와 구분해 내부 트랙은 **D1~D6**로 부른다.

## 한 줄 정체
치과 진료·기공·교정·인사(근태) 업무를 브라우저 도구로 만든 것. 앞단(화면)=HTML, 뒷단(데이터·로그인)=Supabase.

## 한 줄 비전 (2026-07-30 원장 확정)
설치·외주 없이 브라우저로 굴리는 아산정플란트 내부 운영 세트 — 진료·기공·교정·인사 4축, 로그인·데이터는 Supabase 한 곳.
개발 우선순위(2026-07-30): 입금 피드 P1 → 교정보드 v1.2 → 급여·명세서(M3) → 계정 채우기.

## 배포
- GitHub Pages: `https://githittap.github.io/treament_plan/<파일>.html`
- 커스텀 도메인: `https://jung-plant.com/<파일>.html` (Cloudflare Registrar, CNAME 연결)
- 리포지토리: github.com/githittap/treament_plan (공개 — 비번·키 커밋 금지)
- 배포 방식: push → 자동. `index.html`이 도구 허브(카드 목록).

## 구성 도구
| 파일 | 도구 | 백엔드 |
|---|---|---|
| `치료계획.html` | 파노라마 X-ray 위 치료계획 시각화(메인) | 없음(로컬) |
| `기공차트_리메이크장부_서식.html` | 기공물·리메이크 장부(로그인·실시간 공유) | Supabase `ledger` |
| `ortho.html` | 교정 통합 케이스 보드(11단계·간이기록부·FedEx) | Supabase `ortho_*` |
| `hr.html` | 직원 허브(근태·연차·결재·공지·근무표·온보딩·입금피드) | Supabase `profiles/attendance/deposits/...` |
| `AI지표.html` + `aa-metrics.json` | AI 모델 벤치마크 대시보드 | 로컬 json |
| `진행판.html` | 작업 진행판(비번 게이트) | Supabase(별도 프로젝트) |
| 기타 | 보철프로토콜_진단기·사주·직원뽑기·뉴스·설명덱_제작기 | 대부분 로컬 |

## 기술 스택
- 단일 파일 HTML + Vanilla JS(ES6), 프레임워크·빌드 없음. CSS/JS 인라인.
- 백엔드: **Supabase**(장부·로그인·RLS·실시간·Storage·Edge Function). 파일보관까지 담당.
- 도메인·배포 앞단: Cloudflare.

## Supabase 구조
- **기공차트 프로젝트**(ref `texevhsxttfoqkrucfzl`, **Pro**): `ledger`(기공차트) + `ortho_*`(교정) + 근태(`profiles·attendance·schedule_*·leave_*·approval_*·contracts·notices·onboarding_*·app_settings` 등) + 계정(Auth). **hr·교정·기공이 계정 공용.**
- **진행판 프로젝트**(ref `jvoiblimthwuhbspwkwu`): 진행판 전용, 단일 비번(RPC).
- 백엔드 SQL 원본: `db/*.sql` (ortho·hr·hr_settings). 실행은 원장이 SQL Editor에서.
- 권한: `my_role()` 함수 기반 RLS 4단(owner/chief실장/manager매니저/staff). T6 리뷰봇이 이 role 재사용 예정.
- 계정 생성: 직원 **셀프 회원가입**(hr 로그인 화면) → `profiles` 자동 staff → owner가 원장 탭에서 권한 지정. 정책 `profiles_insert_self`(자기 행·staff만) + `profiles_insert_owner`(owner는 임의). 가입 이름은 Auth user_metadata(full_name).
- 입금 피드(P1): 사업계좌 입금 SMS → **원장 개인폰 MacroDroid**(발동: SMS 내용 포함 `101209036`) → Edge Function `deposit-webhook`(`--no-verify-jwt`, 시크릿 `WEBHOOK_TOKEN`·`BIZ_ACCOUNT_MASKED=101209036***3`) → `deposits` 표(재직자 SELECT·쓰기 service_role만; **잔액·전체계좌 미저장**) → hr '입금' 탭 + (직원 업무폰) **텔레그램 그룹 알림**. 직원 업무폰엔 설치 X(웹 열람·텔레그램 가입만). `db/deposits.sql`은 멱등판.

## 상담일지 운영 적용 준비 (2026-09-21)
- 대상: `hr.html`과 `db/consultation_journal_draft.sql`. 실장(`manager`)·원장(`owner`)만 신규 상담일지를 조회·입력·수정하며 anon·staff·chief는 RLS로 거부한다.
- 사전 RLS 실행시험: 총괄이 프로젝트 `texevhsxttfoqkrucfzl`에서 `BEGIN`/`ROLLBACK`으로 8/8 PASS 확인. manager 입력·수정, owner 조회 허용; staff/chief 조회 차단, staff 입력·anon 조회 거부, `created_at` 변조 거부. 트랜잭션 ROLLBACK으로 운영 스키마·데이터 변경 없음.
- 적용 전 체크: `db/consultation_journal_draft.sql`과 `db/consultation_journal_rollback.sql`을 함께 검토하고, `hr.html`의 커밋이 배포 대상 브랜치에 포함됐는지 확인한다. 저장소 검색상 `consultation_journals`·`set_consultation_journals_updated_at`의 중복 정의는 없다.
- 롤백: 신규 테이블과 갱신 트리거 함수만 제거한다. 적용 뒤 기록이 생성됐다면 이 롤백을 실행하지 말고 데이터 보존 판단을 먼저 받는다.
- 적용 후 보완: 운영 적용된 실제 객체의 RLS 재시험도 8/8 PASS(실제 기록 0건, 시험 입력은 ROLLBACK)했다. `db/consultation_journal_advisor_hardening.sql`은 Advisor의 고정 `search_path`, `author_id` FK 인덱스, 정책 initPlan 보완만 추가한다.

## 직원허브 현재 배포·인수인계 (2026-09-21 Task 6 로컬 검증 갱신)

- 배포 기준 커밋: `0f3226b` (직접 push 완료). 구현 기준 worktree는 `treament_plan/.worktrees/calendar-ui-release`, 브랜치는 `codex/calendar-ui-release`이다. `origin/main`은 배포 정본이고, 이 worktree의 최신 문서·Task 6 보완 커밋은 아직 로컬 검증 정본이다.
- 상담일지 기본 migration `add_consultation_journals`은 운영 DB에 적용됐고, 실제 객체 대상으로 RLS 8/8 PASS·Sol 검토 PASS를 확인했다. 시험 입력은 ROLLBACK했고 운영 상담 기록은 0건이었다.
- `db/consultation_journal_advisor_hardening.sql`은 migration `harden_consultation_journals`로 운영 DB에 적용됐다. 적용 후 실제 객체 RLS 8/8 PASS, 신규 상담일지 Advisor security WARN 0건을 확인했고, performance에는 신규 빈 테이블의 unused-index INFO만 남았다.
- `https://jung-plant.com/hr.html?v=0f3226b`에서 상담일지·`consultation_journals` 마커 반영, 공개 로그인 화면 정상 및 console error 0건을 확인했다. 인증 후 manager/owner/staff/chief의 실제 입력·저장·재조회만 미검증이다. 자격증명·실제 환자 행·토큰은 이 저장소와 인수인계 문서에 기록하지 않는다.
- 이 인수인계 문서의 로컬 기록 커밋은 아직 `origin/main`에 포함하지 않는다. push 뒤에는 `origin/main` HEAD와 이 문서의 최신본을 함께 확인한다.
- 최초 ZIP의 승인된 추가형 구현·시험·DB/RLS/Storage·단계배포는 범위 안에서 단계별 재승인 없이 진행한다. 원본 삭제, 대량 이관/수정, 보안 완화, 새 비용, 자격증명 입력, 실제 직원 메일·push·알림, 외부 공개처럼 범위가 확대될 때만 별도 승인이 필요하다.
- 범위별 현재 상태와 다음 순서는 [직원허브 인수인계](docs/superpowers/HANDOFF-employee-hub-2026-09-21.md)를 정본으로 한다. 기존 ZIP 근무표 수용 이력은 아래 수용추적표에 보존한다.
- Task 6은 Sol High FAIL 후 `7ee01fd`로 추가 보완했고 최종 재검증 대기 상태다. 본인 tmp DELETE 경계와 rollback 왕복에 더해, 공지 INSERT 작성자·시각 서버값 고정, UPDATE 불변·`updated_at` 서버 갱신, rollback snapshot의 PUBLIC·anon·authenticated ACL 회수·RLS를 PGlite에서 확인했다. 운영 DB·Storage 적용, push, 배포와 실제 역할별 저장/재조회는 미수행이다.
- 원본의 시간상 최초 업로드는 `직원허브설명서관련.zip`, 승인 구현 정본은 `직원허브 수정 지침.zip`이다. 상세 해시·수량은 [원본 ZIP 인벤토리](docs/superpowers/specs/2026-09-21-employee-hub-source-zip-inventory.md)를 따른다.

## 핵심 규칙·컨벤션
- **모든 코드(프론트·백엔드·SQL)는 Codex에 위임 작성**(2026-07-30 원장 강조: "코딩 직접 말고 항상 codex delegate"). Claude는 계약(스키마·호출목록) 작성 + 결과 **검수·검증·통합**만, 코드 파일 직접 편집 X. **SQL은 Codex 교차검증 통과 후에만 실행 안내**(FK 타입 사고 재발 방지 — 기존 DB 참조 시 타입 실측). 이 환경에선 codex를 **PowerShell로 codex.exe 직접 구동**(Bash 훅 고장; prompt는 stdin 파이프 + `$OutputEncoding=UTF8`).
- **자주 바뀔 값은 하드코딩 금지 → `app_settings` 표로**(원장이 SQL 한 줄로 수정). 설명서=`09_claude-output\04_AI·Claude운영\산출물\근태설정_사용설명서.html`.
- 치식 표기 = **FDI**(덴트웹과 동일). 직원 익숙함 위해 표 중심·탭+건수·기간필터·CSV 지향(덴트웹 UI 참고노트).
- 개인정보(주민번호·연락처·진단)는 저장 허용(원장 확정) — 최소식별 강요·법적 경고 금지. 보안은 RLS·로그인으로 조용히.
- 비번·API키·토큰은 어떤 저장소에도 커밋 금지(공개 repo).
- 한글 UTF-8 파일·codex stdin은 PowerShell `Get-Content -Raw`(ANSI 오독→mojibake) 금지 → `[IO.File]::ReadAllText(...,UTF8)`/node, 파이프엔 `$OutputEncoding=UTF8`. 한글 HTML 조립은 node/codex에 맡김.

## 관련 문서
- 프로젝트 지도: `Z:\09_claude-output\★프로젝트지도.md`(+.html)
- 설계서·상황판: `Z:\09_claude-output\04_AI·Claude운영\산출물\` (교정보드 v1.1·근태 v1.1·상황판·기술문답·덴트웹 UI참고·설정 설명서)
- 이 프로젝트용 코딩 규칙: 같은 폴더 `CLAUDE.md`(치료계획.html 함수맵·단축키 등)

## 최신 인계 상태 — Task 6 Sol High 최종 PASS (2026-09-21)

Task 6 로컬 구현 HEAD는 `d0222684dd7da4607752c22b2912ad8bf4f0d87a`이며 Sol High 최종 PASS(Critical/Important/Minor 없음)다. foldername 길이 2, 게시 첨부 restrictive DELETE guard, JSON/NULL 강제, 정책·RLS·ACL·버킷 rollback, apply×2 fail-closed, quoted role 복원을 직접 Node 30개·PGlite·인라인 JS·diff check로 확인했고 worktree는 clean이다. push·배포·운영 DB/Storage·실계정 검증은 미수행이다.

운영 전에는 Storage DELETE/ALL 정책·ACL·RLS·버킷/객체 snapshot, 별도 시험계정 upload/download/cleanup/게시 후 DELETE 거부/MIME·10MB, 복제환경 rollback, 단일 migration 실행이 남는다. 최종 직전에만 승인된 외부 Opus 읽기전용 검증을 수행한다. K3는 BUSD MCP_INTERNAL_ERROR 및 managed Kimi 403 구독 접근 거부로 제외하며 사용자 연결 완료 전 Terra를 유지한다. `C:\Users\elusi\Downloads\직원허브 5차.zip`은 지금 열지 않고 기존 승인 미완료 완료 뒤 원본 보존·요구 대조 대상으로 대기한다.

## 과거 인계 상태 — Task 6 Sol High 최종 판정 FAIL (2026-09-21)

현재 기준 HEAD는 `1719e3f`이며, 이 기록은 구현·SQL·시험 파일을 변경하지 않고 문서만 갱신한 인계 정본이다. Task 6은 **로컬 구현은 있으나 최종 Sol High FAIL로 배포 차단** 상태다.

- `db/notice_attachments_deposit_access_draft.sql:27,29`의 `array_length(storage.foldername(name),1)=3`은 실제 Supabase 의미와 다르다. `uid/tmp/file`의 `foldername`은 `[uid,tmp]`이므로 길이는 2다.
- 그 결과 실제 업로드/cleanup DELETE가 RLS에서 거부된다. 기존 PGlite helper는 파일명까지 포함해 모사하여 위양성 PASS를 냈다.
- 성공 첨부도 `uid/tmp/...`에 남아 DELETE 정책으로 작성자가 게시 첨부를 삭제해 링크를 깨뜨릴 수 있다. 성공 후 tmp 밖 확정 경로로 이동하거나 게시 객체 DELETE를 서버 절차로 차단해야 한다.
- 검증 결과: Node 23/23, 기존 PGlite 7/7은 helper 오모사 때문에 Storage 판정 무효, 실제 helper 의미 반영 시험 FAIL, 인라인 2 PASS, diff check PASS.
- push·운영 적용·Opus 검사는 수행하지 않았다. Sol High 최종 PASS 전 push·운영 DB/Storage 적용을 금지한다.

재부팅 후 시작 순서는 인계자료 README → HANDOFF → overview → todos → DECISIONS → WORKLOG → acceptance matrix → source ZIP inventory다. 이후 `git status --short`, `git rev-parse HEAD`, `git log --oneline 4865f89..HEAD`를 확인하고 실제 Supabase `foldername` 의미를 수용시험에 먼저 고정한다.

## 최신 상태 — Task7/8 portable semantic manifest PASS (2026-09-21)
- Task7·Task8 PGlite PASS. 운영 DB/Storage 적용·실제 push·배포는 미수행.
