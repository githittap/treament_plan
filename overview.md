# overview — 아산정플란트치과 내부 도구 (T8/D 인프라)

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
