/* =====================================================================
   apps-script.gs — 구글시트 연동용 Apps Script (아산정플란트치과 도구 모음)
   ---------------------------------------------------------------------
   역할: 웹앱(도구 모음)이 보낸 로그를 구글 스프레드시트에 한 줄씩 기록.
        shared.js 의 sheetsInsert() 가 이 웹앱 URL로 JSON을 POST 한다.

   ▷ 받는 데이터 형태 (shared.js 의 row):
     { kind, name, payload, user_agent }
        kind      : 'saju' | 'ladder' | 'picker' 등 도구 종류
        name      : 입력자 이름(없으면 null)
        payload   : 자유 형식 객체 (뽑기 결과, 사다리 매핑 등)
        user_agent: 브라우저 정보

   ▷ 시트 컬럼: 시각 | 종류 | 이름 | 요약 | 상세(JSON) | 브라우저
   ---------------------------------------------------------------------
   배포 방법은 파일 하단 주석(【배포 순서】) 참고.
   ===================================================================== */

var SHEET_NAME = '로그'; // 기록할 시트(탭) 이름. 없으면 자동 생성.

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      data.kind || '',
      data.name || '',
      summarize_(data.kind, data.payload),
      JSON.stringify(data.payload || {}),
      data.user_agent || ''
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// 브라우저에서 URL 직접 열었을 때 동작 확인용
function doGet() {
  return json_({ ok: true, msg: 'clinic-toolkit sheets endpoint alive' });
}

// 종류별 사람이 읽기 쉬운 한 줄 요약
function summarize_(kind, p) {
  p = p || {};
  try {
    if (kind === 'picker') {
      return '당첨: ' + (p.winners || []).join(', ') +
             ' (전체 ' + ((p.roster || []).length) + '명 중 ' + (p.count || 0) + '명)';
    }
    if (kind === 'ladder') {
      var m = p.mapping || {};
      return Object.keys(m).map(function (k) { return k + '→' + m[k]; }).join(' · ');
    }
    if (kind === 'saju') {
      return (p.name || '') + ' ' + (p.birth || p.birthDate || '');
    }
  } catch (e) {}
  return '';
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['시각', '종류', '이름', '요약', '상세(JSON)', '브라우저']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================================
   【배포 순서】 (한 번만 하면 됩니다)
   1. sheets.google.com → 새 스프레드시트 만들기 (이름: 예) 도구모음 로그)
   2. 상단 메뉴 [확장 프로그램] → [Apps Script] 클릭
   3. 기본 코드 전부 지우고 이 파일 내용 붙여넣기 → 💾 저장
   4. 우측 상단 [배포] → [새 배포]
      - 유형 선택(톱니바퀴) → [웹 앱]
      - 설명: 아무거나
      - 실행 계정: 나
      - 액세스 권한: 【모든 사용자】  ← 반드시 이걸로!
      - [배포] → 권한 승인(내 구글 계정 허용)
   5. 나오는 【웹 앱 URL】(...script.google.com/macros/s/XXXX/exec) 복사
   6. 그 URL을 나(클로드)에게 붙여넣어 주세요 → shared.js 에 연결합니다.
   ===================================================================== */
