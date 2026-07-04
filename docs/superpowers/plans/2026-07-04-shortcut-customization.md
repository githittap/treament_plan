# 단축키 커스터마이즈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 코드 수정 없이 전용 설정 모달에서 단축키를 자유롭게 재배치하고, 그 설정이 컴퓨터(브라우저)별로 localStorage에 독립 저장되게 한다.

**Architecture:** 지금 3군데(표시용 `TREAT_SHORTCUTS` 맵 · keydown 하드코딩 `if` 24개 · 문서)에 흩어진 단축키를 **단일 정본 배열 `SHORTCUT_ACTIONS`** 로 통합한다. 전역 keydown은 `activeShortcutKeymap()`(기본값 위에 localStorage 오버라이드 병합)을 조회해 해당 액션의 `run()`을 디스패치한다. 설정 모달은 이 키맵을 편집·저장한다. 시스템 키(`Ctrl+Z/Y/C/V`·`Delete`·`ESC`)는 기존 처리 그대로 두고 건드리지 않는다.

**Tech Stack:** 단일 파일 `치료계획.html` (Vanilla JS ES6+, HTML5 Canvas, 인라인 CSS/JS, 빌드 없음). 저장은 브라우저 `localStorage`.

## Global Constraints

- 대상 파일은 오직 `치료계획.html` 하나 (+ 마지막에 `CLAUDE.md` 문서). 파일 분리·번들링 금지.
- 기존 코드 스타일·들여쓰기·변수명 규칙 유지 (2-space 인덴트, 세미콜론, 인라인 스타일).
- localStorage 키는 정확히 `treatplan_shortcuts_v1`.
- 커스터마이즈 대상은 **24개 단일 글자/숫자 키**뿐. 시스템 키(`Ctrl+Z/Y/C/V`·`Delete`·`ESC`)는 재배치 불가·기존 로직 불변.
- 테스트 러너 없음 → 검증은 (a) Node 문법 검사 `%TEMP%\dsyntax.mjs`, (b) Node 순수 로직 테스트 `%TEMP%\sc_logic.mjs`, (c) 로컬 HTTP 서버 + 브라우저 E2E. 임시 스크립트는 커밋하지 않음.
- git 명령은 리포 루트 기준. bash cwd가 `Z:\코딩 프로젝트(클로드 작업)`일 수 있으므로 커밋 시 `git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan"` 형태 사용.
- 배포는 커밋까지만. push는 사용자가 GitHub Desktop으로 직접 (요청 시에만).
- 마커/주석을 새로 추가하는 기능이 아니므로 `redoStack=[]`·`pushUndo()` 관련 규칙은 해당 없음.

**24개 액션 정본 (기본값 = 현재 코드 실제 동작):**

| id | group | label | def | treatId |
|----|-------|-------|:---:|---------|
| mode_select | 모드 | 선택/이동 모드 | A | — |
| mode_text | 모드 | 텍스트 모드 | T | — |
| mode_erase | 모드 | 지우개 모드 | E | — |
| mode_batch | 모드 | 다중배치 토글 | R | — |
| act_copyall | 모드 | 이미지+FDI 합성복사 | B | — |
| treat_implant | 치료종류 | 임플란트 | 2 | implant |
| treat_inlay | 치료종류 | 인레이 | I | inlay |
| treat_resin | 치료종류 | 레진 | F | resin |
| treat_core_crown | 치료종류 | 코어Cr. | C | core_crown |
| treat_ongoing | 치료종류 | 진행중 | W | ongoing |
| treat_done | 치료종류 | 완료 | D | done |
| treat_hold | 치료종류 | 설명X | H | hold |
| treat_need | 치료종류 | 치료필요 | N | need |
| treat_tempset | 치료종류 | T/S 임시접착 | S | tempset |
| treat_permset | 치료종류 | F/S 영구접착 | P | permset |
| sticker_extraction | 스티커 | 발치 | X | — |
| sticker_pontic | 스티커 | 폰틱 | 3 | pontic |
| sticker_rct | 스티커 | RCT | V | — |
| sticker_gbr | 스티커 | GBR | G | — |
| pen_mark | 펜/표시 | 표시(빨간펜) | M | — |
| pen_connect | 펜/표시 | 연결선 | L | — |
| pen_line | 펜/표시 | 직선 | K | — |
| pen_arrow | 펜/표시 | 화살표 | J | — |
| pen_rect | 펜/표시 | 자유 네모 | U | — |

---

## File Structure

- `치료계획.html` — 유일한 프로덕션 파일. 아래 4개 논리 블록을 추가/수정:
  1. **단축키 코어** (순수 데이터 `SHORTCUT_ACTIONS` + 순수 헬퍼 + localStorage 헬퍼) — Task 1.
  2. **핸들러 함수** (`selectTreat` 최상위로 이동, 신규 `selectSticker`·`toggleSelectMode/TextMode/EraseMode`) + **keydown 디스패치 재배선** — Task 2.
  3. **치료 그리드 배지**가 키맵을 읽도록 (`renderTreatItem`) — Task 3.
  4. **설정 모달** (헤더 버튼 + 모달 HTML + CSS + `renderShortcutSettings`) — Task 4 / **캡처·충돌·리셋 상호작용** — Task 5.
- `CLAUDE.md` — 단축키 일람 표 갱신 — Task 6.

