const CACHE='repairdesk-shell-v1.0.0';
const SCOPE=self.registration.scope;
const SHELL_URL=new URL('./',SCOPE).href;
const APP_FILES=['./','./index.html','./styles.css','./manifest.webmanifest','./src/app.mjs','./src/core.mjs','./src/store.mjs','./vendor/dexie.mjs','./vendor/chart.umd.js','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
const STATIC_PATHS=new Set(APP_FILES.map(p=>new URL(p,SCOPE).pathname));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(APP_FILES.map(p=>new Request(new URL(p,SCOPE),{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('repairdesk-shell-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{return await fetch(request);}catch{return (await caches.match(SHELL_URL))||Response.error();}
    })());
    return;
  }
  if(!STATIC_PATHS.has(url.pathname))return;
  event.respondWith((async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try{return await fetch(request);}catch{return Response.error();}
  })());
});
