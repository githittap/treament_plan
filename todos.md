# todos — 내부 도구(T8/D) 작업 목록

갱신 2026-07-30 · 상세 상황판: `Z:\09_claude-output\04_AI·Claude운영\산출물\치과내부도구_상황판.html`

## 🧭 이번 세션 인수인계 (2026-07-30 · 입금 P1 배포 진행 중) — compact 대비
- **목적**: 입금 피드 P1을 실제 가동 — 사업계좌 입금 문자를 직원이 **hr '입금' 탭 + 텔레그램**으로 실시간 확인.
- **결정**: ①입력=원장 개인폰 MacroDroid→Supabase Edge Function 웹훅(문자 오는 폰은 원장 개인폰) ②직원 업무폰엔 **설치 X** — 웹(hr 입금 탭) 열람 + **텔레그램 그룹 알림**(문자 재전송 대신) ③**모든 코드는 codex 위임·Claude 최종 검수**(원장 강조: "코딩 직접 말고 항상 codex delegate") ④절차 안내는 **찔끔 금지·전체 한 번에**(CLAUDE.md 고정) ⑤날짜 07-28 오기→**07-30 정정**.
- **수정/생성 파일**: `db/deposits.sql`(멱등판 1ce6517) · `supabase/functions/deposit-webhook/index.ts`+`parse_test.ts`(4f7567e) · `hr.html` 입금 탭(4f7567e) · `overview/todos`(5e9c593·0e280a2) · 배포가이드 HTML(`Z:\09_claude-output\00_결과보고서\입금피드P1_배포가이드_결과보고서_2026-07-30.html`) · `~/.claude/CLAUDE.md`(찔끔금지) · 기억(codex-delegate 강화·powershell-utf8).
- **실패·이유**: ①가이드 HTML **mojibake** — PowerShell `Get-Content -Raw`가 UTF-8을 ANSI 오독 → **codex node 스크립트로 재조립** 복구. ②codex `--ephemeral` stdin 한글이 `??` → `$OutputEncoding=UTF8`로 해결. ③codex-shell 서브에이전트=Bash 훅 고장으로 불가 → **PowerShell로 codex.exe 직접 구동**(prompt는 stdin 파이프). ④codex가 clarifying 질문서 멈춤 → **자율구현 권한 명시** 후 진행. ⑤deposits.sql 재실행 `already exists` → **멱등판**(if not exists + drop policy if exists). ⑥원장이 파일 붙여넣기 시 한글 깨짐 → **GitHub raw 복사** 권장.
- **검증**: 파서 `deno test` **7/7** · `deno check` OK · hr.html `node --check` OK · **BIZ_ACCOUNT_MASKED 값=`101209036***3` sha256 해시 일치**(스샷 digest와 대조) · 가이드 HTML 치환문자(�) 0·태그 정상.
- **남은 할 일(원장)**: ①원장폰 MacroDroid — 발동(SMS 내용 포함 `101209036`)+동작1(HTTP POST→`deposit-webhook`, 헤더 `X-Webhook-Token`, 본문 `{msg,received_at,event_id}`)+동작2(텔레그램 `sendMessage`) ②본문 매직텍스트 `received_at`/`event_id` 확정(**MacroDroid 매직텍스트 화면 캡처 필요**) ③함수 **Verify JWT OFF** 확인 ④텔레그램 봇/그룹+`chat_id` 확정(@Jungplant_all_bot 재사용 권장)·직원 그룹 가입 ⑤소액 입금 **테스트** → hr 입금탭·텔레그램 확인.

## 🎯 한 줄 비전 (2026-07-30 원장 확정)
설치·외주 없이 브라우저로 굴리는 아산정플란트 내부 운영 세트 — 진료·기공·교정·인사 4축, 로그인·데이터는 Supabase 한 곳.

## 🔵 진행 중 / 바로 다음 (우선순위 2026-07-30 원장 확정: 입금피드 → 교정 v1.2 → 급여 → 계정)
- [~] **1) 입금 피드 P1** — **코드·백엔드 배포 완료, 원장 MacroDroid 설정 중**:
  - ✅ **코드**: `db/deposits.sql`(멱등·재직자 SELECT) + Edge Function `deposit-webhook`(X-Webhook-Token 인증·앵커 정규식·입금만·잔액/전체계좌 폐기·event_id 멱등, **파서 7/7·deno check**) + hr.html '입금' 탭(KST 필터·읽기전용·**node check**). 전부 **codex 위임 + Claude 검수**. 배포 `4f7567e`·`1ce6517`.
  - ✅ **원장 배포**: SQL 실행 · 함수 배포(`deposit-webhook`) · 시크릿 2개(`WEBHOOK_TOKEN`·`BIZ_ACCOUNT_MASKED=101209036***3` 해시검증).
  - 🔵 **진행**: 원장 개인폰 MacroDroid(발동 SMS 포함 `101209036` → 동작 HTTP POST→Supabase). **남음**: 본문 매직텍스트(`received_at`/`event_id`) 확정 · **Verify JWT OFF** 확인.
  - 🆕 **텔레그램 알림**(직원 업무폰 즉시 알림): MacroDroid **두 번째 동작** = 텔레그램 `sendMessage`→직원 그룹. 봇/그룹+`chat_id` 확정 필요(@Jungplant_all_bot 재사용 권장). 직원은 **그룹 가입만**(설치 X). 열람은 hr 입금탭 병행. **P2**=교정 진단비 매칭(이후).
