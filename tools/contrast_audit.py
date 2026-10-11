#!/usr/bin/env python
"""설명덱_제작기.html 글자 대비 점검 — 실제 브라우저(playwright 크롬)로 양 테마(어둡게·밝게)를 열어
보이는 모든 글자 요소의 계산된 글자색(조상 opacity 누적·알파 합성)과 실제 뒤 배경(조상 바탕 합성, 그라데이션은 가장 나쁜 점)으로 대비를 잼.
기준: 4.5 미만이면 실패(큰 글 = 24px 이상 또는 18.66px 이상 굵게는 3.0). 사진 위 라벨(.ph-lbl·.pe-lbl·.pe-badge)과 사진 판은 제외.
점검 화면: 편집 화면(튜토리얼 덱의 모든 장) · 사진 장의 글 입력 창·표시 목록 · 도움말 · 장 종류 창 · 알림(일반·오류) · 허브 머리줄·허브 보기 전용 화면·허브 오류 화면
         · 발표 화면(튜토리얼 덱의 모든 장, 모든 단계가 켜진 상태) · 발표 도움말
상태 점검: 마우스 올림(hover)·포커스(focus)·끌기(dragging) 상태도 방문 — 각 도구 단추·주요 단추를 실제로 hover 한 뒤 그 단추의 글을 다시 잼.
쓰는 법:  python tools/contrast_audit.py            (표 출력, 실패 있으면 종료코드 1, playwright 없으면 2)
         python tools/contrast_audit.py --json     (실패 목록을 JSON 으로)
         python tools/contrast_audit.py --theme=dark|light   (한 테마만)
"""
import json, os, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / '설명덱_제작기.html'
EXCLUDE = '.ph-lbl, .pe-lbl, .pe-badge, .pe-stage, .pv-box, svg'   # 사진·사진 위 라벨만 제외(글 입력 창 .pe-pop·발표 설명 칸 등은 검사)