---

## Task 1: 단축키 코어 (정본 데이터 + 순수 로직)

앱 동작을 아직 바꾸지 않는다. 데이터와 순수 함수만 추가하고 Node로 검증한다.

**Files:**
- Modify: `치료계획.html` — `TREAT_SHORTCUTS` 정의(현재 L1218-1223) **바로 위**에 새 블록 삽입. (`TREAT_SHORTCUTS`는 Task 3에서 제거하므로 지금은 그대로 둔다.)
- Test: `%TEMP%\sc_logic.mjs` (임시, 커밋 안 함)

**Interfaces:**
- Produces: `SHORTCUT_ACTIONS`(배열), `SHORTCUT_STORE_KEY`, `SHORTCUT_GROUP_ORDER`, `normalizeShortcutKey(k)→'A'|'2'|null`, `shortcutDefaults()→{id:def}`, `mergeShortcutKeymap(defaults,overrides)→{id:key}`, `findShortcutConflict(keymap,key,exceptId)→id|null`, `loadShortcutOverrides()→{}`, `saveShortcutOverrides(ov)`, `activeShortcutKeymap()→{id:key}`, `setShortcutOverride(id,key)`, `resetShortcuts()`.
- `run` 콜백은 `selectTreat`/`selectPenTool`/`selectSticker`/`toggle*Mode` 를 참조하지만 **정의 시점엔 호출되지 않음** → Task 2에서 그 함수들이 생기기 전이라도 문법상 안전.

- [ ] **Step 1: 순수 로직 테스트 작성** (`%TEMP%\sc_logic.mjs`)

```js
import { readFileSync } from 'fs';
import assert from 'assert';
const src = readFileSync(process.argv[2],'utf8');
function extractFn(name){
  const i = src.indexOf('function '+name+'(');
  if(i<0) throw new Error('fn not found: '+name);
  let d=0,k=src.indexOf('{',i);
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(d===0){k++;break;}} }
  return src.slice(i,k);
}
function extractArr(name){
  const m = new RegExp('const '+name+'\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;').exec(src);
  if(!m) throw new Error('const not found: '+name);
  return m[1];
}
// run 화살표가 참조하는 함수들 스텁 (호출 안 되므로 no-op)
globalThis.selectTreat=()=>{}; globalThis.selectPenTool=()=>{}; globalThis.selectSticker=()=>{};
globalThis.toggleSelectMode=()=>{}; globalThis.toggleTextMode=()=>{}; globalThis.toggleEraseMode=()=>{};
globalThis.document={getElementById:()=>null};
const code =
  'const SHORTCUT_ACTIONS='+extractArr('SHORTCUT_ACTIONS')+';\n'+
  extractFn('normalizeShortcutKey')+'\n'+
  extractFn('shortcutDefaults')+'\n'+
  extractFn('mergeShortcutKeymap')+'\n'+
  extractFn('findShortcutConflict')+'\n'+
  'globalThis.__S={SHORTCUT_ACTIONS,normalizeShortcutKey,shortcutDefaults,mergeShortcutKeymap,findShortcutConflict};';
new Function(code)();
const S=globalThis.__S;
// 데이터 무결성
assert.equal(S.SHORTCUT_ACTIONS.length,24,'24 actions');
const ids=S.SHORTCUT_ACTIONS.map(a=>a.id);
assert.equal(new Set(ids).size,24,'ids unique');
const defs=S.SHORTCUT_ACTIONS.map(a=>a.def);
assert.equal(new Set(defs).size,24,'default keys unique');
S.SHORTCUT_ACTIONS.forEach(a=>{ assert.ok(a.id&&a.group&&a.label&&a.def,'fields present: '+a.id); });
// normalize
assert.equal(S.normalizeShortcutKey('a'),'A');
assert.equal(S.normalizeShortcutKey('A'),'A');
assert.equal(S.normalizeShortcutKey('2'),'2');
assert.equal(S.normalizeShortcutKey('Enter'),null);
assert.equal(S.normalizeShortcutKey(' '),null);
assert.equal(S.normalizeShortcutKey('F1'),null);
// defaults + merge + conflict
const d=S.shortcutDefaults();
assert.equal(d.treat_resin,'F');
assert.equal(d.sticker_rct,'V');
const km=S.mergeShortcutKeymap(d,{treat_resin:'V',sticker_rct:''});
assert.equal(km.treat_resin,'V');
assert.equal(km.sticker_rct,'');
assert.equal(S.findShortcutConflict(d,'V','treat_resin'),'sticker_rct');
assert.equal(S.findShortcutConflict(d,'F','treat_resin'),null); // 자기 자신 제외
assert.equal(S.findShortcutConflict(km,'V','treat_resin'),null); // rct 비워짐
console.log('SC LOGIC OK');
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node "%TEMP%\sc_logic.mjs" "Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\치료계획.html"`
Expected: FAIL — `const not found: SHORTCUT_ACTIONS` (아직 코드 없음).

- [ ] **Step 3: 코어 블록 삽입**

`치료계획.html`에서 `const TREAT_SHORTCUTS = {` 줄(현재 L1218) **바로 앞**에 아래를 삽입:

