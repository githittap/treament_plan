# 임플란트 기록 생성기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `치료계획.html` 안에, 임플란트 식립을 한 줄 텍스트로 기록·복사하는 별도 모달 도구를 추가한다.

**Architecture:** 기존 치료계획(annotations/canvas) 코드와 완전히 분리된 자체 IIFE 모듈(`ImplantRecorder`)을 메인 `<script>` 끝에 추가한다. 전역은 모듈 객체 하나만 노출하고, 모든 상태·DOM 조작을 모듈 내부에 캡슐화해 기존 전역 변수/함수와 충돌하지 않게 한다. UI는 단계별 팝업(한 화면씩) 모달로 구성한다.

**Tech Stack:** Vanilla JS (ES6+), HTML5, 인라인 CSS. 빌드·프레임워크·테스트러너 없음.

## Global Constraints

- 단일 파일: 모든 CSS/JS는 `치료계획.html` 내부 `<style>`/`<script>`에 인라인. 파일 분리 금지.
- 기존 전역 변수/함수(`annotations`, `treatTypes`, `redraw`, `selectedAnnId`, `pushUndo` 등) 수정 금지. 새 코드는 `ImplantRecorder` 네임스페이스 안에만 작성.
- 기존 코드 스타일(2-space 들여쓰기, `c`/`ctx` 약어, camelCase) 유지.
- 테스트러너 없음 → 모든 검증은 **브라우저에서 수동 확인**. 파일을 직접 열어(`file://`) 확인.
- 저작권/문구 변경 금지.
- 출력 텍스트 형식(확정): `2026-06-24 (ST #24 23) > 2026-09-08 ISQ & SCAN. (30N이상)`
  - 식립날짜 ` (종류 #치식들) > ` ISQ날짜 ` ` 측정문구 `[ (초기고정값)]`
  - 측정문구 매핑: `ISQ + SCAN`→`ISQ & SCAN.` · `ISQ만 측정`→`ISQ.` · `경과관찰`→`경과관찰.`
  - 초기고정값: 선택 시 ` (10N)` `(30N이상)` 형태로 끝에 덧붙임. 미선택 시 생략.
- 종류 버튼: `EV` `ST` `DT` `BD` `EV mini` `ST mini` `BD nc` (한 개만 선택).
- 경과월 기본 노출: `2.5M` `3M` `4M` `6M`. `＋` 클릭 시 `5M` `7M` `8M` `9M` 추가 노출.
- 날짜 계산: 식립일 + 개월수. `.5`개월 = +15일. 월 더하기 시 월말 보정.

---

### Task 1: 헤더 진입 버튼 + 모달 셸 (열기/닫기)

**Files:**
- Modify: `치료계획.html` — 헤더 HTML(라인 395~399 `.clinic-title-wrap`/`.clinic-badge` 사이), 모달 HTML(라인 541 `<!-- 다중 배치 팝업 -->` 직전), CSS(`<style>` 끝, 라인 389 `</style>` 직전), JS(메인 `<script>`의 닫는 `</script>` 직전).

**Interfaces:**
- Produces: 전역 `window.ImplantRecorder` 객체. 메서드 `open()` / `close()`. 모달 루트 엘리먼트 id=`implantModal`, 단계 본문 컨테이너 id=`irBody`.

- [ ] **Step 1: 헤더에 진입 버튼 추가**

라인 398 `</div>`(title-wrap 닫음) 다음, 라인 399 `.clinic-badge` 앞에 버튼 삽입:

```html
    <button id="implantOpenBtn" onclick="ImplantRecorder.open()"
      style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:#fff;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px;cursor:pointer;letter-spacing:0.2px;margin-right:10px;">🦷 임플란트 기록</button>
```

- [ ] **Step 2: 모달 HTML 셸 추가**

라인 541 `<!-- 다중 배치 팝업 -->` 바로 앞에 추가:

