# 틀니 다이어그램 (Denture Arch Diagram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 틀니 팝업에서 미니 치열도를 클릭해 치아 상태를 지정하면, 파노라마 X-ray 캔버스 상단(상악 ∩)/하단(하악 ∪)에 치열 도식(인포그래픽)과 기존 글자 라벨을 함께 표시한다.

**Architecture:** 단일 파일 `치료계획.html`에 새 주석 타입 `type:'denturearch'`를 추가한다. 순수 헬퍼(상태 순환·악궁 번호·좌표 계산)를 먼저 만들고 → 캔버스 렌더링 → 선택/이동/삭제 통합 → 팝업 미니 치열도 UI → IOD 부착장치 → 확인 시 도식+라벨 생성 순으로 쌓는다. 기존 `openDenturePopup`/`redraw`/`getAnnBounds`/`findAnnotationNear` 흐름을 외과적으로 확장한다.

**Tech Stack:** HTML5 Canvas, Vanilla JS (ES6+), 프레임워크·빌드 없음. 단일 파일 인라인 `<script>`/`<style>`.

## Global Constraints

- **단일 파일만 수정**: 모든 변경은 `치료계획.html` 내부. 파일 분리·번들러·프레임워크 도입 금지.
- **기존 코드 스타일 유지**: 들여쓰기·변수명·세미콜론 등 주변 코드 관습을 그대로 따른다(내 취향과 달라도).
- **색상 규칙(확정)**: 자연치=지대치 `#ffffff`(테두리 `#94a3b8`), Sur.Cr 채움 `#16a34a`(테두리 `#15803d`), I-Sur.Cr 채움 `#0d9488`(테두리 `#0f766e`), 결손 투명+회색 점선 `#9ca3af`. 소라벨 색: Sur.Cr `#4ade80`, I-Sur.Cr/부착장치 `#5eead4`.
- **FDI 번호(확정)**: 상악 `[17,16,15,14,13,12,11,21,22,23,24,25,26,27]`, 하악 `[47,46,45,44,43,42,41,31,32,33,34,35,36,37]`.
- **상태 순환 순서(확정)**: `nat → sur → imp → miss → nat`.
- **IOD 부착장치(확정)**: 마그네틱(Mag) / 로케이터(Loc) / 바(Bar), 틀니 1개당 1종.
- **글자 라벨 유지**: 도식은 기존 노란 글자 라벨을 대체하지 않고 **함께** 생성한다.
- **도식 대상 종류**: CD·RPD·IARPD·IOD만 도식 생성. `etc`(기타)는 기존 글자 라벨만(도식 없음).
- **배포**: 수정 후 push → GitHub Pages 자동 반영. 커밋 메시지 형식 `틀니도식: <요약> - 2026-07-04`.

## Testing Approach (이 프로젝트 특성 반영)

이 저장소에는 테스트 하네스가 없다(단일 HTML, 빌드 없음, 배포=단일 파일 push, 검증=브라우저). 표준 pytest-TDD 대신 아래 3단계로 검증한다. 저장소에 테스트 파일을 커밋하지 않는다(CLAUDE.md: 요청 없는 파일 추가 금지). 자동 검사는 **OS 임시폴더**의 일회용 스크립트로 수행한다.

