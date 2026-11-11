// Rodoslov – offline. Pri svakoj promjeni povećaj verziju.
const VERSION='rod-1.0.0';
const SHELL=['./','index.html','app.js','style.css','config.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('rod-')&&x!==VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin!==location.origin){if(!/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))return;e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const c=res.clone();caches.open(VERSION).then(x=>x.put(r,c));return res})));return}
  e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const c=res.clone();caches.open(VERSION).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))});
