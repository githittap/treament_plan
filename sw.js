// 최소 서비스워커 — PWA 설치가능 조건 충족용. 데이터 최신성 위해 캐시 안 함(네트워크 통과).
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){
  e.respondWith(fetch(e.request).catch(function(){
    return new Response('오프라인 — 인터넷 연결 후 다시 시도하세요.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
});
