import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(root + path, 'utf8');
function worker(overrides = {}) {
  const listeners = {};
  const sandbox = {
    URL, Request, Response,
    self: { registration: { scope:'https://example.test/repairdesk/' }, location:{origin:'https://example.test'}, addEventListener:(name, cb)=>{listeners[name]=cb;}, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
    caches: {open:async()=>({addAll:async()=>{}}), keys:async()=>[], match:async()=>undefined},
    fetch:async()=>{throw new Error('Offline');}, ...overrides
  };
  vm.runInNewContext(read('sw.js'), sandbox);
  return listeners;
}

test('manifest is relative-scoped with real PNG install icons at 192px and 512px',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  for(const size of [192,512]){
    const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);
    assert.ok(icon);
    const png=readFileSync(root+icon.src);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
});

test('offline install precaches only existing app-local shell and vendor files',async()=>{
  let files=[];
  const handlers=worker({caches:{open:async()=>({addAll:async requests=>{files=requests;}})}});
  let done;
  handlers.install({waitUntil:p=>{done=p;}});
  await done;
  assert.ok(files.length>=12);
  for(const request of files){
    const url=new URL(request.url);
    assert.equal(url.origin,'https://example.test');
    assert.ok(url.pathname.startsWith('/repairdesk/'));
    const relative=url.pathname.replace('/repairdesk/','')||'index.html';
    assert.ok(existsSync(root+relative),relative);
  }
  for(const file of ['src/app.mjs','src/core.mjs','src/store.mjs','vendor/dexie.mjs','vendor/chart.umd.js'])assert.ok(files.some(r=>r.url.endsWith('/'+file)));
});

test('offline navigation falls back to the cached project shell',async()=>{
  let key;
  const shell=new Response('<!doctype html><title>RepairDesk</title>');
  const handlers=worker({caches:{match:async request=>{key=request;return shell;}}});
  let result;
  handlers.fetch({request:{method:'GET',url:'https://example.test/repairdesk/',mode:'navigate'},respondWith:p=>{result=p;}});
  assert.equal(await (await result).text(),'<!doctype html><title>RepairDesk</title>');
  assert.equal(key,'https://example.test/repairdesk/');
});

test('service worker leaves external sites, POSTs and non-shell requests alone',()=>{
  const handlers=worker();
  for(const request of [
    {method:'POST',url:'https://example.test/repairdesk/',mode:'cors'},
    {method:'GET',url:'https://wa.me/12345678',mode:'cors'},
    {method:'GET',url:'https://example.test/repairdesk/private-backup.json',mode:'cors'}
  ]){
    handlers.fetch({request,respondWith:()=>assert.fail('Unexpected interception')});
  }
});

test('static shell uses bundled libraries, restrictive script policy and an A5-only receipt print layout',()=>{
  const html=read('index.html');
  assert.match(html,/vendor\/chart\.umd\.js/);
  assert.match(html,/src\/app\.mjs/);
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/);
  assert.match(html,/script-src 'self'/);
  const css=read('styles.css');
  assert.match(css,/@page\{size:A5/);
  assert.match(css,/#app-layout,#gate,#toast-region\{display:none!important/);
  assert.match(css,/\[hidden\]\{display:none!important/);
});