```html
<!-- 임플란트 기록 생성기 모달 -->
<div id="implantModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:14px;max-width:560px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,0.35);">
    <div style="background:linear-gradient(135deg,#1d6e6b,#2a8a87);padding:16px 20px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:16px;font-weight:800;">🦷 임플란트 기록 생성기</div>
      <button onclick="ImplantRecorder.close()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:20px;cursor:pointer;border-radius:6px;padding:2px 10px;">✕</button>
    </div>
    <div id="irBody" style="padding:18px 20px;font-size:14px;color:#1c2733;"></div>
  </div>
</div>
```

- [ ] **Step 3: CSS 추가**

라인 389 `</style>` 직전에 추가:

```css
  .ir-btn{display:inline-block;margin:3px;padding:8px 13px;border:1.5px solid #2a8a87;background:#eef9f8;color:#1d6e6b;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
  .ir-btn:hover{background:#dbf1ef;}
  .ir-btn.sel{background:#2a8a87;color:#fff;}
  .ir-section{margin-bottom:14px;}
  .ir-section h4{margin:0 0 8px;font-size:13px;color:#2a8a87;}
  .ir-input{width:100%;padding:8px 10px;font-size:14px;border:1.5px solid #cdd8d6;border-radius:8px;box-sizing:border-box;}
  .ir-primary{background:#1d6e6b;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;}
  .ir-primary:hover{background:#155653;}
  .ir-row-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border:1px solid #e0eceb;border-radius:8px;margin-bottom:5px;font-size:13px;background:#fafdfd;}
  .ir-del{background:none;border:none;color:#c0392b;cursor:pointer;font-size:14px;}
```

- [ ] **Step 4: 모듈 스켈레톤 추가**

메인 `<script>`의 닫는 `</script>` 직전에 추가:

```javascript
// ===== 임플란트 기록 생성기 (독립 모듈) =====
const ImplantRecorder = (function(){
  const modal = document.getElementById('implantModal');
  const body  = document.getElementById('irBody');
  function open(){ modal.style.display='flex'; render(); }
  function close(){ modal.style.display='none'; }
  function render(){ body.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">준비 중</div>'; }
  return { open, close };
})();
window.ImplantRecorder = ImplantRecorder;
```

- [ ] **Step 5: 브라우저 수동 검증**

`치료계획.html`을 브라우저로 연다. 확인:
- 상단 초록 헤더의 제목과 "STAFF ONLY" 사이에 `🦷 임플란트 기록` 버튼이 보인다.
- 클릭 → 모달이 가운데 열리고 "준비 중"이 보인다.
- `✕` 클릭 → 모달이 닫힌다.