```js
// ===== 단축키 커스터마이즈 코어 =====
const SHORTCUT_ACTIONS = [
  { id:'mode_select', group:'모드', label:'선택/이동 모드', def:'A', run:()=>toggleSelectMode() },
  { id:'mode_text',   group:'모드', label:'텍스트 모드',   def:'T', run:()=>toggleTextMode() },
  { id:'mode_erase',  group:'모드', label:'지우개 모드',   def:'E', run:()=>toggleEraseMode() },
  { id:'mode_batch',  group:'모드', label:'다중배치 토글', def:'R', run:()=>{ const t=document.getElementById('batchToggle'); if(t){ t.checked=!t.checked; t.dispatchEvent(new Event('change')); } } },
  { id:'act_copyall', group:'모드', label:'이미지+FDI 합성복사', def:'B', run:()=>{ const b=document.getElementById('copyAllBtn'); if(b) b.click(); } },
  { id:'treat_implant',    group:'치료종류', label:'임플란트', def:'2', treatId:'implant',    run:()=>selectTreat('implant') },
  { id:'treat_inlay',      group:'치료종류', label:'인레이',   def:'I', treatId:'inlay',      run:()=>selectTreat('inlay') },
  { id:'treat_resin',      group:'치료종류', label:'레진',     def:'F', treatId:'resin',      run:()=>selectTreat('resin') },
  { id:'treat_core_crown', group:'치료종류', label:'코어Cr.',  def:'C', treatId:'core_crown', run:()=>selectTreat('core_crown') },
  { id:'treat_ongoing',    group:'치료종류', label:'진행중',   def:'W', treatId:'ongoing',    run:()=>selectTreat('ongoing') },
  { id:'treat_done',       group:'치료종류', label:'완료',     def:'D', treatId:'done',       run:()=>selectTreat('done') },
  { id:'treat_hold',       group:'치료종류', label:'설명X',    def:'H', treatId:'hold',       run:()=>selectTreat('hold') },
  { id:'treat_need',       group:'치료종류', label:'치료필요', def:'N', treatId:'need',       run:()=>selectTreat('need') },
  { id:'treat_tempset',    group:'치료종류', label:'T/S 임시접착', def:'S', treatId:'tempset', run:()=>selectTreat('tempset') },
  { id:'treat_permset',    group:'치료종류', label:'F/S 영구접착', def:'P', treatId:'permset', run:()=>selectTreat('permset') },
  { id:'sticker_extraction', group:'스티커', label:'발치', def:'X', run:()=>selectSticker('extraction') },
  { id:'sticker_pontic',     group:'스티커', label:'폰틱', def:'3', treatId:'pontic', run:()=>selectSticker('pontic') },
  { id:'sticker_rct',        group:'스티커', label:'RCT',  def:'V', run:()=>selectSticker('rct') },
  { id:'sticker_gbr',        group:'스티커', label:'GBR',  def:'G', run:()=>selectSticker('gbr') },
  { id:'pen_mark',    group:'펜/표시', label:'표시(빨간펜)', def:'M', run:()=>selectPenTool('mark') },
  { id:'pen_connect', group:'펜/표시', label:'연결선',       def:'L', run:()=>selectPenTool('connect') },
  { id:'pen_line',    group:'펜/표시', label:'직선',         def:'K', run:()=>selectPenTool('line') },
  { id:'pen_arrow',   group:'펜/표시', label:'화살표',       def:'J', run:()=>selectPenTool('arrow') },
  { id:'pen_rect',    group:'펜/표시', label:'자유 네모',    def:'U', run:()=>selectPenTool('rect') },
];
const SHORTCUT_STORE_KEY = 'treatplan_shortcuts_v1';
const SHORTCUT_GROUP_ORDER = ['모드','치료종류','스티커','펜/표시'];
function normalizeShortcutKey(k){
  if(typeof k!=='string' || k.length!==1) return null;
  if(/[a-z]/i.test(k)) return k.toUpperCase();
  if(/[0-9]/.test(k)) return k;
  return null;
}
function shortcutDefaults(){ const m={}; SHORTCUT_ACTIONS.forEach(a=>{ m[a.id]=a.def; }); return m; }
function mergeShortcutKeymap(defaults, overrides){ return Object.assign({}, defaults, overrides); }
function findShortcutConflict(keymap, key, exceptId){
  return Object.keys(keymap).find(id=>id!==exceptId && keymap[id]===key) || null;
}
function loadShortcutOverrides(){
  try{ const raw=localStorage.getItem(SHORTCUT_STORE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e){ return {}; }
}
function saveShortcutOverrides(ov){ try{ localStorage.setItem(SHORTCUT_STORE_KEY, JSON.stringify(ov)); }catch(e){} }
function activeShortcutKeymap(){ return mergeShortcutKeymap(shortcutDefaults(), loadShortcutOverrides()); }
function setShortcutOverride(actionId, key){ const ov=loadShortcutOverrides(); ov[actionId]=key; saveShortcutOverrides(ov); }
function resetShortcuts(){ try{ localStorage.removeItem(SHORTCUT_STORE_KEY); }catch(e){} }
// ===== /단축키 코어 =====
```

- [ ] **Step 4: 로직 테스트 실행 → 통과 확인**

Run: `node "%TEMP%\sc_logic.mjs" "Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\치료계획.html"`
Expected: `SC LOGIC OK`

- [ ] **Step 5: 문법 검사** (전체 스크립트 블록)

