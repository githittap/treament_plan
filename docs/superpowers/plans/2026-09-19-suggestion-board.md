# 건의함 구현계획

> For agentic workers: 승인된 건의함 설계서를 Task 단위로 실행한다. 각 구현 단계는 TDD RED→GREEN을 거친다.

**Goal:** 직원 허브에 월간 건의함, 좋아요, owner 평가·수상 공개, 안전한 Supabase RLS를 추가한다.

**Architecture:** 새 Supabase 업무 테이블 4개와 공개 ID·순위 보조 테이블, 민감 필드를 제외한 security-invoker 수상 공개 view를 전용 SQL 정본에 둔다. hr.html은 suggestions 탭과 renderSuggestions를 추가하고, 집계·좋아요 상태·표시용 함수는 테스트 경계 안에서 검증한다. SQL 정책 테스트는 파일의 정책·grant·제약을 정적으로 확인하고, live DDL 후 읽기 쿼리와 security advisor로 확인한다.

**Tech Stack:** 단일 HTML, Supabase JS, PostgreSQL 17, Node node:test, Node vm.

## Global Constraints

- 네 역할 모두 열람·작성한다.
- 캠페인당 직원 한 명당 게시글 하나다.
- 자기 글 좋아요 금지, 좋아요 토글, 좋아요는 자동 순위에 사용하지 않는다.
- owner만 점수 1~5·메모·순위 1~3을 관리한다.
- 종료 후 순위·이름·제목·상금만 공개한다.
- RLS와 authenticated 최소 grant를 적용하고 anon 접근은 만들지 않는다.
- 제품 코드 변경은 hr.html, 자동테스트는 tests/suggestion-board.test.js 및 SQL 정적 테스트 파일, SQL 정본은 db/suggestion_board.sql로 제한한다.
- 기존 테이블 데이터·노션·지급 기능·push·deploy는 변경하지 않는다.

## Task 1: 설계서·계획 커밋

**Files:**

- Create: docs/superpowers/specs/2026-09-19-suggestion-board-design.md
- Create: docs/superpowers/plans/2026-09-19-suggestion-board.md

- [x] Step 1: 프로젝트 지침·기존 hr.html·RLS·테스트를 읽고 git clean을 확인한다.

Run:
powershell
git status --short
rg -n "TABS|renderLeaveStatus|my_role|leave_requests|node:test" hr.html db tests

Expected: 기존 구조와 clean 상태가 확인된다.

- [x] Step 2: 설계서와 계획의 미정 항목을 검사한다.

Run:
powershell
git diff --check
rg -n "TODO|TBD|미정|추후|나중에" docs/superpowers/specs/2026-09-19-suggestion-board-design.md docs/superpowers/plans/2026-09-19-suggestion-board.md

Expected: diff check 성공, 검색 결과 없음.

- [x] Step 3: 설계서와 계획을 한국어 커밋한다.

Run:
powershell
git add -- docs/superpowers/specs/2026-09-19-suggestion-board-design.md docs/superpowers/plans/2026-09-19-suggestion-board.md
git commit -m "건의함 설계서와 구현계획 작성"

Expected: 두 문서만 포함된 커밋.

## Task 2: 테스트를 먼저 작성하고 RED 확인

**Files:**

- Create: tests/suggestion-board.test.js
- Create: tests/suggestion-board-sql.test.js

- [ ] Step 1: html 순수 함수·정적 계약 테스트를 작성한다.

테스트 경계는 suggestion-board:test-start/end로 둔다. 다음 함수와 계약을 테스트한다.

- summarizeSuggestions: 게시글 수·받은 좋아요 수·사람별 집계
- canLikeSuggestion: 자기 글·진행 종료·중복 좋아요
- toggleSuggestionLike: 현재 상태에 따른 insert/delete 결정
- winnerVisibility: 종료 전 비공개, 종료 후 순위·이름·제목·상금만
- TABS label/key와 renderSuggestions 라우터
- 오류 메시지와 owner 필드 노출 조건