- [ ] **Step 6: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 헤더 버튼 + 모달 셸 - 2026-06-24"
```

---

### Task 2: 상태 모델 + 단계 라우팅 + 1단계(식립 날짜)

**Files:**
- Modify: `치료계획.html` — Task 1에서 추가한 `ImplantRecorder` IIFE 내부.

**Interfaces:**
- Consumes: Task 1의 `body`, `render()`.
- Produces: 모듈 내부 상태 `draft`(작성 중 1건) = `{date, type, teeth:[], months:null, memoMeasure:null, memoForce:null, memoEtc:''}`, 배열 `records[]`, `step`(1~5), 헬퍼 `todayStr()`, `goStep(n)`. `render()`가 `step`에 따라 분기.

- [ ] **Step 1: 상태/헬퍼 추가**

`const body = ...` 다음 줄에 추가:

```javascript
  let records = [];
  let draft = null;
  let step = 1;
  let showMoreMonths = false;
  function todayStr(){
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function newDraft(){ return {date:todayStr(), type:null, teeth:[], months:null, memoMeasure:null, memoForce:null, memoEtc:''}; }
  function goStep(n){ step = n; render(); }
```

- [ ] **Step 2: `open()`에서 초안 초기화**

`function open()` 본문을 교체:

```javascript
  function open(){ draft = newDraft(); step = 1; showMoreMonths = false; modal.style.display='flex'; render(); }
```

- [ ] **Step 3: `render()` 라우터로 교체**

```javascript
  function render(){
    if(step===1) return renderDate();
    if(step===2) return renderType();
    if(step===3) return renderTeeth();
    if(step===4) return renderMonths();
    if(step===5) return renderMemo();
  }
```

- [ ] **Step 4: 1단계 렌더(식립 날짜) 추가**

```javascript
  function renderDate(){
    body.innerHTML = `
      <div class="ir-section">
        <h4>1 / 5 · 식립 날짜</h4>
        <input id="irDate" class="ir-input" type="text" value="${draft.date}" placeholder="YYYY-MM-DD">
        <div style="font-size:11px;color:#888;margin-top:6px;">오늘 날짜가 자동 입력됩니다. 수정 후 Enter 또는 다음.</div>
      </div>
      <div style="text-align:right;"><button class="ir-primary" id="irNext">다음 ▶</button></div>`;
    const inp = document.getElementById('irDate');
    const next = ()=>{ draft.date = inp.value.trim(); goStep(2); };
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') next(); });
    document.getElementById('irNext').onclick = next;
    inp.focus();
  }
```

- [ ] **Step 5: 빈 단계 스텁 추가(라우터 깨짐 방지)**

`renderDate` 다음에 임시 스텁 추가(다음 태스크에서 교체):

```javascript
  function renderType(){ body.innerHTML='<div>type</div>'; }
  function renderTeeth(){ body.innerHTML='<div>teeth</div>'; }
  function renderMonths(){ body.innerHTML='<div>months</div>'; }
  function renderMemo(){ body.innerHTML='<div>memo</div>'; }
```

- [ ] **Step 6: 브라우저 수동 검증**

모달 열기 → "1 / 5 · 식립 날짜"와 오늘 날짜(`2026-06-24` 형식)가 채워진 입력칸이 보인다. Enter 또는 "다음 ▶" → "type" 텍스트로 넘어간다.

- [ ] **Step 7: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 상태 모델 + 1단계 날짜 입력 - 2026-06-24"
```

---

### Task 3: 2단계(종류) + 3단계(FDI 치식 선택)

**Files:**
- Modify: `치료계획.html` — `ImplantRecorder` 내부 `renderType`/`renderTeeth` 스텁 교체.

**Interfaces:**
- Consumes: `draft`, `goStep`, `step`.
- Produces: `draft.type`(문자열), `draft.teeth`(문자열 배열, FDI 번호). 상수 `IMPLANT_TYPES`, `FDI_ROWS`.

- [ ] **Step 1: 종류 상수 추가**

`let showMoreMonths` 선언 다음에 추가:

```javascript
  const IMPLANT_TYPES = ['EV','ST','DT','BD','EV mini','ST mini','BD nc'];
  const FDI_ROWS = [
    [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28],
    [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38]
  ];
```

- [ ] **Step 2: `renderType` 교체**

```javascript
  function renderType(){
    const btns = IMPLANT_TYPES.map(t=>
      `<button class="ir-btn${draft.type===t?' sel':''}" data-t="${t}">${t}</button>`).join('');
    body.innerHTML = `
      <div class="ir-section">
        <h4>2 / 5 · 임플란트 종류</h4>
        <div>${btns}</div>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <button class="ir-btn" id="irBack">◀ 이전</button>
        <button class="ir-primary" id="irNext">다음 ▶</button>
      </div>`;
    body.querySelectorAll('[data-t]').forEach(b=>{
      b.onclick = ()=>{ draft.type = b.dataset.t; render(); };
    });
    document.getElementById('irBack').onclick = ()=>goStep(1);
    document.getElementById('irNext').onclick = ()=>{ if(!draft.type){ alert('종류를 선택하세요.'); return; } goStep(3); };
  }
```

- [ ] **Step 3: `renderTeeth` 교체 (FDI 차트)**

```javascript
  function renderTeeth(){
    const sel = new Set(draft.teeth);
    let grid = '';
    FDI_ROWS.forEach(row=>{
      grid += '<div style="display:flex;gap:2px;margin-bottom:3px;justify-content:center;flex-wrap:nowrap;">';
      row.forEach((num,ci)=>{
        if(ci===8) grid += '<div style="width:8px;"></div>';
        const s = sel.has(String(num));
        grid += `<button class="ir-btn${s?' sel':''}" data-n="${num}" style="margin:0;padding:6px 0;width:28px;font-size:11px;">${num}</button>`;
      });
      grid += '</div>';
    });
    body.innerHTML = `
      <div class="ir-section">
        <h4>3 / 5 · 치식 선택 (FDI) — ${draft.type}</h4>
        ${grid}
        <div style="font-size:12px;color:#555;margin-top:8px;">선택: <b>${draft.teeth.join(' ') || '없음'}</b></div>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <button class="ir-btn" id="irBack">◀ 이전</button>
        <button class="ir-primary" id="irNext">다음 ▶</button>
      </div>`;
    body.querySelectorAll('[data-n]').forEach(b=>{
      b.onclick = ()=>{
        const n = b.dataset.n;
        const i = draft.teeth.indexOf(n);
        if(i>=0) draft.teeth.splice(i,1); else draft.teeth.push(n);
        render();
      };
    });
    document.getElementById('irBack').onclick = ()=>goStep(2);
    document.getElementById('irNext').onclick = ()=>{ if(draft.teeth.length===0){ alert('치식을 1개 이상 선택하세요.'); return; } goStep(4); };
  }
```

- [ ] **Step 4: 브라우저 수동 검증**

1단계에서 다음 → 종류 버튼 7개가 보인다. `ST` 클릭 → 파란 채움(sel). 다음 → FDI 32치 그리드. `24`,`23` 클릭 → 선택 표시되고 하단 "선택: 24 23". 다시 클릭 → 해제. 이전/다음 버튼 동작.

- [ ] **Step 5: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 2단계 종류 + 3단계 FDI 치식 - 2026-06-24"
```

---

### Task 4: 4단계(경과 개월수) + 날짜 계산

**Files:**
- Modify: `치료계획.html` — `ImplantRecorder` 내부 `renderMonths` 스텁 교체, 날짜 헬퍼 추가.

**Interfaces:**
- Consumes: `draft.date`, `draft.months`, `showMoreMonths`, `goStep`.
- Produces: `draft.months`(숫자, 예 2.5/3/4/6/5/7/8/9), 헬퍼 `addPeriod(dateStr, months)→'YYYY-MM-DD'`.

- [ ] **Step 1: 날짜 계산 헬퍼 추가**

`todayStr` 함수 다음에 추가:

```javascript
  function pad2(n){ return String(n).padStart(2,'0'); }
  function fmt(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  // 식립일 + months개월. .5개월은 +15일. 월말 보정(없는 날짜는 해당 월 마지막 날로).
  function addPeriod(dateStr, months){
    const parts = dateStr.split('-').map(Number);
    if(parts.length!==3 || parts.some(isNaN)) return '';
    const [y,m,day] = parts;
    const whole = Math.floor(months);
    const half = (months - whole) >= 0.5;
    const base = new Date(y, m-1, 1);            // 해당 월 1일 기준
    const target = new Date(y, m-1+whole, 1);    // 개월 더한 월 1일
    const lastDay = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
    target.setDate(Math.min(day, lastDay));      // 월말 보정
    if(half) target.setDate(target.getDate()+15);
    void base;
    return fmt(target);
  }
```

- [ ] **Step 2: `renderMonths` 교체**

```javascript
  function renderMonths(){
    const baseMonths = [2.5,3,4,6];
    const moreMonths = [5,7,8,9];
    const lbl = v => (v===2.5?'2.5M':v+'M');
    let btns = baseMonths.map(v=>`<button class="ir-btn${draft.months===v?' sel':''}" data-m="${v}">${lbl(v)}</button>`).join('');
    if(showMoreMonths){
      btns += moreMonths.map(v=>`<button class="ir-btn${draft.months===v?' sel':''}" data-m="${v}">${lbl(v)}</button>`).join('');
    } else {
      btns += `<button class="ir-btn" id="irMore">＋</button>`;
    }
    const isqDate = draft.months!=null ? addPeriod(draft.date, draft.months) : '';
    body.innerHTML = `
      <div class="ir-section">
        <h4>4 / 5 · 경과 개월수</h4>
        <div>${btns}</div>
        <div style="font-size:12px;color:#555;margin-top:8px;">ISQ&SCAN 예정일: <b>${isqDate||'—'}</b></div>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <button class="ir-btn" id="irBack">◀ 이전</button>
        <button class="ir-primary" id="irNext">다음 ▶</button>
      </div>`;
    body.querySelectorAll('[data-m]').forEach(b=>{
      b.onclick = ()=>{ draft.months = Number(b.dataset.m); render(); };
    });
    const moreBtn = document.getElementById('irMore');
    if(moreBtn) moreBtn.onclick = ()=>{ showMoreMonths = true; render(); };
    document.getElementById('irBack').onclick = ()=>goStep(3);
    document.getElementById('irNext').onclick = ()=>{ if(draft.months==null){ alert('개월수를 선택하세요.'); return; } goStep(5); };
  }
```

- [ ] **Step 3: 브라우저 수동 검증**

3단계에서 다음 → `2.5M 3M 4M 6M ＋` 노출. `3M` 클릭 → 식립일 `2026-06-24` 기준 "ISQ&SCAN 예정일: 2026-09-24" 표시. `＋` 클릭 → `5M 7M 8M 9M` 추가 노출. `2.5M` 클릭 → 예정일 `2026-09-08`(8월24일+15일) 표시. 이전/다음 동작.

- [ ] **Step 4: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 4단계 경과월 + 날짜계산 - 2026-06-24"
```

---

### Task 5: 5단계(메모) + 기록 추가

**Files:**
- Modify: `치료계획.html` — `ImplantRecorder` 내부 `renderMemo` 스텁 교체, `commitDraft()` 추가.

**Interfaces:**
- Consumes: `draft`, `records`, `goStep`.
- Produces: `draft.memoMeasure`('ISQ + SCAN'|'ISQ만 측정'|'경과관찰'|null), `draft.memoForce`('0N'|'5N'|'10N'|'20N'|'30N이상'|null), `draft.memoEtc`(문자열). `commitDraft()`가 `records.push(draft)` 후 모달을 기록 목록(Task 6)으로 전환.

- [ ] **Step 1: `renderMemo` 교체**

```javascript
  function renderMemo(){
    const measures = ['ISQ + SCAN','ISQ만 측정','경과관찰'];
    const forces = ['0N','5N','10N','20N','30N이상'];
    const mBtns = measures.map(v=>`<button class="ir-btn${draft.memoMeasure===v?' sel':''}" data-meas="${v}">${v}</button>`).join('');
    const fBtns = forces.map(v=>`<button class="ir-btn${draft.memoForce===v?' sel':''}" data-force="${v}">${v}</button>`).join('');
    body.innerHTML = `
      <div class="ir-section">
        <h4>5 / 5 · 메모 (선택)</h4>
        <div style="font-size:12px;color:#666;margin:2px 0 4px;">측정</div>
        <div>${mBtns}</div>
        <div style="font-size:12px;color:#666;margin:10px 0 4px;">초기고정</div>
        <div>${fBtns}</div>
        <div style="font-size:12px;color:#666;margin:10px 0 4px;">기타</div>
        <input id="irEtc" class="ir-input" type="text" value="${draft.memoEtc}" placeholder="자유 입력(선택)">
      </div>
      <div style="display:flex;justify-content:space-between;">
        <button class="ir-btn" id="irBack">◀ 이전</button>
        <button class="ir-primary" id="irAdd">기록 추가 ✔</button>
      </div>`;
    body.querySelectorAll('[data-meas]').forEach(b=>{
      b.onclick = ()=>{ draft.memoMeasure = (draft.memoMeasure===b.dataset.meas?null:b.dataset.meas); render(); };
    });
    body.querySelectorAll('[data-force]').forEach(b=>{
      b.onclick = ()=>{ draft.memoForce = (draft.memoForce===b.dataset.force?null:b.dataset.force); render(); };
    });
    document.getElementById('irBack').onclick = ()=>goStep(4);
    document.getElementById('irAdd').onclick = ()=>{
      draft.memoEtc = document.getElementById('irEtc').value.trim();
      commitDraft();
    };
  }
  function commitDraft(){
    records.push(draft);
    draft = newDraft();
    step = 1; showMoreMonths = false;
    renderList();
  }
```

- [ ] **Step 2: `renderList` 임시 스텁 추가(Task 6에서 교체)**

`commitDraft` 다음에 추가:

```javascript
  function renderList(){ body.innerHTML = `<div>저장된 기록: ${records.length}건</div>`; }
```

- [ ] **Step 3: 브라우저 수동 검증**

4단계에서 다음 → 측정 3버튼 / 초기고정 5버튼 / 기타 입력칸. `ISQ + SCAN`+`30N이상` 클릭 → 둘 다 sel. 같은 버튼 재클릭 → 해제. "기록 추가 ✔" → "저장된 기록: 1건" 표시.

- [ ] **Step 4: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 5단계 메모 + 기록 추가 - 2026-06-24"
```

---

### Task 6: 기록 목록 + 한 줄 텍스트 생성 + 복사

**Files:**
- Modify: `치료계획.html` — `ImplantRecorder` 내부 `renderList` 스텁 교체, `lineOf()`/`buildText()` 추가.

**Interfaces:**
- Consumes: `records`, `open()`(새 기록 추가용으로 단계 재시작), `clipboard`.
- Produces: `lineOf(rec)→문자열`(한 줄), `buildText()→전체 텍스트`(레코드별 한 줄, `\n` 결합). 복사 버튼이 `navigator.clipboard.writeText` 사용.

- [ ] **Step 1: 한 줄 생성 + 복사 헬퍼 추가**

`renderList` 스텁 위(또는 근처)에 추가:

```javascript
  const MEASURE_OUT = { 'ISQ + SCAN':'ISQ & SCAN.', 'ISQ만 측정':'ISQ.', '경과관찰':'경과관찰.' };
  function lineOf(r){
    const isq = r.months!=null ? addPeriod(r.date, r.months) : '';
    const teeth = r.teeth.join(' ');
    let line = `${r.date} (${r.type} #${teeth}) > ${isq}`;
    const meas = r.memoMeasure ? MEASURE_OUT[r.memoMeasure] : '';
    if(meas) line += ` ${meas}`;
    if(r.memoForce) line += ` (${r.memoForce})`;
    if(r.memoEtc) line += ` ${r.memoEtc}`;
    return line.trim();
  }
  function buildText(){ return records.map(lineOf).join('\n'); }
```

- [ ] **Step 2: `renderList` 교체**

```javascript
  function renderList(){
    const items = records.length
      ? records.map((r,i)=>`<div class="ir-row-item"><span style="flex:1;">${lineOf(r)}</span><button class="ir-del" data-i="${i}">🗑</button></div>`).join('')
      : '<div style="color:#999;text-align:center;padding:16px;">아직 기록이 없습니다.</div>';
    body.innerHTML = `
      <div class="ir-section">
        <h4>기록 목록 (${records.length}건)</h4>
        ${items}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="ir-btn" id="irAddNew" style="flex:1;">＋ 새 기록</button>
        <button class="ir-primary" id="irCopy" style="flex:1;">📋 복사</button>
      </div>`;
    body.querySelectorAll('[data-i]').forEach(b=>{
      b.onclick = ()=>{ records.splice(Number(b.dataset.i),1); renderList(); };
    });
    document.getElementById('irAddNew').onclick = ()=>{ draft = newDraft(); step = 1; showMoreMonths = false; render(); };
    document.getElementById('irCopy').onclick = ()=>{
      if(records.length===0){ alert('기록이 없습니다.'); return; }
      navigator.clipboard.writeText(buildText()).then(()=>{
        const btn = document.getElementById('irCopy');
        btn.textContent = '✓ 복사됨'; setTimeout(()=>{ btn.textContent='📋 복사'; }, 1200);
      });
    };
  }
```

- [ ] **Step 3: `open()` 동작 확인 정리**

`open()`는 항상 새 초안 1단계로 시작한다(기존 `records`는 모달이 닫혀도 모듈에 유지). 코드 변경 불필요 — Step에서 동작만 확인.

- [ ] **Step 4: 브라우저 수동 검증 (출력 형식)**

전체 흐름으로 1건 입력: 날짜 `2026-06-24` / 종류 `ST` / 치식 `24` `23` / `2.5M` / `ISQ + SCAN`+`30N이상` → 기록 추가. 목록에 정확히 다음 한 줄이 보여야 한다:

```
2026-06-24 (ST #24 23) > 2026-09-08 ISQ & SCAN. (30N이상)
```

"📋 복사" 클릭 → "✓ 복사됨"으로 잠깐 바뀐다. 메모장 등에 Ctrl+V → 같은 줄이 붙는다. "＋ 새 기록"으로 종류/날짜가 다른 2번째 기록 추가 → 목록에 2줄(서로 다른 줄)로 표시되고 복사 시 두 줄로 나온다. 🗑 클릭 → 해당 줄 삭제.

- [ ] **Step 5: 커밋**

```bash
git add 치료계획.html
git commit -m "임플란트 기록 생성기: 기록 목록 + 한 줄 텍스트 복사 - 2026-06-24"
```

---

### Task 7: CLAUDE.md 갱신

**Files:**
- Modify: `CLAUDE.md` — 주요 함수 맵/킵해둔 작업 섹션.

- [ ] **Step 1: 기능 추가 반영**

`## 킵해둔 작업` 섹션에 한 줄 추가:

```markdown
- [ ] 임플란트 기록 생성기 (헤더 🦷 버튼 → 모달, 별도 `ImplantRecorder` 모듈) ✅ (구현됨)
```

- [ ] **Step 2: 커밋**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: 임플란트 기록 생성기 반영 - 2026-06-24"
```

---

## Self-Review

**Spec coverage:**
- 진입점=초록 헤더 버튼 → Task 1 ✔
- 단계별 팝업(한 번에 하나) → Task 2~5 ✔
- 식립날짜 오늘 자동 + Enter → Task 2 ✔
- 종류 7종 한 개 선택 → Task 3 ✔
- FDI 차트 치식 선택 → Task 3 ✔
- 경과월 4개 기본 + ＋ 확장, 날짜 자동계산(.5=+15일, 월말보정) → Task 4 ✔
- 메모: ISQ+SCAN / ISQ만 측정 / 경과관찰 + 초기고정값(단어 없이) + 기타 → Task 5 ✔
- 한 줄 출력 형식 + 복사 + 다중 기록 행 분리 → Task 6 ✔
- 별도 데이터(implantRecords 격리), 캔버스 미연동 → 전 태스크 `records` 모듈 캡슐화 ✔

**Placeholder scan:** 모든 스텁(`renderType` 등)은 다음 태스크에서 실제 코드로 교체됨이 명시됨. "TBD/대충" 없음.

**Type consistency:** `draft` 필드(date/type/teeth/months/memoMeasure/memoForce/memoEtc)·`addPeriod`·`lineOf`·`renderList`·`goStep`·`newDraft` 이름이 전 태스크에서 일관됨. FDI_ROWS·IMPLANT_TYPES 상수 1회 정의.

**Note:** 설계서의 "merge to concise single line"은, 한 기록 안 여러 치식이 이미 한 줄(`#24 23`)로 묶이고, 서로 다른 종류/날짜/메모는 별도 행으로 출력하는 방식으로 충족(Task 6). 같은 종류·날짜·메모를 가진 별개 기록을 자동 합치는 추가 로직은 범위 외(필요 시 추후).
