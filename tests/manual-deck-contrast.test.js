// 설명덱 제작기 글자 대비(실제 브라우저) — tools/contrast_audit.py 를 돌려 양 테마(어둡게·밝게)의 편집 화면·도움말·장 종류 창·글 입력 창·알림·허브 화면·발표 화면(튜토리얼 덱 전체)과
// 단추 마우스 올림(hover)·포커스·끌기(dragging) 상태에서 4.5 미만(큰 글 3.0)이 0건인지 확인. 두 테마는 따로 동시에 돌림.
// playwright(python)·크롬이 없는 PC 에서는 건너뜀(종료코드 2).
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { spawn } = require('node:child_process');
const tool = path.join(__dirname, '..', 'tools', 'contrast_audit.py');
const runTheme = theme => new Promise(res => {
  const py = spawn(process.platform === 'win32' ? 'python' : 'python3', [tool, '--json', '--theme=' + theme], { env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
  let out = '', err = ''; py.stdout.on('data', d => out += d); py.stderr.on('data', d => err += d);
  const timer = setTimeout(() => { py.kill(); }, 560000);
  py.on('error', e => { clearTimeout(timer); res({ status: 2, out: String(e.message), err }); });
  py.on('close', status => { clearTimeout(timer); res({ status, out, err }); });
});

test('[대비 점검] 실제 브라우저로 양 테마 모든 화면·hover·focus·끌기 상태의 글자 대비 미달 0건', { timeout: 600000 }, async t => {
  const rs = await Promise.all(['dark', 'light'].map(runTheme));
  if (rs.some(r => r.status === 2)) { t.skip('python·playwright·크롬이 없어 건너뜀: ' + rs[0].out.slice(0, 120)); return; }
  for (const r of rs) assert.ok(r.status === 0 || r.status === 1, '점검 도구 오류: ' + r.err.slice(0, 400));
  const outs = rs.map(r => JSON.parse(r.out.trim().split('\n').pop())), summary = outs.flatMap(o => o.summary), fails = outs.flatMap(o => o.fails);
  const checked = summary.reduce((a, r) => a + r[2], 0), scenes = new Set(summary.map(r => r[1]));
  assert.ok(checked > 3000, '글을 충분히 검사함: ' + checked);
  for (const w of ['편집 도움말', '장 종류 창', '알림(오류)', '알림(일반)', '허브 오류 화면', '발표 도움말', '끌기 중(dragging) 목록 칸', '사진 장: 선택·글 입력 창·원 줄']) assert.ok(scenes.has(w), w + ' 화면을 점검함');
  assert.ok([...scenes].some(s => /hover \.pe-tool$/.test(s)), '도구 단추 hover 를 점검함'); assert.ok([...scenes].some(s => /focus \.input$/.test(s)), '입력칸 focus 를 점검함'); assert.ok([...scenes].some(s => /hover \.nav-btn$/.test(s)), '발표 단추 hover 를 점검함');
  assert.ok(summary.filter(r => /hover \.pe-tool$/.test(r[1])).length >= 16, '도구 단추를 하나하나 hover(테마마다 8개 이상)');
  assert.ok(['cover', 'statement', 'diagram', 'table', 'compare', 'checklist', 'photo'].every(ty => [...scenes].some(s => s.startsWith('발표 ') && s.includes('(' + ty + ')'))), '발표 화면은 7가지 장 종류 모두');
  assert.ok(['dark', 'light'].every(th => summary.some(r => r[0] === th)), '두 테마 모두');
  assert.deepEqual(fails.map(f => `[${f.theme}/${f.scene}] ${f.el} "${f.text}" ${f.fg}/${f.bg}=${f.ratio}(기준 ${f.need})`), [], '대비 미달');
});