- [ ] **2) 교정보드 v1.2**: 칸반↔표 뷰 토글 · CSV 내보내기 · 진단 필드 FDI 치식 픽커 · 자주쓰는 문구 버튼
- [ ] **3) M3 급여·명세서**: 급여대장 가져오기 + 임금명세서 발행제(payslips) + 휴일근로 계산기 + 월말 평가(월매출·정량·정성·소외배지) + 조퇴 공제 계산
- [ ] **4) 계정 채우기**: 직원 25명 셀프 가입 유도 + 실장 지정 대상(chief)·매니저 지정 대상(manager) 권한 지정(계정 생기면 원장 탭) + 미가입 독려·권한 일괄지정 화면

## ⏸️ 대기 (원장 결정·자료 필요)
- [ ] **UI 브랜드 리스킨** — 레퍼런스(취향·무드·벤치마크) 모이면 **한 번에** frontend-design 스킬로. 브랜드 KB=`Z:\09_claude-output\06_KB\아산정플란트_이미지자산_KB`(로고·#156f72·실사)
- [ ] 온보딩 미제출 **페널티** 구현: 제출 마감일 표시 + 미제출자 관리자 **SMS 보고** + 근무표 열람 제한
- [ ] 대체공휴일 2건(8/17·10/5) 실제 적용 여부 — 병원은 휴일 원칙근무·단축 많음, 월계산 시 **실근무시간만** 보고
- [ ] 서식 레퍼런스(계약서 등) + 병원 컬러 입히기 → M2 계약서 템플릿 때

## 📋 백로그 (설계 완료·구현 대기)
- [ ] **D2 M2 잔여**: 계약서 자동생성+도장+전부서명+5일 열람 / 통합 캘린더(이벤트·off)
- [ ] **입금 피드 P2/P3**: (P2) 입금↔교정 진단비 자동 매칭 · (P3) 가상계좌 · 텔레그램 알림 문구 정제(입금만·금액/입금자 포맷)
- [ ] **D5 작업판 자동기록**: CC 세션 종료 훅 + 협업 CLAUDE.md 관례 → write RPC(다단계 작업만). SQL은 원장 실행
- [ ] **D6 기공차트 탭 전환 + 이미지 첨부**: 장부 세로나열→탭 / 행에 사진 업로드·클립보드 붙여넣기 영구저장(→리메이크 전략)
- [ ] **T6 리뷰봇·고객DB**: `03_병원운영·전산\내부홈페이지\T6_리뷰봇·고객DB_연동사양.md` — profiles.role 재사용, cs_events/reviews_log
- [ ] 내부 평가 시스템: 부서(진료실·데스크·홍보팀·상담팀·기공팀)별, 항목 러프(기공 리메이크 등) — 추후 구체화
- [ ] 스크래핑(Playwright): SureSmile 배송·Tracking 자동수집 / 덴트웹 교정상태 (2FA 없음 확인) — 교정보드 P3

## 🧩 로드맵 밖 (재미도구 — 유지만, 개발순위 제외)
- 사주 · 직원뽑기 · 뉴스 · 보철프로토콜_진단기 · 설명덱_제작기

## ✅ 최근 완료
- **입금 피드 P1 코드·백엔드 배포** (2026-07-30): deposits 표(멱등)·Edge Function `deposit-webhook`·hr '입금' 탭. codex 위임·Claude 검수·파서 7/7. 배포 `4f7567e`·`1ce6517`. (원장 MacroDroid·텔레그램 설정은 진행 중 — 위 §진행)
- **직원 셀프 회원가입(D2) 라이브** (2026-07-30): 로그인/가입 토글·doSignup(이름→user_metadata)·onAuthed 자동 staff + 정책 `profiles_insert_self` + 원장 실행(SQL·가입 켜기·이메일확인 OFF) + 배포 `25f8f22`
- 교정 케이스 보드(ortho.html) 배포·검증 5/5 · jung-plant.com 연결
- 근태 hr.html: M1(로그인·role·지문엑셀 파서·연차·결재·공지·온보딩) + M2(근무표·출퇴근 연동·조퇴·결근확인)
- 백엔드 SQL(Codex 작성·교차검증): ortho·hr(표24)·app_settings

## 원장 결정 대기 (요약)
`AGENTS.md`·`docs/superpowers` 삭제 7건 커밋 여부(현재 복원됨) · 텔레그램 봇/그룹 선택 · 리스킨 레퍼런스 · 온보딩 페널티 세부 · 대체공휴일 확인 · 내부평가 항목
