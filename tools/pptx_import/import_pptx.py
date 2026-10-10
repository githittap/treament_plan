#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PPTX -> 직원허브 업무매뉴얼 덱(JSON + 장별 바탕 그림) 가져오기.

장마다: 제목 글 상자 -> title, 나머지 글 상자 -> label mark, 연결선/화살표 -> arrow mark.
그 도형들을 뺀 사본을 LibreOffice(soffice)로 렌더해 장별 webp(긴 변 1600px)로 저장.
PPT는 읽기만 함(원본 수정 없음). 실행: python -P import_pptx.py --src X.pptx --out DIR [옵션]
"""
import argparse, json, math, os, queue, re, shutil, subprocess, sys, threading, time, glob
from concurrent.futures import ThreadPoolExecutor, as_completed

from lxml import etree
from pptx import Presentation
from PIL import Image, ImageDraw, ImageFont

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
SOFFICE = os.environ.get('SOFFICE', r'C:\Program Files\LibreOffice\program\soffice.exe')
PDFTOPPM = os.environ.get('PDFTOPPM', '') or shutil.which('pdftoppm') or \
    r'C:\Users\elusi\.claude\tools\poppler\poppler-26.02.0\Library\bin\pdftoppm.exe'
FONT = r'C:\Windows\Fonts\malgun.ttf'


# ---------- 2D 아핀 (a,b,c,d,e,f): x'=a x+c y+e, y'=b x+d y+f ----------
def mmul(m, n):  # m∘n (n 먼저)
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D,
            a * E + c * F + e, b * E + d * F + f)


def mapply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


ID = (1, 0, 0, 1, 0, 0)


def rotflip(cx, cy, rot_deg, fh, fv):
    """중심(cx,cy) 기준 뒤집기 -> 시계방향 회전."""
    t = math.radians(rot_deg)
    ct, st = math.cos(t), math.sin(t)
    sx, sy = (-1 if fh else 1), (-1 if fv else 1)
    # p -> (p-c) -> flip -> rot -> +c
    a, b, c, d = ct * sx, st * sx, -st * sy, ct * sy
    return (a, b, c, d, cx - (a * cx + c * cy), cy - (b * cx + d * cy))


def xfrm_info(x):
    off, ext = x.find('a:off', NS), x.find('a:ext', NS)
    ox, oy = int(off.get('x')), int(off.get('y'))
    w, h = int(ext.get('cx')), int(ext.get('cy'))
    rot = int(x.get('rot', 0)) / 60000.0
    return ox, oy, w, h, rot, x.get('flipH') in ('1', 'true'), x.get('flipV') in ('1', 'true')


def shape_matrix(x):
    """도형 로컬 상자(0..w,0..h) -> 부모 좌표."""
    ox, oy, w, h, rot, fh, fv = xfrm_info(x)
    return mmul(rotflip(ox + w / 2, oy + h / 2, rot, fh, fv), (1, 0, 0, 1, ox, oy))


def group_matrix(x):
    """그룹 자식 좌표 -> 부모 좌표."""
    ox, oy, w, h, rot, fh, fv = xfrm_info(x)
    co, ce = x.find('a:chOff', NS), x.find('a:chExt', NS)
    cox, coy = int(co.get('x')), int(co.get('y'))
    cw, ch = int(ce.get('cx')) or 1, int(ce.get('cy')) or 1
    S = (w / cw, 0, 0, h / ch, ox - cox * w / cw, oy - coy * h / ch)
    return mmul(rotflip(ox + w / 2, oy + h / 2, rot, fh, fv), S)


def conn_local_pts(prst, w, h, adj):
    g = lambda k, d=50000: adj.get(k, d) / 100000.0
    if prst == 'bentConnector2':
        return [(0, 0), (w, 0), (w, h)]
    if prst == 'bentConnector3':
        x1 = w * g('adj1')
        return [(0, 0), (x1, 0), (x1, h), (w, h)]
    if prst == 'bentConnector4':
        x1, y2 = w * g('adj1'), h * g('adj2')
        return [(0, 0), (x1, 0), (x1, y2), (w, y2), (w, h)]
    if prst == 'bentConnector5':
        x1, y2, x3 = w * g('adj1'), h * g('adj2'), w * g('adj3')
        return [(0, 0), (x1, 0), (x1, y2), (x3, y2), (x3, h), (w, h)]
    return [(0, 0), (w, h)]  # line / straightConnector1 / 곡선 등은 직선으로 근사


def xp(el, q):
    return etree.ElementBase.xpath(el, q, namespaces=NS)


def has_pic(el):
    return bool(xp(el, './/p:pic'))


def color_of(el):
    c = xp(el, './/a:ln/a:solidFill/a:srgbClr/@val | .//a:rPr/a:solidFill/a:srgbClr/@val')
    return ('#' + c[0].lower()) if c else None


def para_text(sp):
    ps = xp(sp, './p:txBody/a:p')
    lines = []
    for p in ps:
        s = ''
        for n in p:
            t = etree.QName(n).localname
            if t == 'r':
                s += ''.join(xp(n, './a:t/text()'))
            elif t == 'br':
                s += '\n'
            elif t == 'fld':
                s += ''.join(xp(n, './a:t/text()'))
        lines.append(s)
    return '\n'.join(lines).strip()


# ---------- 장 처리: 정보 추출 + 도형 제거 ----------
def process_slide(slide, W, H, group_text='keep'):
    """slide XML에서 글 상자·연결선을 뽑고(정보) 그 도형을 제거. 반환 dict."""
    tree = slide._element
    spTree = tree.find('p:cSld/p:spTree', NS)
    found = []  # (순서, kind, el, 정보)
    order = [0]

    def walk(parent, M, in_pic_group):
        for el in list(parent):
            tag = etree.QName(el).localname
            if tag == 'grpSp':
                gx = el.find('p:grpSpPr/a:xfrm', NS)
                GM = mmul(M, group_matrix(gx)) if gx is not None else M
                walk(el, GM, in_pic_group or has_pic(el))
            elif tag == 'cxnSp':
                x = el.find('p:spPr/a:xfrm', NS)
                if x is None:
                    continue
                geom = el.find('p:spPr/a:prstGeom', NS)
                prst = geom.get('prst') if geom is not None else 'line'
                adj = {gd.get('name'): int(gd.get('fmla').split()[1])
                       for gd in xp(el, './/a:avLst/a:gd')}
                ox, oy, w, h, rot, fh, fv = xfrm_info(x)
                SM = mmul(M, shape_matrix(x))
                pts = [mapply(SM, px, py) for px, py in conn_local_pts(prst, w, h, adj)]
                he = xp(el, './p:spPr/a:ln/a:headEnd/@type')
                te = xp(el, './p:spPr/a:ln/a:tailEnd/@type')
                head = bool(he and he[0] != 'none')
                tail = bool(te and te[0] != 'none')
                if head and not tail:
                    pts.reverse()
                dd = []
                for p in pts:
                    if not dd or abs(p[0] - dd[-1][0]) + abs(p[1] - dd[-1][1]) > 1:
                        dd.append(p)
                order[0] += 1
                found.append((order[0], 'arrow', el, {'pts': dd, 'prst': prst, 'color': color_of(el),
                                                       'noarrowhead': not (head or tail)}))
            elif tag == 'sp':
                tb = xp(el, './p:nvSpPr/p:cNvSpPr/@txBox')
                if not (tb and tb[0] in ('1', 'true')):
                    continue  # 사각형 등 도형은 그림 쪽에 남김
                x = el.find('p:spPr/a:xfrm', NS)
                if x is None:
                    continue
                txt = para_text(el)
                ox, oy, w, h, rot, fh, fv = xfrm_info(x)
                SM = mmul(M, shape_matrix(x))
                cs = [mapply(SM, px, py) for px, py in ((0, 0), (w, 0), (w, h), (0, h))]
                bx0, bx1 = min(c[0] for c in cs), max(c[0] for c in cs)
                by0, by1 = min(c[1] for c in cs), max(c[1] for c in cs)
                sz = xp(el, './/a:rPr/@sz')
                order[0] += 1
                found.append((order[0], 'text', el, {
                    'text': txt, 'box': (bx0, by0, bx1 - bx0, by1 - by0), 'in_group': M != ID,
                    'keep_baked': (group_text == 'keep' and in_pic_group),
                    'size': int(sz[0]) / 100.0 if sz else None, 'color': color_of(el)}))

    walk(spTree, ID, False)

    # 제목: 맨 위(상단 12% 안)·가장 왼쪽의 최상위 글 상자
    cand = [f for f in found if f[1] == 'text' and not f[3]['in_group'] and f[3]['text']
            and f[3]['box'][1] < H * 0.12]
    title_el = min(cand, key=lambda f: (f[3]['box'][1], f[3]['box'][0]))[2] if cand else None

    marks, title, n = [], '', 0
    r2 = lambda v, tot: round(v / tot * 100, 2)
    for order_i, kind, el, inf in found:
        if kind == 'arrow':
            n += 1
            m = {'kind': 'arrow', 'pts': [[r2(px, W), r2(py, H)] for px, py in inf['pts']],
                 'text': '', 'step': n}
            if inf['color']:
                m['color'] = inf['color']
            marks.append(m)
            el.getparent().remove(el)
        else:
            if inf['keep_baked']:
                for bp in xp(el, './p:txBody/a:bodyPr'):
                    if bp.get('wrap') == 'square':
                        bp.set('wrap', 'none')  # LO가 칸 글자(T[OP] 등)를 줄바꿈하지 않게
                continue  # 평면도/격자 그룹 안 칸 글자(A~L, T[OP] 등)는 바탕 그림에 그대로
            if el is title_el:
                title = inf['text'].replace('\n', ' ')
            elif inf['text']:
                n += 1
                x, y, w, h = inf['box']
                m = {'kind': 'label', 'x': r2(x, W), 'y': r2(y, H), 'text': inf['text'], 'step': n,
                     'w': r2(w, W), 'h': r2(h, H)}
                if inf['size']:
                    m['size'] = inf['size']
                if inf['color']:
                    m['color'] = inf['color']
                marks.append(m)
            el.getparent().remove(el)
    if 'show' in tree.attrib:
        del tree.attrib['show']  # 숨김 장도 PDF에 포함되게
    notes = ''
    if slide.has_notes_slide:
        notes = slide.notes_slide.notes_text_frame.text.strip()
    return {'title': title, 'notes': notes, 'marks': marks}


# ---------- 렌더 ----------
def cxn_to_custgeom(slide_el):
    """(비교용) 연결선을 같은 xfrm의 일반 도형+직선경로로 바꿈. LO가 연결선을 제멋대로 다시 그리는 걸 막고,
    우리가 계산한 로컬 경로를 LO가 회전·뒤집기·그룹 변환해서 그리게 해 좌표 계산을 독립 검증함."""
    from pptx.oxml import parse_xml
    for c in xp(slide_el, './/p:cxnSp'):
        x = c.find('p:spPr/a:xfrm', NS)
        geom = c.find('p:spPr/a:prstGeom', NS)
        ox, oy, w, h, rot, fh, fv = xfrm_info(x)
        adj = {gd.get('name'): int(gd.get('fmla').split()[1]) for gd in xp(c, './/a:avLst/a:gd')}
        pts = conn_local_pts(geom.get('prst'), w, h, adj)
        path = ''.join(('<a:moveTo>' if i == 0 else '<a:lnTo>') + f'<a:pt x="{int(px)}" y="{int(py)}"/>' +
                       ('</a:moveTo>' if i == 0 else '</a:lnTo>') for i, (px, py) in enumerate(pts))
        sp = parse_xml(
            '<p:sp xmlns:p="%s" xmlns:a="%s"><p:nvSpPr><p:cNvPr id="%d" name="cx"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            '<p:spPr><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>'
            '<a:pathLst><a:path w="%d" h="%d" fill="none">%s</a:path></a:pathLst></a:custGeom></p:spPr></p:sp>'
            % (NS['p'], NS['a'], int(c.find('p:nvCxnSpPr/p:cNvPr', NS).get('id')) + 5000, max(w, 1), max(h, 1), path))
        spPr = sp.find('p:spPr', NS)
        spPr.insert(0, x)           # 원래 xfrm (rot/flip 포함)
        spPr.append(c.find('p:spPr/a:ln', NS))
        c.getparent().replace(c, sp)


def keep_slides(prs, keep_idx):
    """keep_idx(0기반) 장만 남김. 나머지는 연결을 끊어 저장 때 빠짐."""
    lst = prs.slides._sldIdLst
    for i, sld in reversed(list(enumerate(list(lst)))):
        if i not in keep_idx:
            prs.part.drop_rel(sld.rId)
            lst.remove(sld)


def run(cmd, timeout):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        out, _ = p.communicate(timeout=timeout)
        return p.returncode, out.decode('utf-8', 'replace')
    except subprocess.TimeoutExpired:
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], capture_output=True)  # 띄운 PID만
        p.communicate()
        return -9, 'timeout'


def render_pptx(pptx, workdir, profile, long_px, timeout):
    """pptx -> 페이지별 PNG 경로 목록."""
    pdfdir = os.path.join(workdir, 'pdf')
    os.makedirs(pdfdir, exist_ok=True)
    uri = 'file:///' + profile.replace('\\', '/')
    rc, out = run([SOFFICE, '--headless', '--norestore', '--nologo', f'-env:UserInstallation={uri}',
                   '--convert-to', 'pdf', '--outdir', pdfdir, pptx], timeout)
    pdf = os.path.join(pdfdir, os.path.splitext(os.path.basename(pptx))[0] + '.pdf')
    if rc != 0 or not os.path.exists(pdf):
        raise RuntimeError(f'soffice 실패 rc={rc} {out[-300:]}')
    prefix = os.path.join(pdfdir, os.path.splitext(os.path.basename(pptx))[0])
    rc, out = run([PDFTOPPM, '-png', '-scale-to-x', str(long_px), '-scale-to-y', '-1', pdf, prefix], 600)
    pngs = sorted(glob.glob(prefix + '-*.png'))
    if rc != 0 or not pngs:
        raise RuntimeError(f'pdftoppm 실패 rc={rc} {out[-300:]}')
    return pngs


class PPRender:
    """PowerPoint COM 렌더러. COM 호출은 전부 전용 스레드 하나에서만 함. 우리가 띄운 PowerPoint만 종료함."""

    def __init__(self):
        self.ex = ThreadPoolExecutor(1, initializer=self._init)
        self.app = None
        self.owned = False
        self.pid = None

    @staticmethod
    def pids():
        out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq POWERPNT.EXE', '/FO', 'CSV', '/NH'],
                             capture_output=True, text=True).stdout
        return {int(l.split('","')[1]) for l in out.splitlines() if 'POWERPNT' in l}

    def _init(self):
        import pythoncom
        pythoncom.CoInitialize()

    def _open_app(self):
        import win32com.client
        before = self.pids()
        self.app = win32com.client.Dispatch('PowerPoint.Application')
        new = self.pids() - before
        self.owned = not before  # 이미 떠 있던(원장 화면) PowerPoint면 종료하지 않음
        self.pid = next(iter(new)) if new else None

    def _render(self, pptx, outdir, w):
        if self.app is None:
            self._open_app()
        os.makedirs(outdir, exist_ok=True)
        pres = self.app.Presentations.Open(pptx, True, False, False)  # ReadOnly, 제목있음, 창 없음
        try:
            h = round(w * pres.PageSetup.SlideHeight / pres.PageSetup.SlideWidth)
            base = os.path.splitext(os.path.basename(pptx))[0]
            outs = []
            for i in range(1, pres.Slides.Count + 1):
                p = os.path.join(outdir, f'{base}-{i:04d}.png')
                pres.Slides(i).Export(p, 'PNG', w, h)
                outs.append(p)
            return outs
        finally:
            pres.Close()

    def render(self, pptx, outdir, w):
        return self.ex.submit(self._render, pptx, outdir, w).result()

    def quit(self):
        def _q():
            if self.app is not None and self.owned:
                try:
                    self.app.Quit()
                except Exception:
                    pass
            self.app = None
        self.ex.submit(_q).result()
        self.ex.shutdown()
        if self.owned and self.pid in self.pids():  # 안 꺼졌으면 우리가 띄운 PID만 강제 종료
            time.sleep(2)
            if self.pid in self.pids():
                subprocess.run(['taskkill', '/F', '/PID', str(self.pid)], capture_output=True)


PP = None


def render(a, pptx, workdir, profile):
    if a.renderer == 'pp':
        return PP.render(pptx, os.path.join(workdir, 'pp_png'), a.long)
    return render_pptx(pptx, workdir, profile, a.long, a.timeout)


def save_webp(png, dst, quality, max_kb):
    im = Image.open(png).convert('RGB')
    if max(im.size) > 1600:
        s = 1600 / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    q = quality
    while True:
        im.save(dst, 'WEBP', quality=q, method=4)
        if os.path.getsize(dst) <= max_kb * 1024 or q <= 45:
            return q
        q -= 8


def draw_overlay(png, dst, marks):
    """원본 렌더(png) 위에 뽑은 화살표/라벨 위치를 겹쳐 그림(연두=뽑은 좌표)."""
    im = Image.open(png).convert('RGB')
    W, H = im.size
    d = ImageDraw.Draw(im, 'RGBA')
    f = ImageFont.truetype(FONT, 20)
    for m in marks:
        if m['kind'] == 'arrow':
            pts = [(x * W / 100, y * H / 100) for x, y in m['pts']]
            d.line(pts, fill=(0, 220, 0, 255), width=3)
            for p in pts:
                d.ellipse([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5], outline=(0, 120, 255, 255), width=2)
            d.text((pts[-1][0] + 8, pts[-1][1] + 4), f"#{m['step']}", fill=(0, 120, 255, 255), font=f)
        else:
            x, y = m['x'] * W / 100, m['y'] * H / 100
            d.rectangle([x, y, x + m.get('w', 5) * W / 100, y + m.get('h', 5) * H / 100],
                        outline=(255, 0, 255, 255), width=2)
            d.text((x + 2, y + 2), f"#{m['step']}", fill=(255, 0, 255, 255), font=f)
    im.save(dst, 'JPEG', quality=88)


def arrow_score(orig_png, marks):
    """원본 렌더에서 뽑은 화살표 경로를 따라 4px마다 3px 반경 안에 화살표 색(기본 빨강) 픽셀이 있는 비율(0~1, 화살표 여러 개면 평균)."""
    im = Image.open(orig_png).convert('RGB')
    W, H = im.size
    px = im.load()
    out = []
    for m in marks:
        if m['kind'] != 'arrow':
            continue
        rgb = tuple(int(m.get('color', '#ff0000')[i:i + 2], 16) for i in (1, 3, 5))
        pts = [(x * W / 100, y * H / 100) for x, y in m['pts']]
        hit = tot = 0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 4))
            for k in range(n + 1):
                x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
                tot += 1
                ok = False
                for dx in range(-3, 4):
                    for dy in range(-3, 4):
                        xx, yy = int(x) + dx, int(y) + dy
                        if 0 <= xx < W and 0 <= yy < H and sum(abs(a - b) for a, b in zip(px[xx, yy], rgb)) < 120:
                            ok = True
                            break
                    if ok:
                        break
                hit += ok
        out.append(hit / tot if tot else 0)
    return round(sum(out) / len(out), 3) if out else None


def side_by_side(left_jpg, right_png, dst, w=1300):
    """왼쪽 원본+좌표 겹침 / 오른쪽 도형 뺀 렌더를 나란히."""
    L, R = Image.open(left_jpg).convert('RGB'), Image.open(right_png).convert('RGB')
    L, R = [im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) for im in (L, R)]
    c = Image.new('RGB', (w * 2 + 10, L.height), (120, 120, 120))
    c.paste(L, (0, 0))
    c.paste(R, (w + 10, 0))
    c.save(dst, 'JPEG', quality=88)


# ---------- 청크 작업 ----------
def do_chunk(ci, idxs, a, profiles):
    """idxs: 0기반 장 번호 목록. 반환 {장번호: slide dict} / 실패 {장번호: 오류}."""
    work = os.path.join(a.work, f'chunk_{ci:04d}')
    os.makedirs(work, exist_ok=True)
    prof = profiles.get()
    res, fail = {}, {}
    try:
        # 1) 정보 추출 + 도형 제거 사본
        prs = Presentation(a.src)
        W, H = prs.slide_width, prs.slide_height
        keep_slides(prs, set(idxs))
        if a.overlay or a.score:  # 도형 안 뺀 원본 렌더 (비교·점검용)
            sub = os.path.join(work, 'subset.pptx')
            prs.save(sub)
            orig = sub  # pp: 원본 그대로(PowerPoint가 저장된 연결선 모양대로 그림)
            if a.renderer == 'lo':  # lo: 연결선을 일반 도형으로 바꿔 렌더 (LO가 연결선을 다시 짜는 걸 막음)
                p2 = Presentation(sub)
                for sl in p2.slides:
                    cxn_to_custgeom(sl._element)
                orig = os.path.join(work, 'orig.pptx')
                p2.save(orig)
        infos = [process_slide(s, W, H, a.group_text) for s in prs.slides]
        stripped = os.path.join(work, f'strip_{ci:04d}.pptx')
        prs.save(stripped)
        pngs = render(a, stripped, work, prof)
        if len(pngs) != len(idxs):
            raise RuntimeError(f'페이지 수 불일치 {len(pngs)} != {len(idxs)}')
        orig_pngs = None
        if a.overlay or a.score:
            orig_pngs = render(a, orig, os.path.join(work, 'o'), prof)
        for k, i in enumerate(idxs):
            n = i + 1
            fn = f'slide{n:03d}.webp'
            q = save_webp(pngs[k], os.path.join(a.out, 'images', fn), a.quality, a.max_kb)
            info = infos[k]
            res[n] = {'type': 'photo', 'title': info['title'], 'kicker': '', 'image': {'file': fn},
                      'notes': info['notes'], 'marks': info['marks'], 'srcSlide': n}
            if orig_pngs:
                res[n]['_score'] = arrow_score(orig_pngs[k], info['marks'])
            if orig_pngs and a.overlay:
                os.makedirs(os.path.join(a.out, 'compare'), exist_ok=True)
                draw_overlay(orig_pngs[k], os.path.join(a.out, 'compare', f'slide{n:03d}_원본+좌표.jpg'),
                             info['marks'])
                shutil.copyfile(pngs[k], os.path.join(a.out, 'compare', f'slide{n:03d}_도형뺀렌더.png'))
                side_by_side(os.path.join(a.out, 'compare', f'slide{n:03d}_원본+좌표.jpg'), pngs[k],
                             os.path.join(a.out, 'compare', f'slide{n:03d}_PP비교.jpg'))
    except Exception as e:  # 청크 통째로 실패 -> 호출부에서 장별 재시도
        for i in idxs:
            fail[i + 1] = f'{type(e).__name__}: {e}'
        res = {}
    finally:
        profiles.put(prof)
    return res, fail


def parse_set(s):
    out = set()
    for part in s.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            x, y = part.split('-')
            out.update(range(int(x), int(y) + 1))
        else:
            out.add(int(part))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--src', required=True, help='원본 PPTX(읽기만, 사본 권장)')
    ap.add_argument('--out', required=True, help='출력 폴더 (images/ deck.json report.json 생성)')
    ap.add_argument('--only', help='예: 84,85 또는 84-90')
    ap.add_argument('--append-from', type=int, help='N장부터만')
    ap.add_argument('--title', default='원내 물품 정리')
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--chunk', type=int, default=12, help='soffice 한 번에 렌더할 장 수')
    ap.add_argument('--long', type=int, default=1600, help='그림 긴 변 px')
    ap.add_argument('--quality', type=int, default=90)
    ap.add_argument('--max-kb', type=int, default=300, help='장당 용량 상한(넘으면 품질을 낮춤)')
    ap.add_argument('--timeout', type=int, default=900, help='soffice 청크당 제한 초')
    ap.add_argument('--work', help='임시 폴더 (기본 <out>/_work)')
    ap.add_argument('--renderer', choices=['pp', 'lo'], default='pp',
                    help='pp: PowerPoint COM(기본, 원장 화면과 같음) / lo: LibreOffice')
    ap.add_argument('--overlay', action='store_true', help='원본 렌더+뽑은 좌표 겹침 그림(compare/) 추가')
    ap.add_argument('--score', action='store_true', help='그림 없이 원본 렌더와 화살표 경로 일치율만 계산(score.json)')
    ap.add_argument('--group-text', choices=['keep', 'extract'], default='keep',
                    help='keep: 그림이 든 그룹 안 글(A~L 칸 글자)은 바탕에 둠 / extract: 전부 떼어 label로')
    a = ap.parse_args()
    a.work = a.work or os.path.join(a.out, '_work')
    os.makedirs(os.path.join(a.out, 'images'), exist_ok=True)
    os.makedirs(a.work, exist_ok=True)

    prs = Presentation(a.src)
    total = len(prs.slides)
    del prs
    nums = set(range(1, total + 1))
    if a.only:
        nums &= parse_set(a.only)
    if a.append_from:
        nums = {n for n in nums if n >= a.append_from}
    nums = sorted(nums)
    chunks = [nums[i:i + a.chunk] for i in range(0, len(nums), a.chunk)]
    profiles = queue.Queue()
    for k in range(a.workers):
        profiles.put(os.path.join(a.work, f'profile_{k}'))

    prog = os.path.join(a.out, 'progress.log')
    t0 = time.time()
    results, failed = {}, {}
    lock = threading.Lock()

    def log(msg):
        with lock, open(prog, 'a', encoding='utf-8') as f:
            f.write(f'[{time.time() - t0:7.1f}s] {msg}\n')
        print(msg, flush=True)

    global PP
    if a.renderer == 'pp':
        PP = PPRender()
    log(f'시작: {len(nums)}장, 청크 {len(chunks)}개, 작업자 {a.workers}, 렌더러 {a.renderer}')
    try:
        with ThreadPoolExecutor(a.workers) as ex:
            futs = {ex.submit(do_chunk, ci, [n - 1 for n in c], a, profiles): (ci, c) for ci, c in enumerate(chunks)}
            for fu in as_completed(futs):
                ci, c = futs[fu]
                res, fail = fu.result()
                if fail and len(c) > 1:  # 청크 실패 -> 장별 재시도
                    log(f'청크 {ci} ({c[0]}-{c[-1]}) 실패, 장별 재시도: {list(fail.values())[0][:120]}')
                    res, fail = {}, {}
                    for n in c:
                        r1, f1 = do_chunk(10000 + n, [n - 1], a, profiles)
                        res.update(r1)
                        fail.update(f1)
                results.update(res)
                failed.update(fail)
                log(f'청크 {ci} 완료 ({c[0]}-{c[-1]}) 누적 {len(results)}장, 실패 {len(failed)}장')
    finally:
        if PP:
            PP.quit()  # 우리가 띄운 PowerPoint 종료

    # 덱 JSON: 기존 deck.json과 srcSlide 기준으로 합침
    deck_path = os.path.join(a.out, 'deck.json')
    slides = {}
    if os.path.exists(deck_path):
        old = json.load(open(deck_path, encoding='utf-8'))
        slides = {s['srcSlide']: s for s in old.get('slides', [])}
    scores = {n: r.pop('_score') for n, r in results.items() if '_score' in r}
    if scores:
        sp_ = os.path.join(a.out, 'score.json')
        old_s = json.load(open(sp_, encoding='utf-8')) if os.path.exists(sp_) else {}
        old_s.update({str(n): v for n, v in scores.items()})
        json.dump(old_s, open(sp_, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    slides.update(results)
    deck = {'title': a.title, 'slides': [slides[k] for k in sorted(slides)]}
    json.dump(deck, open(deck_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    imgs = glob.glob(os.path.join(a.out, 'images', '*.webp'))
    size = sum(os.path.getsize(p) for p in imgs)
    allm = [m for s in slides.values() for m in s['marks']]  # 합친 덱 전체 기준
    oob = sum(1 for m in allm if m['kind'] == 'arrow' for x, y in m['pts'] if not (0 <= x <= 100 and 0 <= y <= 100))
    rep = {'slides_in_deck': len(slides), 'slides_this_run': len(results), 'slides_failed': failed, 'seconds': round(time.time() - t0, 1),
           'images_total_mb': round(size / 1048576, 2), 'images_count': len(imgs),
           'arrows': sum(1 for m in allm if m['kind'] == 'arrow'),
           'labels': sum(1 for m in allm if m['kind'] == 'label'),
           'arrow_points_out_of_slide': oob,
           'slides_no_title': [n for n, s in slides.items() if not s['title']]}
    json.dump(rep, open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log('끝: ' + json.dumps(rep, ensure_ascii=False))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
