import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {MAX_BODY_BYTES,OWNER_BOARD_SLUGS,parseOwnerBoardHtml,sha256Hex,sameHex,validSourceMtime} from '../supabase/functions/owner-board-sync/payload.mjs';
const bytes=s=>new TextEncoder().encode(s);
test('owner-board slug는 허용된 여섯 개만 받는다(넷째 inbox = 총괄 인박스 경고 2026-10-02 · 다섯째 rules_map = AI 규칙 관계도 · 여섯째 codex_flow = 클로드→코덱스 브라우저 흐름 2026-10-08)',()=>{assert.deepEqual([...OWNER_BOARD_SLUGS].sort(),['busd_ledger','codex_flow','inbox','pin_board','rules_map','wordbook']);assert.equal(OWNER_BOARD_SLUGS.has('other'),false);});
test('판 이름(slug) 목록이 Edge·화면(OWNER_BOARDS)·DB 검사(새로 만들 때·운영 바꾸기 SQL)에서 모두 같다',()=>{
  const read=p=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
  const edge=[...OWNER_BOARD_SLUGS].sort();
  const boardsBlock=read('hr.html').match(/const OWNER_BOARDS=\[([\s\S]*?)\n\];/)[1];
  assert.deepEqual([...boardsBlock.matchAll(/slug:'([a-z_]+)'/g)].map(m=>m[1]).sort(),edge);
  const checkList=sql=>[...sql.match(/constraint owner_boards_slug_check check\(slug in\(([^)]*)\)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]).sort();
  // 최신 바꾸기 SQL(owner_boards_rules.sql) 목록 = Edge 목록. 옛 SQL 파일은 그때의 목록 그대로(고치지 않음).
  assert.deepEqual(checkList(read('db/owner_boards_rules.sql')),edge);
  assert.deepEqual(checkList(read('db/owner_boards_rules_rollback.sql')),edge.filter(s=>s!=='rules_map'&&s!=='codex_flow'));
  const four=['busd_ledger','inbox','pin_board','wordbook'];
  assert.deepEqual(checkList(read('db/owner_boards.sql')),four,'새로 만들 때 SQL은 넷째 판까지(그 뒤 rules.sql로 여섯 판)');
  assert.deepEqual(checkList(read('db/owner_boards_inbox.sql')),four);
  assert.deepEqual(checkList(read('db/owner_boards_inbox_rollback.sql')),four.filter(s=>s!=='inbox'));
  const rb=read('db/owner_boards_rules_rollback.sql');
  assert.match(rb,/raise exception/i,'새 판 행이 있으면 중단');assert.doesNotMatch(rb,/(delete|truncate|drop table)/i,'되돌리기 SQL은 행을 지우지 않음');
});
test('최대 4MB UTF-8 HTML을 받고 NUL을 지운 뒤 저장 바이트를 계산한다',()=>{const r=parseOwnerBoardHtml(bytes('<!DOCTYPE HTML><html>가'+String.fromCharCode(0)+'나</html>'));assert.equal(r.ok,true);assert.equal(r.html,'<!DOCTYPE HTML><html>가나</html>');assert.equal(r.bytes,Buffer.byteLength(r.html));assert.equal(parseOwnerBoardHtml(bytes('<html>'+('x'.repeat(MAX_BODY_BYTES-13))+'</html>')).ok,true);assert.equal(parseOwnerBoardHtml(bytes('<html>'+('x'.repeat(MAX_BODY_BYTES))+'</html>')).error,'too_large');});
test('잘못된 UTF-8, HTML이 아닌 본문, 4MB 초과를 거절한다',()=>{assert.equal(parseOwnerBoardHtml(Uint8Array.from([0x3c,0x68,0x74,0x6d,0x6c,0x3e,0xc3,0x28])).error,'invalid_utf8');assert.equal(parseOwnerBoardHtml(bytes('plain text')).error,'invalid_html');assert.equal(parseOwnerBoardHtml(new Uint8Array(MAX_BODY_BYTES+1)).error,'too_large');});
test('HTML doctype 검사와 SHA-256은 정리된 문자열 기준이며 sha는 소문자 64자리다',async()=>{const r=parseOwnerBoardHtml(bytes('<!dOcTyPe html><p>한글</p>'));assert.equal(r.ok,true);const h=await sha256Hex(r.html);assert.match(h,/^[0-9a-f]{64}$/);assert.equal(sameHex(h,h.toUpperCase()),true);assert.equal(sameHex(h,'z'.repeat(64)),false);});
test('X-Source-Mtime은 ISO 시각만 받으며 생략은 null로 둔다',()=>{assert.deepEqual(validSourceMtime(null),{ok:true,value:null});assert.equal(validSourceMtime('2026-09-30T02:00:00Z').ok,true);assert.equal(validSourceMtime('2026-02-30T02:00:00Z').ok,false);assert.equal(validSourceMtime('yesterday').ok,false);});
test('Edge 함수는 POST·토큰 확인·본문 제한·RPC 저장 순서와 비밀 비기록 조건을 갖춘다',()=>{const edge=fs.readFileSync(path.join(process.cwd(),'supabase/functions/owner-board-sync/index.ts'),'utf8');assert.match(edge,/req\.method!=='POST'/);assert.match(edge,/token\.length<32\|\|token\.length>256/);assert.match(edge,/sameHex\(await sha256Hex\(token\),String\(secret\.value\)\)/);assert.match(edge,/reader\.cancel\(\)/);assert.match(edge,/parseOwnerBoardHtml/);assert.match(edge,/owner_board_put/);assert.match(edge,/verify_jwt:true/);assert.doesNotMatch(edge,/console\.(log|error)\s*\(/);});
