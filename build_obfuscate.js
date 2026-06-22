/*
 * 배포용 난독화 빌드 스크립트
 * 원본(치료계획.html)의 메인 <script>만 난독화하여 치료계획.min.html 로 출력.
 * 실행: node build_obfuscate.js
 *   (javascript-obfuscator 미설치 시 자동으로 npx 통해 1회 설치/사용)
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '치료계획.html');
const OUT = path.join(__dirname, '치료계획.min.html');

const html = fs.readFileSync(SRC, 'utf8');

// 메인 스크립트 식별: mainCanvas 를 참조하는 <script> 블록
const scriptRe = /<script>([\s\S]*?)<\/script>/g;
let match, mainStart = -1, mainEnd = -1, mainCode = null;
while ((match = scriptRe.exec(html)) !== null) {
  if (match[1].includes("getElementById('mainCanvas')")) {
    mainCode = match[1];
    mainStart = match.index;
    mainEnd = scriptRe.lastIndex;
    break;
  }
}
if (mainCode === null) {
  console.error('메인 스크립트를 찾지 못했습니다.');
  process.exit(1);
}

let JsObfuscator;
try {
  JsObfuscator = require('javascript-obfuscator');
} catch (e) {
  console.error('javascript-obfuscator 가 설치되어 있지 않습니다.');
  console.error('다음 명령으로 설치 후 다시 실행하세요:');
  console.error('  npm install javascript-obfuscator');
  process.exit(2);
}

const obf = JsObfuscator.obfuscate(mainCode, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  identifierNamesGenerator: 'mangled',
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  selfDefending: true,
  disableConsoleOutput: false,
}).getObfuscatedCode();

const newHtml =
  html.slice(0, mainStart) +
  '<script>' + obf + '</script>' +
  html.slice(mainEnd);

fs.writeFileSync(OUT, newHtml, 'utf8');
console.log('생성 완료:', path.basename(OUT));
console.log('원본 크기 :', html.length.toLocaleString(), 'bytes');
console.log('난독화본 :', newHtml.length.toLocaleString(), 'bytes');