Run: `node "%TEMP%\dsyntax.mjs" "Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\치료계획.html"`
Expected: `SYNTAX OK (N script blocks)`
> `dsyntax.mjs`가 없으면 생성: 각 `<script>` 블록을 `new Function`으로 파싱해 문법 오류를 잡는 스크립트 (CLAUDE 세션에 기존 존재).

- [ ] **Step 6: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add 치료계획.html && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "feat(shortcut): 단축키 정본 데이터·순수 로직 추가 - 2026-07-04"
```

---

## Task 2: keydown 디스패치 재배선 (동작 보존)

핸들러 함수를 최상위로 정리하고, 하드코딩 `if` 24개를 키맵 조회 1개로 교체한다. **관찰 동작은 이전과 100% 동일** (모든 기본 키가 그대로 작동).

**Files:**
- Modify: `치료계획.html`
  - `selectPenTool` 정의 아래(현재 L1109-1127 블록 끝 다음)에 신규 함수 4개 삽입.
  - keydown 핸들러 내부 `function selectTreat` 정의(현재 L1566-1573) **삭제** 후 최상위 함수로 이동.
  - keydown 핸들러의 A/R/T/E/selectTreat/X/2/3/i/f/c/v/g/w/d/h/n/s/p/m/l/k/j/u/B 처리부(현재 L1492-1601) **전체 삭제** 후 디스패치 블록으로 교체.

**Interfaces:**
- Consumes (Task 1): `normalizeShortcutKey`, `activeShortcutKeymap`, `SHORTCUT_ACTIONS`.
- Produces: 최상위 `selectTreat(id)`, `selectSticker(kind)`, `toggleSelectMode()`, `toggleTextMode()`, `toggleEraseMode()`. (Task 3·5가 `selectTreat`/`selectSticker`를 간접 사용.)

- [ ] **Step 1: 핸들러 함수 최상위 삽입**

`selectPenTool` 함수 블록(현재 L1109 `function selectPenTool(tool){` … 닫는 `}`) **바로 다음 줄**에 아래 5개 함수를 삽입. (본문은 현재 keydown 안 인라인 코드에서 그대로 옮긴 것.)

```js
function selectTreat(id){
  activeTreatId = id; activePenTool=null; activeSticker=null;
  mode='tooth';
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.mode-btn[data-mode="tooth"]').classList.add('active');
  document.getElementById('freeOptions').style.display='none';
  renderPenTools(); renderStickers(); renderTreatList();
}
function selectSticker(kind){
  activeSticker=kind; activePenTool=null; mode='tooth';
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.mode-btn[data-mode="tooth"]').classList.add('active');
  renderPenTools(); renderStickers(); renderTreatList();
}
function toggleSelectMode(){
  if(mode==='select'){
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="tooth"]').classList.add('active');
    mode='tooth'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='치료종류를 고르고 위치를 클릭 → 치아/옵션 입력 후 Enter로 그 시점까지 선택된 내용만 표시됩니다.';
    renderPenTools(); renderStickers();
  } else {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('selectModeBtn').classList.add('active');
    mode='select'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='마커를 클릭하여 선택 → 드래그로 이동, 모서리 핸들로 크기 조절. 더블클릭으로 수정.';
    renderPenTools(); renderStickers(); renderTreatList();
    closePopup();
  }
}
function toggleTextMode(){
  const textBtn = document.getElementById('textModeBtn');
  if(mode==='text'){
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="tooth"]').classList.add('active');
    textBtn.classList.remove('active');
    mode='tooth'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='치료종류를 고르고 위치를 클릭 → 치아/옵션 입력 후 Enter로 그 시점까지 선택된 내용만 표시됩니다.';
    renderPenTools(); renderStickers();
  } else {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    textBtn.classList.add('active');
    mode='text'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='이미지를 클릭하면 자유 텍스트를 입력할 수 있습니다. 기존 텍스트는 더블클릭으로 수정.';
    renderPenTools(); renderStickers(); renderTreatList();
    closePopup();
  }
}
function toggleEraseMode(){
  if(mode==='erase'){
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="tooth"]').classList.add('active');
    mode='tooth'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='치료종류를 고르고 위치를 클릭 → 치아/옵션 입력 후 Enter로 그 시점까지 선택된 내용만 표시됩니다.';
    renderPenTools(); renderStickers();
  } else {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="erase"]').classList.add('active');
    mode='erase'; activePenTool=null; activeSticker=null;
    document.getElementById('freeOptions').style.display='none';
    document.getElementById('modeHint').textContent='지울 항목(마커·선·텍스트·영역·배치점)을 클릭하세요.';
    renderPenTools(); renderStickers(); renderTreatList();
    closePopup();
  }
}
```

- [ ] **Step 2: keydown 하드코딩부 교체**

keydown 핸들러에서 `if(e.ctrlKey||e.metaKey) return;`(현재 L1488) 다음의 `const tag ...`·`INPUT/TEXTAREA` 가드(L1489-1490)는 **유지**하고, 그 아래 `// A → 선택/이동 모드 토글`(L1492)부터 `if(e.key==='b'||e.key==='B'){ ... }`(L1601)까지 **전부 삭제**한 뒤 아래로 교체:

