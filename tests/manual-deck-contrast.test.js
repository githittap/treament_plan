// 설명덱 제작기 글자 대비(실제 브라우저) — tools/contrast_audit.py 를 돌려 양 테마(어둡게·밝게)의 편집 화면·도움말·장 종류 창·글 입력 창·알림·허브 화면·발표 화면(튜토리얼 덱 전체)에서 4.5 미만(큰 글 3.0)이 0건인지 확인.
// playwright(python)·크롬이 없는 PC 에서는 건너뜀(종료코드 2).
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { spawnSync } = require('node:child_process');
const tool = path.join(__dirname, '..', 'tools', 'contrast_audit.py');

test('[대비 점검] 실제 브라우저로 양 테마 모든 화면의 글자 대비 미달 0건', t => {
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [tool, '--json'], { encoding: 'utf8', timeout: 280000, env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
  if (py.error || py.status === 2) { t.skip('python·playwright·크롬이 없어 건너뜀: ' + ((py.error && py.error.message) || (py.stdout || '').slice(0, 120))); return; }
  assert.ok(py.status === 0 || py.status === 1, '점검 도구 오류: ' + py.stderr.slice(0, 400));
  const out = JSON.parse(py.stdout.trim().split('\n').pop()), checked = out.summary.reduce((a, r) => a + r[2], 0);
  const scenes = new Set(out.summary.map(r => r[1]));
  assert.ok(checked > 3000, '글을 충분히 검사함: ' + checked);
  for (const w of ['편집 도움말', '장 종류 창', '알림(오류)', '알림(일반)', '허브 오류 화면', '발표 도움말']) assert.ok(scenes.has(w), w + ' 화면을 점검함');
  assert.ok(['cover', 'statement', 'diagram', 'table', 'compare', 'checklist', 'photo'].every(ty => [...scenes].some(s => s.startsWith('발표 ') && s.includes('(' + ty + ')'))), '발표 화면은 7가지 장 종류 모두');
  assert.ok(['dark', 'light'].every(th => out.summary.some(r => r[0] === th)), '두 테마 모두');
  assert.deepEqual(out.fails.map(f => `[${f.theme}/${f.scene}] ${f.el} "${f.text}" ${f.fg}/${f.bg}=${f.ratio}(기준 ${f.need})`), [], '대비 미달');
});
