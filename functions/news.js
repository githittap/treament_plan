/* =====================================================================
   functions/news.js — Cloudflare Pages Function (서버리스 뉴스 프록시)
   경로: /news?cat=dental|insurance|law
   Bing 뉴스 RSS를 서버 측에서 대신 받아와(같은 출처) CORS 문제를 제거한다.
   ※ 구글 뉴스 RSS는 클라우드 서버 IP를 차단하므로 Bing 사용.
   ===================================================================== */
// ※ Bing 뉴스는 OR 연산자 미지원 → 각 카테고리당 단순 쿼리 하나
const QUERIES = {
  dental: '치과',
  insurance: '치과 건강보험',
  law: '치과 소송'
};

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const cat = url.searchParams.get('cat') || 'dental';
  const q = encodeURIComponent(QUERIES[cat] || QUERIES.dental);
  const rss = 'https://www.bing.com/news/search?q=' + q + '&format=RSS&setlang=ko&cc=KR&sortbydate=1';

  try {
    const r = await fetch(rss, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    const xml = await r.text();
    const ok = r.ok && xml.indexOf('<item>') !== -1;
    return new Response(xml, {
      status: ok ? 200 : 502,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': ok ? 'public, max-age=600' : 'no-store'
      }
    });
  } catch (e) {
    return new Response('<?xml version="1.0"?><rss><channel></channel></rss>', {
      status: 502,
      headers: { 'content-type': 'application/xml; charset=utf-8' }
    });
  }
}