```js
  // 사용자 지정 단축키(모드·치료종류·스티커·펜) — 설정표 기반 디스패치
  const _scKey = normalizeShortcutKey(e.key);
  if(_scKey){
    const _km = activeShortcutKeymap();
    const _actId = Object.keys(_km).find(id => _km[id] === _scKey);
    if(_actId){
      const _act = SHORTCUT_ACTIONS.find(a => a.id === _actId);
      if(_act && _act.run) _act.run();
    }
  }
```

> 삭제 대상에는 keydown 내부 `function selectTreat(id){...}` 정의도 포함된다 (Step 1에서 최상위로 옮겼으므로 중복 제거). `selectPenTool`은 원래 최상위라 그대로 둔다.

- [ ] **Step 3: 문법 검사**

Run: `node "%TEMP%\dsyntax.mjs" "Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\치료계획.html"`
Expected: `SYNTAX OK (N script blocks)`

- [ ] **Step 4: 브라우저 회귀 E2E**

로컬 서버 기동 후 브라우저에서 확인:
```bash
# 리포 폴더에서
python -m http.server 8899
```
Chrome MCP로 `http://localhost:8899/%EC%B9%98%EB%A3%8C%EA%B3%84%ED%9A%8D.html` 로드 → 이미지 하나 붙여넣기(또는 `loadImageFromFile`) 후, 콘솔(`javascript_tool`)에서 대표 키를 디스패치해 검증:
```js
// 각 키가 이전과 동일 동작하는지 표본 확인
function press(k){ window.dispatchEvent(new KeyboardEvent('keydown',{key:k})); }
press('f'); // resin 선택
({resin: activeTreatId==='resin'});          // → true 기대
press('v'); ({rct: activeSticker==='rct'});  // → true
press('x'); ({ext: activeSticker==='extraction'}); // → true
press('3'); ({pontic: activeSticker==='pontic'}); // → true
press('a'); ({selectMode: mode==='select'}); // → true
press('a'); ({toothBack: mode==='tooth'});   // → true (토글 복귀)
press('e'); ({erase: mode==='erase'});       // → true
press('m'); ({markPen: activePenTool==='mark'}); // → true
press('2'); ({implant: activeTreatId==='implant'}); // → true
```
Expected: 모든 표현식 `true`. (24개 중 대표 표본; 나머지도 같은 경로라 통과 간주.)

- [ ] **Step 5: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add 치료계획.html && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "refactor(shortcut): keydown을 키맵 디스패치로 재배선 (동작 보존) - 2026-07-04"
```

---

## Task 3: 치료 그리드 배지가 키맵을 읽도록

`renderTreatItem`이 정적 `TREAT_SHORTCUTS` 대신 활성 키맵을 읽게 하고, 이제 고아가 된 `TREAT_SHORTCUTS`를 제거한다.

**Files:**
- Modify: `치료계획.html` — `renderTreatItem`(현재 L1224+) 내 `scKey` 계산, 그리고 `TREAT_SHORTCUTS` const(현재 L1218-1223) 제거. `shortcutKeyForTreat` 헬퍼 추가.

**Interfaces:**
- Consumes (Task 1/2): `activeShortcutKeymap`, `SHORTCUT_ACTIONS`(각 항목 `treatId`).

- [ ] **Step 1: 배지 헬퍼 추가**

Task 1의 코어 블록 끝(`// ===== /단축키 코어 =====` 바로 위)에 추가:
```js
function shortcutKeyForTreat(treatId){
  const km = activeShortcutKeymap();
  const act = SHORTCUT_ACTIONS.find(a=>a.treatId===treatId);
  return act ? (km[act.id]||'') : '';
}
```

- [ ] **Step 2: `renderTreatItem`의 scKey 교체**

현재 (L1230):
```js
  const scKey = TREAT_SHORTCUTS[t.id] || '';
```
로 교체:
```js
  const scKey = shortcutKeyForTreat(t.id);
```

- [ ] **Step 3: 고아가 된 `TREAT_SHORTCUTS` 삭제**

현재 L1218-1223의 블록을 삭제:
```js
const TREAT_SHORTCUTS = {
  'implant':'2', 'pontic':'3',
  'core_crown':'C', 'inlay':'I', 'resin':'F',
  'ongoing':'W', 'done':'D', 'hold':'H', 'need':'N',
  'tempset':'S', 'permset':'P'
};
```
> 검증: `grep TREAT_SHORTCUTS 치료계획.html` → 결과 0건이어야 함.

- [ ] **Step 4: 문법 검사**

Run: `node "%TEMP%\dsyntax.mjs" "Z:\코딩 프로젝트(클로드 작업)\치료계획 코딩\treament_plan\치료계획.html"`
Expected: `SYNTAX OK (N script blocks)`

- [ ] **Step 5: 브라우저 E2E — 배지 반영**

로컬 서버 로드 후 콘솔:
```js
// 기본값 배지 확인
localStorage.removeItem('treatplan_shortcuts_v1'); renderTreatList();
// resin 버튼 배지에 'F'가 보여야 함 (DOM 텍스트로 확인)
[...document.querySelectorAll('.treat-item')].some(el=>el.textContent.includes('레진')&&el.textContent.includes('F')); // → true
// 오버라이드 후 갱신
localStorage.setItem('treatplan_shortcuts_v1', JSON.stringify({treat_resin:'Y'})); renderTreatList();
[...document.querySelectorAll('.treat-item')].some(el=>el.textContent.includes('레진')&&el.textContent.includes('Y')); // → true
localStorage.removeItem('treatplan_shortcuts_v1'); renderTreatList();
```
Expected: 두 `some(...)` 모두 `true`.