Run:
powershell
node --test tests/suggestion-board.test.js

Expected RED: suggestion-board 테스트 경계와 함수가 없어 기능 부재로 실패.

- [ ] Step 2: SQL 정적 테스트를 작성한다.

db/suggestion_board.sql을 읽고 다음을 assert한다.

- suggestion_campaigns, suggestions, suggestion_likes, suggestion_reviews 생성
- 네 테이블 RLS enable
- anon grant/policy 없음
- authenticated grant와 owner policy
- auth.uid와 기간 조건
- update USING/WITH CHECK
- 자기 글 좋아요 금지
- award_rank partial unique index
- 공개 view에서 originality_score, review_note, reviewer_id 제외
- 초기 캠페인 insert가 existing rows를 건드리지 않음

Run:
powershell
node --test tests/suggestion-board-sql.test.js

Expected RED: SQL 정본이 없어 파일 존재 assertion에서 실패.

## Task 3: SQL 정본 작성과 로컬 GREEN

**Files:**

- Create: db/suggestion_board.sql
- Test: tests/suggestion-board-sql.test.js

- [ ] Step 1: 최소 SQL을 작성한다.

구현 계약:

sql
create table if not exists public.suggestion_campaigns (...);
create table if not exists public.suggestions (... unique (campaign_id,user_id));
create table if not exists public.suggestion_likes (... primary key (suggestion_id,user_id));
create table if not exists public.suggestion_reviews (...);
create unique index if not exists suggestion_reviews_campaign_award_rank_uq
  on public.suggestion_reviews(campaign_id, award_rank)
  where award_rank is not null;
alter table ... enable row level security;
grant select on ... to authenticated;
revoke all on ... from anon;
create view public.suggestion_awards_public ...;
insert ... where not exists (...);

각 policy는 owner role·auth.uid·기간을 사용하고 UPDATE는 USING과 WITH CHECK를 함께 둔다. 공개 view에는 수상에 필요한 최소 열만 둔다.

- [ ] Step 2: SQL 정적 테스트를 GREEN으로 만든다.

Run:
powershell
node --test tests/suggestion-board-sql.test.js

Expected: SQL 정책·제약·공개 view 테스트 PASS.

- [ ] Step 3: SQL 정본을 한국어 커밋한다.

Run:
powershell
git add -- db/suggestion_board.sql tests/suggestion-board-sql.test.js
git commit -m "건의함 Supabase 스키마와 RLS 추가"

Expected: SQL과 SQL 테스트 커밋 생성.

## Task 4: hr.html 기능 구현 TDD

**Files:**

- Modify: hr.html
- Test: tests/suggestion-board.test.js

- [ ] Step 1: suggestion-board:test-start/end 경계와 TABS·라우터 RED 계약을 고정한다.

순수 함수 시그니처:

- summarizeSuggestions(rows, likes)
- canLikeSuggestion(suggestion, currentUserId, campaign, liked)
- toggleSuggestionLike(suggestionId, liked)
- winnerVisibility(campaign, reviews, suggestions)

Run:
powershell
node --test tests/suggestion-board.test.js

Expected: 경계·탭·함수 부재로 RED.

- [ ] Step 2: 최소 순수 함수와 탭을 구현한다.

TABS에 key suggestions, label 💡 건의함, roles staff/manager/chief/owner를 추가한다. render 라우터에 suggestions 분기를 추가한다. 집계는 rows와 likes를 읽어 자동 계산하고 좋아요로 순위를 계산하지 않는다.

- [ ] Step 3: renderSuggestions를 구현한다.

