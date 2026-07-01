/* =====================================================================
   shared.js — 공용 백엔드 로깅 모듈 (아산정플란트치과 도구 모음)
   - Supabase(REST) 에 익명 insert
   - Google Apps Script 웹앱(구글시트) 로 동시 전송 (URL 설정 시)
   두 곳 중 하나가 실패해도 나머지는 계속 시도한다.
   ===================================================================== */
(function (global) {
  'use strict';

  // ---- Supabase (anon 공개키 — 프론트 노출 안전) ----
  var SUPABASE_URL = 'https://jvoiblimthwuhbspwkwu.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2b2libGltdGh3dWhic3B3a3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTQ2MzMsImV4cCI6MjA5ODQ3MDYzM30.vzdsNsOl1saSil_Y9QrpiDAPR5ojLjr0U3IkY1_-Pmo';

  // ---- Google Apps Script 웹앱 URL (배포 후 여기에 채움) ----
  var SHEETS_WEBAPP_URL = ''; // 예: 'https://script.google.com/macros/s/XXXX/exec'

  function supabaseInsert(row) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve({ ok: false, skipped: true });
    return fetch(SUPABASE_URL + '/rest/v1/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    }).then(function (r) { return { ok: r.ok, status: r.status }; })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }

  function sheetsInsert(row) {
    if (!SHEETS_WEBAPP_URL) return Promise.resolve({ ok: false, skipped: true });
    // Apps Script 웹앱은 CORS 프리플라이트 회피를 위해 text/plain 로 전송
    return fetch(SHEETS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(row)
    }).then(function (r) { return { ok: r.ok, status: r.status }; })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }

  /**
   * logEntry — 사용자 입력을 백엔드에 기록 (실패해도 UI를 막지 않음)
   * @param {string} kind    'saju' | 'ladder' | 'picker' 등
   * @param {string} name    입력자 이름(선택)
   * @param {object} payload 자유 형식 데이터
   * @returns {Promise<{supabase:object, sheets:object}>}
   */
  function logEntry(kind, name, payload) {
    var row = {
      kind: kind || 'unknown',
      name: name || null,
      payload: payload || {},
      user_agent: (global.navigator && global.navigator.userAgent) || ''
    };
    return Promise.all([supabaseInsert(row), sheetsInsert(row)])
      .then(function (res) { return { supabase: res[0], sheets: res[1] }; });
  }

  global.ClinicDB = { logEntry: logEntry, SUPABASE_URL: SUPABASE_URL };
})(window);