- [ ] **Step 6: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add 치료계획.html && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "feat(shortcut): 치료 그리드 배지를 활성 키맵 기반으로 - 2026-07-04"
```

---

## Task 4: 설정 모달 (셸 + 목록 렌더)

헤더 버튼 + 모달 HTML + 다크테마 CSS + `renderShortcutSettings` 목록. 이 태스크까지는 **편집 없이 보기만** 된다.

**Files:**
- Modify: `치료계획.html`
  - 헤더 `🦷 임플란트 기록` 버튼(현재 L609-610) 다음에 `⌨️ 단축키` 버튼 추가.
  - 모달 CSS 셀렉터(현재 L547, L554-555)에 `#shortcutModal` 추가.
  - `helpModal` div(현재 L785) **앞**에 `#shortcutModal` HTML 추가.
  - 스크립트 끝부(예: `// ---------- Paste support ----------` 현재 L1604 **앞**)에 `openShortcutSettings`·`renderShortcutSettings`·`shortcutCaptureId` 추가.

**Interfaces:**
- Consumes (Task 1): `SHORTCUT_ACTIONS`, `SHORTCUT_GROUP_ORDER`, `activeShortcutKeymap`, `resetShortcuts`.
- Produces: `openShortcutSettings()`, `renderShortcutSettings()`, `let shortcutCaptureId`. (Task 5가 캡처 로직에서 사용.)

- [ ] **Step 1: 헤더 버튼 추가**

현재 L610 `🦷 임플란트 기록` 버튼(`</button>`)  **다음 줄**에 삽입:
```html
    <button id="shortcutOpenBtn" onclick="openShortcutSettings()"
      style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:#fff;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px;cursor:pointer;letter-spacing:0.2px;margin-right:10px;">⌨️ 단축키</button>
```

- [ ] **Step 2: 다크테마 CSS에 `#shortcutModal` 추가**

현재 L547:
```css
  #implantModal > div, #helpModal > div{
```
→
```css
  #implantModal > div, #helpModal > div, #shortcutModal > div{
```
현재 L554-555:
```css
  #helpModal div, #helpModal li, #helpModal ul, #helpModal span,
  #implantModal div, #implantModal li, #implantModal span{color:#d3ebe8 !important;}
```
→
```css
  #helpModal div, #helpModal li, #helpModal ul, #helpModal span,
  #implantModal div, #implantModal li, #implantModal span,
  #shortcutModal div, #shortcutModal span{color:#d3ebe8 !important;}
```
> 배지 버튼은 `<button>`이라 이 규칙(div/span)에 영향받지 않아 색이 유지된다.

- [ ] **Step 3: 모달 HTML 추가**

현재 L785 `<div id="helpModal" ...>` **바로 앞**에 삽입:
```html
<div id="shortcutModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:999;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:14px;max-width:560px;width:95%;max-height:88vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,0.35);">
    <div style="background:linear-gradient(135deg,#1d6e6b,#2a8a87);padding:18px 22px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:17px;font-weight:800;">⌨️ 단축키 설정</div>
      <button onclick="document.getElementById('shortcutModal').style.display='none'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:20px;cursor:pointer;border-radius:6px;padding:2px 10px;">✕</button>
    </div>
    <div style="padding:16px 20px;font-size:13px;color:#1c2733;">
      <div style="margin-bottom:10px;color:#5b6b7a;font-size:12px;line-height:1.6;">항목의 키 배지를 클릭한 뒤 원하는 키를 누르세요. (ESC 취소 · Delete 미지정) · 시스템 키(Ctrl+Z/Y/C/V·Delete·ESC)는 고정입니다. 설정은 <b>이 컴퓨터에만</b> 저장됩니다.</div>
      <div id="shortcutList"></div>
      <div style="display:flex;justify-content:space-between;margin-top:16px;">
        <button onclick="if(confirm('모든 단축키를 기본값으로 되돌릴까요?')){resetShortcuts();renderShortcutSettings();renderTreatList();}" style="background:#eef2f5;border:1px solid #d3dde5;color:#33475b;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">기본값으로 되돌리기</button>
        <button onclick="document.getElementById('shortcutModal').style.display='none'" style="background:var(--teal-dark);border:none;color:#fff;border-radius:8px;padding:8px 18px;font-size:12.5px;font-weight:700;cursor:pointer;">닫기</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 렌더·오픈 함수 추가**

현재 L1604 `// ---------- Paste support ----------` **바로 앞**에 삽입:
```js
// ---------- 단축키 설정 UI ----------
let shortcutCaptureId = null;
function openShortcutSettings(){ shortcutCaptureId=null; renderShortcutSettings(); document.getElementById('shortcutModal').style.display='flex'; }
function renderShortcutSettings(){
  const km = activeShortcutKeymap();
  const wrap = document.getElementById('shortcutList');
  wrap.innerHTML='';
  SHORTCUT_GROUP_ORDER.forEach(g=>{
    const h=document.createElement('div');
    h.textContent=g;
    h.style.cssText='font-weight:800;color:#2a8a87;margin:12px 0 6px;border-bottom:1px solid #e0f5f4;padding-bottom:4px;';
    wrap.appendChild(h);
    SHORTCUT_ACTIONS.filter(a=>a.group===g).forEach(a=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:5px 2px;';
      const lab=document.createElement('span'); lab.textContent=a.label;
      const key=km[a.id];
      const capturing=(shortcutCaptureId===a.id);
      const btn=document.createElement('button');
      btn.textContent = capturing ? '키 누르세요…' : (key ? key : '미지정');
      btn.style.cssText='min-width:78px;border-radius:7px;padding:5px 10px;font-size:13px;font-weight:800;cursor:pointer;border:1px solid '+
        (capturing?'#f0a500':(key?'#2a8a87':'#e0645a'))+';background:'+
        (capturing?'#fff6e0':(key?'#eaf6f5':'#fdeceb'))+';color:'+
        (capturing?'#a06a00':(key?'#1d6e6b':'#c0392b'))+';';
      btn.addEventListener('click',()=>{ shortcutCaptureId = capturing ? null : a.id; renderShortcutSettings(); });
      row.appendChild(lab); row.appendChild(btn); wrap.appendChild(row);
    });
  });
}
```

