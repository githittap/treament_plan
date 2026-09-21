// 최소 서비스워커 — PWA 설치가능 조건 충족용. 데이터 최신성 위해 캐시 안 함(네트워크 통과).
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){
  e.respondWith(fetch(e.request).catch(function(){
    return new Response('오프라인 — 인터넷 연결 후 다시 시도하세요.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
});
self.addEventListener('push',function(e){let data={title:'직원 허브 알림',body:'새 알림이 있습니다.',url:'/hr.html'};try{data=Object.assign(data,e.data?e.data.json():{});}catch(_){ }e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'icons/icon-192.png',data:{url:data.url}}));});
self.addEventListener('notificationclick',function(e){e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/hr.html';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(const client of list){if(client.url.includes('/hr.html')&&'focus' in client)return client.focus();}return clients.openWindow(url);}));});