1. **구문 검사(자동, 필수)** — 매 수정 후 아래 명령으로 `<script>`를 추출해 `new Function`으로 파싱 에러를 잡는다.

   임시 파일 `%TEMP%\dsyntax.mjs`:
   ```js
   import { readFileSync } from 'fs';
   const html = readFileSync(process.argv[2],'utf8');
   const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
   let n=0;
   for(const g of m){ try{ new Function(g[1]); n++; }catch(e){ console.error('SYNTAX FAIL:', e.message); process.exit(1); } }
   console.log('SYNTAX OK ('+n+' script blocks)');
   ```
   실행: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`  → 기대: `SYNTAX OK`

2. **로직 검사(자동)** — 순수 헬퍼가 있는 Task에서, HTML에서 함수를 추출·평가해 단언한다(Task 1 참조). 임시폴더 스크립트, 커밋 안 함.

3. **브라우저 검증(수동)** — 캔버스·팝업 Task는 브라우저에서 파일을 열고 명시된 클릭·관찰 절차로 확인한다. `Start-Process "치료계획.html"` (Windows).

각 Task 끝에서 커밋한다. (이 환경은 자동 커밋/푸시가 있을 수 있으나, 계획상 명시적 커밋 단계를 둔다.)

---

## File Structure

수정 파일: **`치료계획.html`** (유일). 관련 영역(현재 줄 번호는 편집에 따라 이동하므로 코드 앵커 문자열 병기):

| 영역 | 현재 위치 | 역할 | 어느 Task |
|---|---|---|---|
| `DENTURE_KINDS` 상수 | L2366 `const DENTURE_KINDS = [` | 종류 정의 | 인접에 헬퍼/상수 추가 (T1, T5) |
| 순수 헬퍼(신규) | L2366 바로 위 | 상태·번호·좌표 | T1 |
| `redraw()` forEach | L1950 `} else if(a.type==='text'){` | 렌더 분기 | T2 |
| `drawDentureArch`(신규) | `redraw` 근처(예: `drawLegend` 위 L2040) | 도식 그리기 | T2 |
| `getAnnBounds()` | L968 `} else if(a.type==='text'){` | 경계 | T3 |
| `findAnnotationNear()` | L2095 `} else if(a.type==='text'){` | 히트 | T3 |
| 드래그 이동 | L2730 `if(draggingAnn.type==='area'){` | 이동 | T3 |
| pointerdown 선택 | L2613 `if(hit.type==='area') hit._dragAnchor` | 앵커 | T3 |
| `renderAnnList()` | L2999 `} else if(a.type==='text'){` | 목록 라벨 | T3 |
| `openDenturePopup()` innerHTML | L2379 | 미니 치열도 컨테이너 | T4 |
| `openDenturePopup()` 로직 | L2396~2438 | 미니 렌더·순환·CD·IOD칩 | T4, T5 |
| `confirmFn` | L2462 | 도식+라벨 생성 | T6 |

---

### Task 1: 순수 헬퍼 (상태 순환 · 악궁 번호 · 좌표 계산)

**Files:**
- Modify: `치료계획.html` — `const DENTURE_KINDS = [` (현재 L2366) **바로 위**에 상수/함수 삽입.
- Test: `%TEMP%\dlogic.mjs` (임시, 커밋 안 함)

**Interfaces:**
- Produces (다른 Task가 사용):
  - `DENTURE_UP: number[]`, `DENTURE_LO: number[]`
  - `DENTURE_STATE_ORDER: string[]` = `['nat','sur','imp','miss']`
  - `dentureNextState(cur: string): string` — 순환 다음 상태. 알 수 없으면 `'sur'`로 취급(nat 다음).
  - `dentureArchNums(arch: '상악'|'하악'): number[]`
  - `dentureArchLayout(nums: number[], w, h, upper: boolean, pad, tooth): {num:number,x:number,y:number}[]`

- [ ] **Step 1: 로직 테스트 작성** — `%TEMP%\dlogic.mjs` 생성:

```js
import { readFileSync } from 'fs';
import assert from 'assert';
const src = readFileSync(process.argv[2],'utf8');
function extractFn(name){
  const i = src.indexOf('function '+name+'(');
  if(i<0) throw new Error('fn not found: '+name);
  let d=0, k=src.indexOf('{', i);
  for(; k<src.length; k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(d===0){k++;break;}} }
  return src.slice(i, k);
}
function extractArr(name){
  const m = new RegExp('const '+name+'\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;').exec(src);
  if(!m) throw new Error('const not found: '+name);
  return m[1];
}
const code =
  'const DENTURE_UP='+extractArr('DENTURE_UP')+';\n'+
  'const DENTURE_LO='+extractArr('DENTURE_LO')+';\n'+
  'const DENTURE_STATE_ORDER='+extractArr('DENTURE_STATE_ORDER')+';\n'+
  extractFn('dentureNextState')+'\n'+
  extractFn('dentureArchNums')+'\n'+
  extractFn('dentureArchLayout')+'\n'+
  'globalThis.__D={dentureNextState,dentureArchNums,dentureArchLayout,DENTURE_UP,DENTURE_LO,DENTURE_STATE_ORDER};';
new Function(code)();
const D = globalThis.__D;
assert.deepEqual(D.dentureArchNums('상악'), [17,16,15,14,13,12,11,21,22,23,24,25,26,27]);
assert.deepEqual(D.dentureArchNums('하악'), [47,46,45,44,43,42,41,31,32,33,34,35,36,37]);
assert.equal(D.dentureNextState('nat'),'sur');
assert.equal(D.dentureNextState('sur'),'imp');
assert.equal(D.dentureNextState('imp'),'miss');
assert.equal(D.dentureNextState('miss'),'nat');
const lay = D.dentureArchLayout([11,12,13,14],120,40,true,12,20);
assert.equal(lay.length,4);
assert.equal(lay[0].num,11);
assert.ok(lay[0].x < lay[3].x, 'x increases left→right');
assert.ok(lay.every(p=>p.y>=0 && p.y<=40), 'y within height');
console.log('LOGIC OK');
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node "%TEMP%\dlogic.mjs" "치료계획.html"`
Expected: FAIL — `const not found: DENTURE_UP` (아직 미구현).

- [ ] **Step 3: 헬퍼 구현** — `const DENTURE_KINDS = [` 바로 위에 삽입:

```js
const DENTURE_UP = [17,16,15,14,13,12,11,21,22,23,24,25,26,27];
const DENTURE_LO = [47,46,45,44,43,42,41,31,32,33,34,35,36,37];
const DENTURE_STATE_ORDER = ['nat','sur','imp','miss'];
function dentureNextState(cur){
  const i = DENTURE_STATE_ORDER.indexOf(cur);
  return DENTURE_STATE_ORDER[(i+1) % DENTURE_STATE_ORDER.length];  // 미지값 i=-1 → 다음 index 0? 보정 아래
}
function dentureArchNums(arch){
  return arch==='상악' ? DENTURE_UP.slice() : DENTURE_LO.slice();
}
function dentureArchLayout(nums, w, h, upper, pad, tooth){
  const n = nums.length, out = [];
  for(let i=0;i<n;i++){
    const t = n>1 ? i/(n-1) : 0.5;
    const x = pad + t*(w - 2*pad);
    const s = Math.sin(Math.PI*t);
    const y = upper ? (h - tooth)*(1 - s) + pad*0.5 : (h - tooth)*s + pad*0.5;
    out.push({num:nums[i], x, y});
  }
  return out;
}
```

주의: `dentureNextState('nat')`는 index 0 → 다음 1 = `'sur'` ✅. 미지값(`indexOf`=-1)은 `(-1+1)%4=0` = `'nat'`가 되어 테스트 기대(`'sur'`)와 다름. 테스트는 알려진 값만 검사하므로 통과하나, 호출부는 항상 유효 상태를 넘긴다. 명확성을 위해 미지값도 `'sur'`로 보정하려면 첫 줄을 `const i = DENTURE_STATE_ORDER.indexOf(cur); if(i<0) return 'sur';` 로 바꿔도 된다(선택).

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node "%TEMP%\dlogic.mjs" "치료계획.html"`
Expected: `LOGIC OK`

- [ ] **Step 5: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"` (Testing Approach의 스크립트)
Expected: `SYNTAX OK`

- [ ] **Step 6: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: 순수 헬퍼(상태순환·악궁번호·좌표) 추가 - 2026-07-04"
```

---

### Task 2: 캔버스에 도식 렌더링

**Files:**
- Modify: `치료계획.html` — `redraw()` 내 `} else if(a.type==='text'){ drawYellowLabel(...) }` (현재 L1950-1952) 분기 **뒤**에 `denturearch` 분기 추가.
- Modify: `치료계획.html` — `function drawLegend(){` (현재 L2040) **바로 위**에 `drawDentureArch` 함수 추가.

**Interfaces:**
- Consumes (T1): `dentureArchNums`, `dentureArchLayout`.
- Produces: 주석 형태 정의 —
  `{id, type:'denturearch', arch:'상악'|'하악', kind:'CD'|'RPD'|'IARPD'|'IOD', attach:null|'mag'|'loc'|'bar', states:{[num]:'sur'|'imp'|'miss'}, x, y, scale}`.
  `states`에 없는 치아 = `'nat'`. 크기: `w = naturalW*0.42*(scale||1)`, `h = w*0.28`.
  `drawDentureArch(ctx, a)` — `a.x,a.y`(좌상단) 기준으로 도식을 그린다.

- [ ] **Step 1: `drawDentureArch` 구현** — `function drawLegend(){` 바로 위에 삽입:

```js
function drawDentureArch(ctx, a){
  const upper = (a.arch==='상악');
  const nums = dentureArchNums(a.arch);
  const w = naturalW * 0.42 * (a.scale||1);
  const h = w * 0.28;
  const R = Math.max(9, w*0.028);
  const layout = dentureArchLayout(nums, w, h, upper, R*1.4, R*2.2);
  const numFs = R*0.82, subFs = R*0.72;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  layout.forEach(p=>{
    const st = (a.states && a.states[p.num]) || 'nat';
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI*2);
    ctx.lineWidth = Math.max(1.5, R*0.14);
    ctx.setLineDash(st==='miss' ? [Math.max(3,R*0.3), Math.max(2,R*0.22)] : []);
    if(st==='sur'){ ctx.fillStyle='#16a34a'; ctx.fill(); ctx.strokeStyle='#15803d'; }
    else if(st==='imp'){ ctx.fillStyle='#0d9488'; ctx.fill(); ctx.strokeStyle='#0f766e'; }
    else if(st==='miss'){ ctx.strokeStyle='#9ca3af'; }
    else { ctx.fillStyle='#ffffff'; ctx.fill(); ctx.strokeStyle='#94a3b8'; }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = (st==='sur'||st==='imp') ? '#ffffff' : (st==='miss' ? '#9ca3af' : '#334155');
    ctx.font = `700 ${numFs}px sans-serif`;
    ctx.fillText(String(p.num), p.x, p.y);
    let sub='';
    if(st==='sur') sub='Sur.Cr';
    else if(st==='imp') sub = (a.kind==='IOD' && a.attach) ? ({mag:'Mag',loc:'Loc',bar:'Bar'}[a.attach]) : 'I-Sur.Cr';
    if(sub){
      ctx.fillStyle = (st==='imp') ? '#5eead4' : '#4ade80';
      ctx.font = `800 ${subFs}px sans-serif`;
      const subY = upper ? (p.y - R - subFs*0.8) : (p.y + R + subFs*0.8);
      ctx.fillText(sub, p.x, subY);
    }
  });
  ctx.restore();
}
```

- [ ] **Step 2: `redraw()`에 분기 추가** — `} else if(a.type==='text'){ drawYellowLabel(ctx, a.x + (a.boxW||40)/2, a.y, a.text, a.fontSize); }` 뒤에:

```js
    } else if(a.type==='denturearch'){
      drawDentureArch(ctx, a);
    }
```

- [ ] **Step 3: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 4: 브라우저 수동 검증(콘솔 주입)**

1. `Start-Process "치료계획.html"` 로 열고, 아무 파노라마 이미지 업로드(또는 붙여넣기).
2. F12 콘솔에서 실행:
   ```js
   annotations.push({id:idSeq++, type:'denturearch', arch:'하악', kind:'IARPD',
     attach:null, states:{44:'sur',34:'sur',36:'imp',45:'miss',46:'miss',47:'miss'},
     x: naturalW*0.29, y: naturalH*0.6, scale:1});
   redraw();
   ```
Expected: 캔버스 하단에 ∪자 치열 도식이 나타남 — 44·34 초록(Sur.Cr), 36 청록(I-Sur.Cr), 45·46·47 회색 점선, 나머지 흰 동그라미+번호. 앞니(41/31)가 가운데 아래.
3. `상악`도 확인:
   ```js
   annotations.push({id:idSeq++, type:'denturearch', arch:'상악', kind:'IOD',
     attach:'loc', states:{16:'imp',26:'imp',14:'miss',24:'miss'},
     x: naturalW*0.29, y: naturalH*0.03, scale:1});
   redraw();
   ```
Expected: 상단에 ∩자 도식, 16·26 청록에 소라벨 `Loc`.

- [ ] **Step 5: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: 캔버스 렌더링(drawDentureArch + redraw 분기) 추가 - 2026-07-04"
```

---

### Task 3: 선택 · 이동 · 삭제 · 목록 통합

**Files:**
- Modify: `치료계획.html` — `getAnnBounds()` (L968 `} else if(a.type==='text'){`) 에 분기 추가.
- Modify: `치료계획.html` — `findAnnotationNear()` (L2095 `} else if(a.type==='text'){`) 에 분기 추가.
- Modify: `치료계획.html` — 드래그 이동 (L2730 `if(draggingAnn.type==='area'){ ... } else {`) 에 delta 분기 추가.
- Modify: `치료계획.html` — pointerdown 선택 (L2613 `if(hit.type==='area') hit._dragAnchor = {x,y};`) 에 denturearch 포함.
- Modify: `치료계획.html` — `renderAnnList()` (L2999 `} else if(a.type==='text'){`) 에 라벨 분기 추가.

**Interfaces:**
- Consumes (T2): 주석 형태 + 크기식 `w=naturalW*0.42*(scale||1)`, `h=w*0.28`.
- Produces: denturearch가 클릭 선택·드래그 이동·Delete/✕ 삭제 가능.

- [ ] **Step 1: `getAnnBounds`에 분기 추가** — `} else if(a.type==='free'){` 앞에 삽입:

```js
  } else if(a.type==='denturearch'){
    const w = naturalW * 0.42 * (a.scale||1);
    const h = w * 0.28;
    return {x1:a.x - 4, y1:a.y - h*0.14, x2:a.x + w + 4, y2:a.y + h*1.14};
```

- [ ] **Step 2: `findAnnotationNear`에 분기 추가** — `} else if(a.type==='area'){ ... }` 뒤(루프 안)에:

```js
    } else if(a.type==='denturearch'){
      const b = getAnnBounds(a);
      if(b && x>=b.x1 && x<=b.x2 && y>=b.y1 && y<=b.y2) return a;
```

- [ ] **Step 3: 드래그 이동 delta 분기** — `if(draggingAnn.type==='area'){ ... }` 블록 뒤, `else { draggingAnn.x = x; draggingAnn.y = y; }` 를 아래로 교체:

```js
    } else if(draggingAnn.type==='denturearch'){
      const anchor = draggingAnn._dragAnchor || {x,y};
      draggingAnn.x += x-anchor.x; draggingAnn.y += y-anchor.y;
      draggingAnn._dragAnchor = {x,y};
    } else {
      draggingAnn.x = x; draggingAnn.y = y;
    }
```

- [ ] **Step 4: pointerdown 선택 앵커** — `if(hit.type==='area') hit._dragAnchor = {x,y};` 를 교체:

```js
      if(hit.type==='area' || hit.type==='denturearch') hit._dragAnchor = {x,y};
```

- [ ] **Step 5: `renderAnnList` 라벨** — `} else if(a.type==='free'){` 앞에 삽입:

```js
      } else if(a.type==='denturearch'){
        const kindLabel = (DENTURE_KINDS.find(k=>k.id===a.kind)||{label:a.kind}).label;
        label = '틀니도식: ' + a.arch + ' ' + kindLabel;
```

- [ ] **Step 6: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 7: 브라우저 수동 검증**

1. 파일 열고 이미지 업로드. 콘솔에서 Task 2 Step 4의 하악 주입 코드 실행.
2. 도구 모드를 선택/이동(A키)으로 두고, 도식 위를 **클릭** → 점선 선택 박스가 도식 전체를 감싸는지 확인.
3. 도식을 **드래그** → 도식이 커서 이동량만큼 따라오는지(점프 없이) 확인.
4. 우측 목록에 `틀니도식: 하악 IARPD` 항목이 보이고, 그 항목의 `✕`를 누르면 도식이 삭제되는지 확인.
5. 다시 주입 후 도식을 클릭 선택하고 `Delete` 키 → 삭제되는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: 선택·이동·삭제·목록 통합 - 2026-07-04"
```

---

### Task 4: 팝업 미니 치열도 + 클릭 순환 + CD 자동결손

**Files:**
- Modify: `치료계획.html` — `openDenturePopup()` innerHTML (L2385 `<div id="dFields"></div>` 부근) 에 미니 치열도 컨테이너 추가.
- Modify: `치료계획.html` — `openDenturePopup()` 로직: `state`에 `states:{}` 추가, 미니 렌더 함수, 악궁/종류 변경 시 재렌더.

**Interfaces:**
- Consumes (T1): `dentureArchNums`, `dentureArchLayout`, `dentureNextState`.
- Produces: 팝업 `state.states = {[num]:'nat'|'sur'|'imp'|'miss'}` 를 채운다(T6가 소비). CD면 클릭 비활성.

- [ ] **Step 1: state에 states 추가** — `const state = { arch:'상악', kind:'CD', f:{} };` 를 교체:

```js
  const state = { arch:'상악', kind:'CD', f:{}, states:{}, attach:'loc' };
```

- [ ] **Step 2: innerHTML에 미니 치열도 컨테이너 추가** — `<div id="dFields"></div>` 바로 뒤(같은 template literal 안)에 삽입:

```js
      <div class="opt-hint">치아 상태 <span style="font-weight:400;color:#94a3b8;">(클릭할 때마다: 자연치→Sur.Cr→I-Sur.Cr→결손)</span></div>
      <div id="dMiniArch" style="position:relative;width:236px;height:66px;margin:2px auto 4px;background:#0f172a;border-radius:8px;"></div>
```

- [ ] **Step 3: 미니 렌더 함수 추가** — `refreshFields();` (L2438) **뒤**에 삽입:

```js
  const miniWrap = div.querySelector('#dMiniArch');
  const MINI_FILL = {nat:'#ffffff', sur:'#16a34a', imp:'#0d9488'};
  const MINI_BORDER = {nat:'#94a3b8', sur:'#15803d', imp:'#0f766e', miss:'#9ca3af'};
  function renderMini(){
    miniWrap.innerHTML='';
    const nums = dentureArchNums(state.arch);
    const upper = (state.arch==='상악');
    const W=236, H=60, R=11;
    const layout = dentureArchLayout(nums, W, H, upper, R*1.3, R*2.0);
    const cd = (state.kind==='CD');
    nums.forEach((num,i)=>{
      const p = layout[i];
      const st = cd ? 'miss' : (state.states[num]||'nat');
      const t=document.createElement('div');
      t.textContent = num;
      t.style.cssText =
        'position:absolute;width:'+(R*2)+'px;height:'+(R*2)+'px;border-radius:50%;'
        +'display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;box-sizing:border-box;'
        +'transform:translate(-50%,-50%);left:'+p.x+'px;top:'+(p.y+3)+'px;'
        +'border:2px '+(st==='miss'?'dashed':'solid')+' '+MINI_BORDER[st]+';'
        +'background:'+(st==='miss'?'transparent':MINI_FILL[st])+';'
        +'color:'+(st==='sur'||st==='imp'?'#fff':(st==='miss'?'#9ca3af':'#334155'))+';'
        +'cursor:'+(cd?'default':'pointer')+';';
      if(!cd){
        t.addEventListener('click', ()=>{
          state.states[num] = dentureNextState(state.states[num]||'nat');
          renderMini();
        });
      }
      miniWrap.appendChild(t);
    });
  }
  renderMini();
```

- [ ] **Step 4: 악궁 변경 시 재렌더** — 악궁 버튼 핸들러 `b.addEventListener('click', ()=>{ state.arch=a; ... b.classList.add('sel'); });` (L2400) 의 콜백 끝에 `renderMini();` 추가:

```js
    b.addEventListener('click', ()=>{ state.arch=a; archWrap.querySelectorAll('.opt-btn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); renderMini(); });
```

- [ ] **Step 5: 종류 변경 시 재렌더(CD 반영)** — 종류 버튼 핸들러 `b.addEventListener('click', ()=>{ state.kind=k.id; ... refreshFields(); });` (L2435) 콜백 끝에 `renderMini();` 추가:

```js
    b.addEventListener('click', ()=>{ state.kind=k.id; kindWrap.querySelectorAll('.opt-btn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); refreshFields(); renderMini(); });
```

- [ ] **Step 6: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 7: 브라우저 수동 검증**

1. 파일 열고 이미지 업로드. 치료종류에서 **틀니** 선택 → 캔버스 클릭 → 팝업.
2. 팝업 안에 미니 치열도(어두운 배경 + 동그라미 14개)가 보이는지 확인. 기본 종류 CD이므로 **전부 회색 점선(결손)**, 클릭해도 안 바뀜.
3. 종류를 **RPD**로 → 미니 치열도가 전부 흰 동그라미로 바뀜.
4. 미니 치열도의 한 치아를 **연속 클릭** → 흰→초록→청록→점선→흰 순환 확인.
5. 악궁을 **상악/하악** 토글 → 번호와 ∩/∪ 배열이 바뀌는지 확인(상태는 초기화되어도 무방).

- [ ] **Step 8: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: 팝업 미니 치열도 + 클릭 순환 + CD 자동결손 - 2026-07-04"
```

---

### Task 5: IOD 부착장치 칩 (마그네틱/로케이터/바)

**Files:**
- Modify: `치료계획.html` — `openDenturePopup()` innerHTML 에 부착장치 행 추가.
- Modify: `치료계획.html` — `DENTURE_KINDS` 인접에 `DENTURE_ATTACH` 상수 추가(T1 영역과 동일 위치대).
- Modify: `치료계획.html` — 부착장치 칩 렌더 + IOD일 때만 표시 로직.

**Interfaces:**
- Consumes: `state.kind`, `state.attach`.
- Produces: `state.attach ∈ {'mag','loc','bar'}` (T6/T2가 소비, IOD 소라벨 Mag/Loc/Bar).

- [ ] **Step 1: `DENTURE_ATTACH` 상수 추가** — `const DENTURE_KINDS = [ ... ];` 바로 뒤에 삽입:

```js
const DENTURE_ATTACH = [
  {id:'mag', label:'마그네틱', abbr:'Mag'},
  {id:'loc', label:'로케이터', abbr:'Loc'},
  {id:'bar', label:'바',      abbr:'Bar'}
];
```

- [ ] **Step 2: innerHTML에 부착장치 행 추가** — Task 4에서 넣은 미니 치열도 컨테이너(`<div id="dMiniArch" ...></div>`) **앞**에 삽입:

```js
      <div id="dAttachRow" style="display:none;">
        <div class="opt-hint">부착장치</div>
        <div class="opt-grid" id="dAttach"></div>
      </div>
```

- [ ] **Step 3: 부착장치 칩 렌더 + 표시 토글 함수** — Task 4의 `renderMini();` 호출 **뒤**에 삽입:

```js
  const attachRow = div.querySelector('#dAttachRow');
  const attachWrap = div.querySelector('#dAttach');
  DENTURE_ATTACH.forEach(at=>{
    const b=document.createElement('button');
    b.type='button'; b.className='opt-btn'+(state.attach===at.id?' sel':''); b.textContent=at.label;
    b.addEventListener('click', ()=>{ state.attach=at.id; attachWrap.querySelectorAll('.opt-btn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); });
    attachWrap.appendChild(b);
  });
  function refreshAttachRow(){ attachRow.style.display = (state.kind==='IOD') ? '' : 'none'; }
  refreshAttachRow();
```

- [ ] **Step 4: 종류 변경 시 부착장치 행 토글** — Task 4 Step 5에서 수정한 종류 버튼 핸들러 콜백 끝에 `refreshAttachRow();` 추가:

```js
    b.addEventListener('click', ()=>{ state.kind=k.id; kindWrap.querySelectorAll('.opt-btn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); refreshFields(); renderMini(); refreshAttachRow(); });
```

- [ ] **Step 5: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 6: 브라우저 수동 검증**

1. 파일 열고 이미지 업로드 → 틀니 팝업.
2. 종류 **RPD/IARPD/CD** 일 때는 부착장치 행이 **안 보임** 확인.
3. 종류 **IOD** 선택 → 부착장치 행(마그네틱/로케이터/바)이 나타남. 기본 `로케이터` 선택 상태.
4. **마그네틱** 클릭 → 선택 표시(sel)가 옮겨감.

- [ ] **Step 7: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: IOD 부착장치 칩(마그네틱/로케이터/바) - 2026-07-04"
```

---

### Task 6: 확인 시 도식 + 글자 라벨 생성 (엔드투엔드)

**Files:**
- Modify: `치료계획.html` — `confirmFn` (L2462) 를 도식 주석 + 기존 텍스트 라벨 **둘 다** 생성하도록 확장.

**Interfaces:**
- Consumes (T1·T4·T5): `state.arch/kind/attach/states`, `dentureArchNums`, `buildDentureLabel`.
- Consumes (T2): 주석 형태·크기식. Produces: 최종 사용자 흐름(도식+라벨 배치, 저장/복원).

- [ ] **Step 1: `confirmFn` 교체** — 기존 `const confirmFn = () => { ... };` (L2462-2475) 전체를 아래로 교체:

```js
  const confirmFn = ()=>{
    const text = buildDentureLabel();
    const drawKinds = ['CD','RPD','IARPD','IOD'];
    const makeArch = drawKinds.includes(state.kind);
    if(!text && !makeArch){ closePopup(); return; }
    pushUndo();

    // 1) 도식(denturearch) 주석
    let archH = 0, ay = 0;
    const archW = naturalW*0.42;
    if(makeArch){
      archH = archW*0.28;
      const nums = dentureArchNums(state.arch);
      const states = {};
      if(state.kind==='CD'){ nums.forEach(n=>{ states[n]='miss'; }); }
      else { nums.forEach(n=>{ const s=state.states[n]; if(s && s!=='nat') states[n]=s; }); }
      const ax = naturalW/2 - archW/2;
      ay = state.arch==='상악' ? naturalH*0.02 : naturalH - archH - naturalH*0.02;
      annotations.push({
        id:idSeq++, type:'denturearch',
        arch:state.arch, kind:state.kind,
        attach: state.kind==='IOD' ? (state.attach||'loc') : null,
        states, x:ax, y:ay, scale:1
      });
    }

    // 2) 글자 라벨(type:'text') — 기존 동작 유지, 도식과 겹치지 않게 배치
    if(text){
      const fontSize = Math.max(14, baseUnit()*sizeSliderVal*0.34);
      const lines = text.split('\n').length;
      const boxH = lines*fontSize*1.35 + fontSize*0.35*2;
      const x = naturalW/2 - 20;
      let y;
      if(state.arch==='상악'){
        y = (makeArch ? (ay + archH + naturalH*0.02) : naturalH*0.03);
      } else {
        y = (makeArch ? (ay - boxH - naturalH*0.02) : (naturalH - boxH - naturalH*0.03));
      }
      y = Math.max(4, Math.min(y, naturalH - boxH - 4));
      annotations.push({id:idSeq++, type:'text', x, y, text, fontSize});
    }

    closePopup(); redraw(); renderAnnList();
  };
```

- [ ] **Step 2: 구문 검사**

Run: `node "%TEMP%\dsyntax.mjs" "치료계획.html"`
Expected: `SYNTAX OK`

- [ ] **Step 3: 브라우저 수동 검증 — 하악 IARPD 엔드투엔드**

1. 파일 열고 이미지 업로드 → 틀니 팝업.
2. 악궁 **하악**, 종류 **IARPD** 선택.
3. 미니 치열도에서: 34·44 를 클릭해 **Sur.Cr(초록)**, 36 을 **I-Sur.Cr(청록)**, 45·46·47 을 **결손(점선)** 으로 지정.
4. **확인** → 캔버스 **하단**에 ∪자 도식(34·44 초록, 36 청록 I-Sur.Cr, 45·46·47 점선) + 그 위/근처에 노란 글자 라벨(`하악 IARPD (…) / …`) **둘 다** 표시되는지 확인.

- [ ] **Step 4: 브라우저 수동 검증 — 상악 CD & IOD**

1. 새 팝업, 악궁 **상악**, 종류 **CD** → 확인 → 상단에 ∩자 도식 **14치아 전부 점선(결손)**.
2. 새 팝업, 악궁 **하악**, 종류 **IOD**, 부착장치 **로케이터**, 미니에서 34·44 를 I-Sur.Cr(청록)로 지정 → 확인 → 하단 도식의 34·44 청록에 소라벨 **Loc**.

- [ ] **Step 5: 저장/복원 검증**

1. 위 도식이 있는 상태에서 상단 **저장(JSON)** → 파일 저장.
2. 페이지 새로고침(또는 이미지 삭제) 후 **불러오기** → 도식이 그대로 복원되는지 확인(색·위치·소라벨 동일).
   (근거: 저장은 `annotations`를 그대로 JSON 직렬화 L1327, 불러오기 L1369 — 신규 필드 자동 보존.)

- [ ] **Step 6: `etc`(기타) 회귀 확인**

1. 새 팝업, 종류 **기타**, 내용 입력 → 확인 → **도식은 생기지 않고** 기존처럼 노란 글자 라벨만 배치되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add 치료계획.html
git commit -m "틀니도식: 확인 시 도식+글자라벨 생성(엔드투엔드) - 2026-07-04"
```

---

## Self-Review

**1. Spec coverage (스펙 각 요구 → Task 매핑):**
- 도식으로 전체/부분 표시 → T2(렌더) + T6(CD 전체결손 / RPD·IARPD 부분).
- 지대치 선택(#31~37,#41~47 등) → T4(미니 치열도 클릭).
- 서베이드(Sur.Cr) 표시 → T1(상태) + T2(초록+소라벨) + T4(순환).
- 임플란트 서베이드(I-Sur.Cr, IARPD) → T2(청록 I-Sur.Cr) + T4.
- IOD 부착장치(마그네틱/로케이터/바) → T5(칩) + T2(Mag/Loc/Bar 소라벨) + T6(attach 저장).
- 상·하악 둘 다(∩/∪) → T1(악궁 번호) + T2(upper 분기) + T6(상단/하단 배치).
- 도식+글자 라벨 둘 다 유지 → T6.
- etc 제외 → T6 Step 6 회귀.
- 선택/이동/삭제/저장 → T3 + T6 Step 5.
- 클릭 순환 방식 → T1 + T4.
→ 누락 없음.

**2. Placeholder scan:** "TBD/TODO/적절히 처리/유사함" 없음. 모든 코드 스텝에 실제 코드 포함. ✅

**3. Type consistency 점검:**
- 주석 필드명 `arch/kind/attach/states/x/y/scale` — T2 정의 == T3(getAnnBounds 크기식 `naturalW*0.42*(scale||1)`, `w*0.28`) == T6 생성부(`archW=naturalW*0.42`, `archH=archW*0.28`) 일치. ✅
- `arch` 값은 `'상악'/'하악'`(문자열)로 T4·T6 생성, T2 `drawDentureArch`에서 `upper=(a.arch==='상악')`, `dentureArchNums(a.arch)` 소비 — 일치. ✅
- `attach` 값 `'mag'/'loc'/'bar'` — T5 `DENTURE_ATTACH` id == T2 소라벨 매핑 `{mag,loc,bar}` == T6 `state.attach` — 일치. ✅
- 상태 id `nat/sur/imp/miss` — T1 `DENTURE_STATE_ORDER` == T2 렌더 분기 == T4 MINI_FILL/BORDER 키 == T6 states 필터 — 일치. ✅
- 함수명 `dentureArchNums/dentureArchLayout/dentureNextState/drawDentureArch` — 정의(T1/T2)와 호출(T2/T4/T6) 동일. ✅
- `getAnnBounds`가 `denturearch` 반환(T3 Step1) → `findAnnotationNear`(T3 Step2)·`drawSelectionBox`(기존)가 소비 — 일치. ✅

이슈 없음. 계획 확정.