현재 캠페인·게시글·좋아요·owner 평가를 조회한다. 정상 0건과 조회 오류를 서로 다른 상태로 표시한다. 진행 중 본인 글만 작성·수정·삭제하고, owner는 부적절한 글 삭제와 캠페인·평가 수정을 제공한다. 좋아요는 자기 글 금지와 toggle을 적용하며 성공 응답 후에만 화면을 갱신한다. 종료 후에는 suggestion_awards_public만 사용해 순위·게시자·제목·상금을 표시한다.

- [ ] Step 4: 테스트를 GREEN으로 만든다.

Run:
powershell
node --test tests/suggestion-board.test.js

Expected: 건의함 테스트 전체 PASS.

## Task 5: 라이브 DDL 적용·읽기 검증

**Files:**

- Verify: db/suggestion_board.sql
- Verify: Supabase project texevhsxttfoqkrucfzl

- [ ] Step 1: 적용 전 충돌 객체를 읽는다.

Use Supabase list_tables and execute_sql read-only:
select table_name from information_schema.tables
where table_schema='public'
and table_name in ('suggestion_campaigns','suggestions','suggestion_likes','suggestion_reviews','suggestion_awards_public');

Expected: 결과가 비어 있고 기존 profiles·leave_requests 행 수를 별도로 기록한다.

- [ ] Step 2: SQL을 검토하고 apply_migration으로 한 번 적용한다.

Use Supabase apply_migration:
name: suggestion_board_20260919
project_id: texevhsxttfoqkrucfzl
query: db/suggestion_board.sql의 전체 내용

Expected: DDL 성공. 실패 시 같은 DDL을 반복하지 않고 오류 원인을 검토한다.

- [ ] Step 3: 읽기 쿼리로 객체·초기 캠페인·기존 데이터 불변을 검증한다.

Run read-only SQL checking pg_tables, pg_policies, information_schema.role_table_grants, pg_indexes, initial campaign, count(*) for profiles and leave_requests, and view columns.

Expected: 네 테이블 RLS enabled, authenticated grants/policies present, anon absent, initial campaign one row with 50000/30000/10000, public view excludes sensitive review fields, existing counts unchanged.

- [ ] Step 4: security advisor를 실행한다.

Use Supabase get_advisors security and compare with the pre-apply baseline. Any new suggestion-board finding must be fixed before completion.

## Task 6: 전체 검증과 커밋

- [ ] Step 1: RED/GREEN·전체 테스트를 fresh 실행한다.

Run:
powershell
node --test tests/suggestion-board.test.js
node --test tests/suggestion-board-sql.test.js
node --test tests/*.test.js

Expected: all tests PASS.

- [ ] Step 2: hr.html 두 inline script를 구문검사한다.

Run:
powershell
node -e "const fs=require('fs'),vm=require('vm'); const h=fs.readFileSync('hr.html','utf8'); const b=[...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim()); if(b.length!==2) throw new Error('inline script block count: '+b.length); for(const s of b) new vm.Script(s); console.log('INLINE_SCRIPT_SYNTAX=PASS');"

Expected: INLINE_SCRIPT_SYNTAX=PASS.

- [ ] Step 3: 범위·문법을 확인한다.

Run:
powershell
git diff --check
git status --short

Expected: 허용 파일만 변경되고 SQL·hr.html·테스트 외 파일이 없다.

- [ ] Step 4: 기능을 한국어 커밋한다.

Run:
powershell
git add -- hr.html tests/suggestion-board.test.js
git commit -m "직원 허브 건의함 구현"

Expected: push/deploy 없이 커밋 완료.

## Self-Review

- [ ] 모든 승인 UX와 권한 규칙이 테스트에 연결됐다.
- [ ] likes는 자동 순위를 만들지 않는다.
- [ ] owner 평가 원본과 종료 후 공개 view가 분리됐다.
- [ ] 정상 빈 상태와 오류가 분리됐다.
- [ ] live DDL 검증과 security advisor 비교가 완료됐다.
- [ ] 기존 데이터 변경·삭제, 노션, 지급, push/deploy가 없다.
