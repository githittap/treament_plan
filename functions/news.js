/* =====================================================================
   functions/news.js — Cloudflare Pages Function (서버리스 뉴스 프록시)
   경로: /news?cat=dental|insurance|law
   구글 뉴스 RSS를 서버 측에서 대신 받아와(같은 출처) CORS 문제를 제거한다.
   ===================================================================== */
const QUERIES = {
  dental: '치과',
  insurance: '치과 건강보험 OR 치과 보험 OR 치과 수가',
  law: '치과 판결 OR 치과 소송 OR 의료 판결 OR 의료소송'
};

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const cat = url.searchParams.get('cat') || 'dental';
  const q = encodeURIComponent(QUERIES[cat] || QUERIES.dental);
  const rss = 'https://news.google.com/rss/search?q=' + q + '&hl=ko&gl=KR&ceid=KR:ko';

  try {
    const r = await fetch(rss, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClinicNewsBot/1.0)' },
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    const xml = await r.text();
    return new Response(xml, {
      status: r.ok ? 200 : 502,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=600'
      }
    });
  } catch (e) {
    return new Response('<?xml version="1.0"?><rss><channel></channel></rss>', {
      status: 502,
      headers: { 'content-type': 'application/xml; charset=utf-8' }
    });
  }
}
