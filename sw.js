// 최소 서비스워커 — PWA 설치가능 조건 충족용. 데이터 최신성 위해 캐시 안 함(네트워크 통과).
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){
  e.respondWith(fetch(e.request).catch(function(){
    return new Response('오프라인 — 인터넷 연결 후 다시 시도하세요.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
});
function pushText(value,fallback){return typeof value==='string'?value.slice(0,200):fallback;}
function pushUrl(value){try{const url=new URL(typeof value==='string'?value:'/hr.html',self.location.origin);return url.origin===self.location.origin&&url.pathname==='/hr.html'?url.href:new URL('/hr.html',self.location.origin).href;}catch(_){return new URL('/hr.html',self.location.origin).href;}}
self.addEventListener('push',function(e){let raw={};try{raw=e.data?e.data.json():{};}catch(_){}const url=pushUrl(raw&&raw.url),title=pushText(raw&&raw.title,'직원 허브 알림'),body=pushText(raw&&raw.body,'새 알림이 있습니다.');e.waitUntil(self.registration.showNotification(title,{body,icon:'icons/icon-192.png',data:{url}}));});
self.addEventListener('notificationclick',function(e){e.notification.close();const url=pushUrl(e.notification.data&&e.notification.data.url);e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(const client of list){const current=new URL(client.url);if(current.origin===self.location.origin&&current.pathname==='/hr.html'&&'focus' in client)return client.focus();}return clients.openWindow(url);}));});