- [ ] **Step 5: 문법 검사 + 브라우저 E2E**

Run: `node "%TEMP%\dsyntax.mjs" "...치료계획.html"` → `SYNTAX OK`
브라우저 콘솔:
```js
openShortcutSettings();
document.getElementById('shortcutModal').style.display; // → 'flex'
document.querySelectorAll('#shortcutList > div').length; // 그룹헤더4 + 액션행24 = 28
[...document.querySelectorAll('#shortcutList button')].length; // → 24 (각 액션 배지)
document.getElementById('shortcutModal').style.display='none';
```
Expected: display `flex`, 자식 div 28, 배지 버튼 24. 화면상 4그룹으로 나뉘고 각 배지에 기본키(A,T,E,R,B,2,I,F…) 표시.

- [ ] **Step 6: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add 치료계획.html && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "feat(shortcut): 단축키 설정 모달 셸·목록 렌더 - 2026-07-04"
```

---

## Task 5: 캡처 · 충돌 · 미지정 · 리셋 (편집 완성)

배지 클릭 후 키 캡처, 충돌 시 바꿔치기+확인, Delete로 미지정, 즉시 저장·반영을 완성한다.

**Files:**
- Modify: `치료계획.html`
  - 전역 keydown 핸들러 **최상단**(현재 L1435 `window.addEventListener('keydown', e=>{` 바로 다음)에 설정창 가로채기 블록 삽입.
  - Task 4의 단축키 UI 블록에 `commitShortcutAssign` 추가.

**Interfaces:**
- Consumes: `shortcutCaptureId`(Task 4), `normalizeShortcutKey`·`activeShortcutKeymap`·`findShortcutConflict`·`setShortcutOverride`(Task 1), `renderShortcutSettings`(Task 4), `renderTreatList`.

- [ ] **Step 1: `commitShortcutAssign` 추가**

Task 4의 `// ---------- 단축키 설정 UI ----------` 블록 끝(`renderShortcutSettings` 함수 다음)에 추가:
```js
function commitShortcutAssign(actionId, key){
  const km = activeShortcutKeymap();
  const conflictId = findShortcutConflict(km, key, actionId);
  if(conflictId){
    const other = SHORTCUT_ACTIONS.find(a=>a.id===conflictId);
    const cur = SHORTCUT_ACTIONS.find(a=>a.id===actionId);
    if(!confirm("'"+key+"' 키는 지금 '"+other.label+"'가 쓰는 중입니다. '"+cur.label+"'로 바꿀까요?")){
      shortcutCaptureId=null; renderShortcutSettings(); return;
    }
    setShortcutOverride(conflictId, ''); // 뺏긴 기능 → 미지정
  }
  setShortcutOverride(actionId, key);
  shortcutCaptureId=null;
  renderShortcutSettings(); renderTreatList();
}
```

- [ ] **Step 2: keydown 최상단 가로채기 삽입**

현재 L1435 `window.addEventListener('keydown', e=>{` **바로 다음 줄**에 삽입 (기존 Delete/ESC/Ctrl 처리보다 앞):
```js
  // 단축키 설정창이 열려 있으면 앱 단축키를 가로챈다
  const _scModal = document.getElementById('shortcutModal');
  if(_scModal && _scModal.style.display==='flex'){
    if(shortcutCaptureId){
      e.preventDefault();
      const _capId = shortcutCaptureId;
      if(e.key==='Escape'){ shortcutCaptureId=null; renderShortcutSettings(); return; }
      if(e.key==='Delete'||e.key==='Backspace'){ setShortcutOverride(_capId,''); shortcutCaptureId=null; renderShortcutSettings(); renderTreatList(); return; }
      if(e.ctrlKey||e.metaKey||e.altKey) return;
      const _nk = normalizeShortcutKey(e.key);
      if(!_nk) return; // 글자/숫자만 허용
      commitShortcutAssign(_capId, _nk);
      return;
    }
    if(e.key==='Escape'){ _scModal.style.display='none'; return; }
    return; // 설정창 열림 + 캡처 아님: 그 외 키 무시(뒤 배치 방지)
  }
```

- [ ] **Step 3: 문법 검사**

Run: `node "%TEMP%\dsyntax.mjs" "...치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 4: 브라우저 E2E — 전체 성공 기준**

로컬 서버 로드 후 콘솔에서 순서대로:
```js
localStorage.removeItem('treatplan_shortcuts_v1');
function press(k,opt){ window.dispatchEvent(new KeyboardEvent('keydown',Object.assign({key:k},opt||{}))); }

// (성공기준2) 캡처 배정: 레진 F→Y
openShortcutSettings(); shortcutCaptureId='treat_resin'; renderShortcutSettings();
press('y');
activeShortcutKeymap().treat_resin;          // → 'Y'
document.getElementById('shortcutModal').style.display='none';
press('y'); ({resinByY: activeTreatId==='resin'}); // → true
press('f'); ({fNoLongerResin: activeTreatId!=='resin' || false}); // F는 이제 레진 아님

// (성공기준3) 지속성
JSON.parse(localStorage.getItem('treatplan_shortcuts_v1')).treat_resin; // → 'Y'

// (성공기준5) 충돌 바꿔치기: 레진에 V(=RCT) 배정 — confirm 자동 수락
const _origConfirm=window.confirm; window.confirm=()=>true;
openShortcutSettings(); shortcutCaptureId='treat_resin'; renderShortcutSettings();
press('v');
window.confirm=_origConfirm;
activeShortcutKeymap().treat_resin;   // → 'V'
activeShortcutKeymap().sticker_rct;   // → '' (미지정)
document.getElementById('shortcutModal').style.display='none';
press('v'); ({vIsResin: activeTreatId==='resin'}); // → true

// (성공기준6) 리셋
resetShortcuts();
activeShortcutKeymap().treat_resin;   // → 'F'
localStorage.getItem('treatplan_shortcuts_v1'); // → null

// (성공기준8) 시스템 키 불변: 설정 목록에 없음
SHORTCUT_ACTIONS.some(a=>['Ctrl+Z','Delete','ESC'].includes(a.def)); // → false
```
Expected: 각 주석의 기대값과 일치. 특히 `treat_resin`이 'Y'→'V'→'F'로 변하고, 충돌 시 `sticker_rct===''`.
추가 수동 확인(선택): 실제로 배지 클릭→키 누르기, 미지정 배지가 빨간색인지, `기본값으로 되돌리기` 버튼 동작, 시크릿창에서 기본값 유지(컴퓨터별 독립).

- [ ] **Step 5: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add 치료계획.html && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "feat(shortcut): 캡처·충돌·미지정·리셋 상호작용 완성 - 2026-07-04"
```

---

## Task 6: 문서 갱신 (CLAUDE.md)

`CLAUDE.md` 단축키 일람 표를 실제 기본값과 커스터마이즈 기능에 맞춰 갱신한다.

**Files:**
- Modify: `CLAUDE.md` — 단축키 일람 표(발치 `1`→`X`, 펜 `K/J/U` 추가), 표 하단에 커스터마이즈 안내 1줄.

**Interfaces:** (없음 — 문서만)

- [ ] **Step 1: 표 수정**

`CLAUDE.md` 단축키 일람에서:
- `| \`1\` | 발치 (표시도구 스티커) |` → `| \`X\` | 발치 (표시도구 스티커) |`
- 펜 관련 행 근처에 추가:
  - `| \`K\` | 직선 |`
  - `| \`J\` | 화살표 |`
  - `| \`U\` | 자유 네모 |`
- 표 아래에 한 줄 추가:
  `> 단축키는 헤더 \`⌨️ 단축키\` 버튼에서 컴퓨터(브라우저)별로 재배치 가능 (localStorage \`treatplan_shortcuts_v1\`). 위 값은 기본값. 시스템 키(Ctrl+Z/Y/C/V·Delete·ESC)는 고정.`

> 참고(범위 밖): `helpModal` 안 `<kbd>` 힌트는 정적 기본값 표기 그대로 둔다. 사용자가 키를 재배치해도 조작설명서의 예시 키는 갱신되지 않음(치료 버튼 배지만 갱신). 필요 시 별도 작업으로 분리.

- [ ] **Step 2: 커밋**

```bash
git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" add CLAUDE.md && git -C "Z:/코딩 프로젝트(클로드 작업)/치료계획 코딩/treament_plan" commit -m "docs: 단축키 일람 실제값 반영 + 커스터마이즈 안내 - 2026-07-04"
```

---

## 최종 검증 체크리스트 (전체)

1. ⌨️ 단축키 버튼 → 모달, 24개가 4그룹으로, 각 현재 키 배지.
2. 배지 클릭→키 누름→배정, 모달 닫고 그 키로 동작. 기존 키는 해제.
3. 새로고침 후 유지 (localStorage).
4. 시크릿창(다른 프로필)에선 기본값 (컴퓨터별 독립).
5. 충돌 시 확인창→바꿔치기, 뺏긴 기능 미지정(빨강).
6. 기본값으로 되돌리기→전부 복원, localStorage 비움.
7. 치료종류 버튼 배지도 즉시 갱신.
8. 시스템 키는 목록에 없고 이전과 동일 동작.
9. Node 문법·로직 게이트 그린, 기존 기능(틀니·마커·복사 등) 회귀 없음.