AUDIT_JS = r"""
(opts) => {
  const EXC = opts.exclude, doc = document, win = window, root = opts.rootSel ? doc.querySelector(opts.rootSel) : doc.body;
  if (!root) return {rows:[], checked:0, skippedImage:0};
  const num = s => parseFloat(s);
  const parse = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(num); return {r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1}; };
  const mix = (top, a, base) => ({r: top.r*a + base.r*(1-a), g: top.g*a + base.g*(1-a), b: top.b*a + base.b*(1-a), a:1});
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05) / (Math.min(x,y)+0.05); };
  // 괄호 짝이 맞는 gradient(...) 조각들(위에 겹친 것부터)
  const gradients = s => { const out = []; let i = 0; while (true) { const j = s.indexOf('gradient(', i); if (j < 0) break; let k = s.indexOf('(', j), d = 0, e = k; for (; e < s.length; e++) { if (s[e] === '(') d++; else if (s[e] === ')' && --d === 0) break; } out.push(s.slice(j, e+1)); i = e+1; } return out; };
  const stopsOf = g => (g.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean);
  const chainOf = el => { const a = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) a.unshift(n); return a; };
  // 글자 하나의 실제 대비(가장 나쁜 배경 변형 기준)
  const measure = (el, colorStr) => {
    const chain = chainOf(el), css = chain.map(n => win.getComputedStyle(n));
    const ops = []; let acc = 1; css.forEach(c => { acc *= (c.opacity === '' ? 1 : num(c.opacity)); ops.push(acc); });
    const P = ops[ops.length-1];
    // 처음 opacity<1 이 나온 칸부터가 한 덩어리(group): 그 위는 backdrop
    let k = css.findIndex(c => num(c.opacity) < 1); if (k < 0) k = chain.length;
    // 바탕 층: 아래(루트)부터 위로. 각 층은 [후보...] (후보 null = 투명 지점)
    const layers = []; let unknownImage = false;
    css.forEach((c, i) => {
      const bc = parse(c.backgroundColor); if (bc && bc.a > 0) layers.push({i, opts:[bc]});
      const bi = c.backgroundImage;
      if (bi && bi !== 'none') {
        if (/url\(/.test(bi)) unknownImage = true;
        const gs = gradients(bi);
        for (let q = gs.length-1; q >= 0; q--) { const st = stopsOf(gs[q]); const o = []; st.forEach(s => { if (s.a > 0) o.push(s); else o.push(null); }); const uniq = []; o.forEach(s => { const key = s ? [s.r,s.g,s.b,s.a].join() : 'n'; if (!uniq.some(u => u.key === key)) uniq.push({key, s}); }); layers.push({i, opts:uniq.map(u => u.s)}); }
      }
    });
    // 변형 조합(상한 128)
    let variants = [[]]; layers.forEach(L => { const nv = []; variants.forEach(v => L.opts.forEach(o => { if (nv.length < 128) nv.push(v.concat([{i:L.i, c:o}])); })); variants = nv; });
    const fgc = parse(colorStr); let worst = null;
    variants.forEach(v => {
      let backdrop = {r:255, g:255, b:255, a:1}, inner = null;   // 바탕 없으면 흰 종이
      v.forEach(l => { if (!l.c) return; if (l.i < k) backdrop = mix(l.c, l.c.a, backdrop); });
      inner = backdrop; v.forEach(l => { if (!l.c || l.i < k) return; inner = mix(l.c, l.c.a, inner); });
      let txt = mix(fgc, fgc.a, inner);
      const finalTxt = k < chain.length ? mix(txt, P, backdrop) : txt, finalBg = k < chain.length ? mix(inner, P, backdrop) : inner;
      const r = ratio(finalTxt, finalBg);
      if (!worst || r < worst.r) worst = {r, bg:finalBg, fg:finalTxt};
    });
    return {worst, unknownImage};
  };
  const visible = el => { try { if (el.checkVisibility && !el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false; } catch(_) {} const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + [...el.classList].slice(0,3).map(c => '.'+c).join('');
  const hex = c => '#' + [c.r,c.g,c.b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
  const rows = [], seen = new Set(); let checked = 0, skippedImage = 0;
  const push = (el, text, colorStr, label) => {
    if (!colorStr) return; const cs = win.getComputedStyle(el), px = num(cs.fontSize), bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const need = (px >= 24 || (px >= 18.66 && bold)) ? 3.0 : 4.5;
    const m = measure(el, colorStr); if (!m.worst) return; if (m.unknownImage) { skippedImage++; return; }
    checked++;
    if (m.worst.r < need) { const key = desc(el) + colorStr + hex(m.worst.bg); if (seen.has(key)) return; seen.add(key); rows.push({el:desc(el), text:(text || '').trim().slice(0,24), fg:hex(m.worst.fg), bg:hex(m.worst.bg), ratio:Math.round(m.worst.r*100)/100, need, px, label}); }
  };
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent; if (!t || !t.trim()) continue; const el = n.parentElement; if (!el) continue;
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|OPTION|TEXTAREA)$/.test(el.tagName)) continue;
    if (el.closest(EXC) || !visible(el)) continue;
    push(el, t, win.getComputedStyle(el).color, 'text');
  }
  [...(root.matches && root.matches('input,textarea,select') ? [root] : []), ...root.querySelectorAll('input,textarea,select')].forEach(el => {
    if (el.closest(EXC) || !visible(el)) return;
    const type = (el.getAttribute('type') || 'text').toLowerCase(); if (/^(checkbox|radio|color|range|file|hidden|button|submit)$/.test(type)) return;
    const cs = win.getComputedStyle(el);
    if (el.tagName === 'SELECT') { push(el, el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '', cs.color, 'select'); [...el.options].forEach(o => { const oc = win.getComputedStyle(o), ob = parse(oc.backgroundColor); if (!ob || ob.a === 0) return; const c = parse(oc.color); const r = ratio(mix(c, c.a, ob), ob); checked++; if (r < 4.5) rows.push({el:'option('+desc(el)+')', text:o.text.slice(0,20), fg:hex(c), bg:hex(ob), ratio:Math.round(r*100)/100, need:4.5, px:num(oc.fontSize), label:'option'}); }); return; }
    if (el.value) push(el, el.value, cs.color, 'value');
    else if (el.getAttribute('placeholder')) push(el, el.getAttribute('placeholder'), win.getComputedStyle(el, '::placeholder').color, 'placeholder');
  });
  return {rows, checked, skippedImage};
}
"""

def main():
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    as_json = '--json' in sys.argv
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:  # playwright 없음
        print('playwright 를 못 찾음:', e); return 2
    url = TARGET.as_uri()
    summary, fails = [], []
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(headless=True)
        except Exception:
            try: browser = pw.chromium.launch(headless=True, channel='chrome')
            except Exception as e: print('브라우저를 못 띄움:', e); return 2
        themes = [x.split('=')[1] for x in sys.argv if x.startswith('--theme=')] or ['dark', 'light']   # 한 테마만: --theme=dark (시험은 두 테마를 따로 동시에 돌림)
        for theme in themes:
            ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
            ctx.add_init_script("try{localStorage.setItem('seolmyeongdeok:theme','%s')}catch(_){}" % theme)
            page = ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(url); page.wait_for_timeout(600)
            assert page.evaluate("document.documentElement.dataset.theme") == theme, '테마 적용 실패'
            def run(label, frame, root=None):
                r = frame.evaluate(AUDIT_JS, {'exclude': EXCLUDE, 'rootSel': root})
                summary.append((theme, label, r['checked'], len(r['rows']), r['skippedImage']))
                for row in r['rows']: row.update({'theme': theme, 'scene': label}); fails.append(row)
            def states(label, frame, sels, limit=3, focus=True):
                # 각 선택자의 보이는 요소(앞에서 limit 개, limit=0 이면 전부)를 실제로 hover → 그 요소 글 검사, 이어서 focus → 검사
                for sel in sels:
                    els = [e for e in frame.query_selector_all(sel) if e.is_visible() and not e.is_disabled()]
                    for e in (els if not limit else els[:limit]):
                        for mode in (('hover', 'focus') if focus else ('hover',)):
                            try:
                                if mode == 'hover': e.hover(timeout=3000)
                                else: e.evaluate("x => x.focus()")
                            except Exception: continue
                            frame.wait_for_timeout(250) if hasattr(frame, 'wait_for_timeout') else page.wait_for_timeout(250)
                            e.evaluate("x => x.setAttribute('data-audit-root','1')")
                            try: run('%s %s %s' % (label, mode, sel), frame, '[data-audit-root]')
                            finally: e.evaluate("x => x.removeAttribute('data-audit-root')")
                page.mouse.move(2, 2); page.wait_for_timeout(120)
            n = page.evaluate("deck.slides.length"); types = page.evaluate("deck.slides.map(s=>s.type)")
            pv = lambda: page.query_selector('#previewFrame').content_frame()
            # 1) 편집 화면: 장마다
            for i in range(n):
                page.evaluate("i => pickSlide(i)", i); page.wait_for_timeout(350); run('편집 %d장(%s)' % (i+1, types[i]), page)
            # 1-b) 상태: 머리줄·목록·편집 칸 단추의 hover·focus (표지·관계도·표·사진 장), 끌기 중인 목록 칸
            BTN_A = ['.btn', '.mini-btn', '.pv-btn', '.add-slide', '.rep-add', '.rr-del', '.rr-move button', '.slide-item']
            BTN_B = ['.slide-go', '.deck-name', '.input', '.select', '.textarea', '.chk']
            for i in (0, 2, 6):
                page.evaluate("i => pickSlide(i)", i); page.wait_for_timeout(350); states('상태 %d장(%s)' % (i+1, types[i]), page, BTN_A, 2); states('상태 %d장(%s) 입력칸' % (i+1, types[i]), page, BTN_B, 1)
            page.evaluate("i => pickSlide(i)", types.index('photo')); page.wait_for_timeout(450)
            states('상태 사진 장 도구 단추', page, ['.pe-tool'], 0)   # 도구 단추는 전부(화살표·원·글·선택·지우기·꺾기·펴기·확대 단추)
            page.evaluate("() => { const it = document.querySelectorAll('.slide-item'); it[1].classList.add('dragging'); it[2].classList.add('dragging','active'); }"); page.wait_for_timeout(350)
            run('끌기 중(dragging) 목록 칸', page, '#slideList'); page.evaluate("() => document.querySelectorAll('.slide-item.dragging').forEach(x => x.classList.remove('dragging'))")
            # 2) 사진 장: 표시 선택·글 입력 창·표시 목록
            pi = types.index('photo'); page.evaluate("i => pickSlide(i)", pi); page.wait_for_timeout(500)
            page.evaluate("""() => { const m = PE.s.marks[0]; PE.sel = m.id; peRedraw(); peRenderRows();
              const c = {id:id(), kind:'circle', x:60, y:60, r:8, step:2}; PE.s.marks.push(c); peRenderRows(); peOpenPop(PE.s.marks[PE.s.marks.length-2]); }""")
            page.wait_for_timeout(300); run('사진 장: 선택·글 입력 창·원 줄', page)
            page.evaluate("""() => { const p = PE.pop; if(p){ p.el.value=''; p.el.dispatchEvent(new Event('input')); } }"""); page.wait_for_timeout(100); run('사진 장: 글 입력 창(빈 글, 안내 글)', page)
            page.evaluate("() => { PE.pop && peClosePop(); }")
            # 3) 도움말·장 종류 창·알림
            page.evaluate("() => B.help.classList.add('show')"); page.wait_for_timeout(450); run('편집 도움말', page); states('편집 도움말', page, ['.sheet .close']); page.evaluate("() => B.help.classList.remove('show')")
            page.evaluate("() => showPicker()"); page.wait_for_timeout(300); run('장 종류 창', page); states('장 종류 창', page, ['.picker button'], 0, False); page.evaluate("() => hidePicker()")
            page.evaluate("() => toast('저장했어요 — 알림 예시입니다')"); page.wait_for_timeout(500); run('알림(일반)', page)
            page.evaluate("() => toast('저장하지 못했어요 — 오류 예시입니다', 'err')"); page.wait_for_timeout(500); run('알림(오류)', page)
            # 4) 허브 머리줄(허브가 켜졌을 때만 보임)
            page.evaluate("""() => { B.hubBar.hidden = false; B.catSel.innerHTML = '<option value="">분류 없음</option><option value="진료실">진료실</option>'; B.hubState.textContent = '저장 안 됨'; B.hubState.classList.add('dirty'); }"""); page.wait_for_timeout(200); run('허브 머리줄(저장 안 됨)', page)
            page.evaluate("() => { B.hubState.textContent = '저장됨'; B.hubState.classList.remove('dirty'); }"); run('허브 머리줄(저장됨)', page)
            # 5) 발표 화면(미리보기 안): 장마다 모든 단계 켜짐
            fr = pv()
            for i in range(n):
                fr.evaluate("i => window.postMessage({cmd:'goto', si:i, atEnd:true}, '*')", i); page.wait_for_timeout(950); run('발표 %d장(%s)' % (i+1, types[i]), fr)
            fr.evaluate("() => toggleHelp(true)"); page.wait_for_timeout(450); run('발표 도움말', fr); states('발표 도움말', fr, ['.sheet .close']); fr.evaluate("() => toggleHelp(false)")
            fr.evaluate("() => window.postMessage({cmd:'goto', si:3, atEnd:false}, '*')"); page.wait_for_timeout(900)
            states('발표 단추', fr, ['.chip-btn', '.nav-btn', '#helpBtn', '#fsBtn'], 0)
            # 6) 허브 보기 전용 화면(같은 발표 엔진) · 허브 오류 화면
            page.evaluate("() => hubShowViewer()"); page.wait_for_timeout(900)
            vf = page.query_selector('.view-frame').content_frame(); run('허브 보기 전용: 첫 장', vf)
            vf.evaluate("() => window.postMessage({cmd:'goto', si:6, atEnd:true}, '*')"); page.wait_for_timeout(950); run('허브 보기 전용: 사진 장', vf)
            page2 = ctx.new_page(); page2.goto(url); page2.wait_for_timeout(500)
            page2.evaluate("() => hubFail('로그인이 필요해요. 직원허브에서 로그인한 뒤 열어 주세요.')"); page2.wait_for_timeout(200); run('허브 오류 화면', page2)
            if errs: print('페이지 오류:', errs[:3])
            ctx.close()
        browser.close()
    if as_json:
        print(json.dumps({'summary': summary, 'fails': fails}, ensure_ascii=False))
    else:
        print('%-6s %-34s %8s %6s' % ('테마', '화면', '검사한 글', '미달'))
        for th, lab, c, f, s in summary: print('%-6s %-34s %8d %6d%s' % (th, lab, c, f, ('  (그림 위 %d 건 제외)' % s) if s else ''))
        print('합계: 검사한 글 %d · 미달 %d' % (sum(x[2] for x in summary), len(fails)))
        for f in fails: print('  ✖ [%s/%s] %s "%s" 글 %s / 바탕 %s = %.2f (기준 %.1f, %spx)' % (f['theme'], f['scene'], f['el'], f['text'], f['fg'], f['bg'], f['ratio'], f['need'], f['px']))
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main())
