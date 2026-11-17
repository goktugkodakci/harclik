import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createAppServer } from '../tools/serve.js';

let server;
let port;

before(async () => {
  server = createAppServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  ({ port } = server.address());
});

after(() => new Promise((resolve) => {
  server.close(resolve);
}));

// node:http sends the path exactly as written, so "../" tricks reach the server unnormalized.
function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('uygulama dosyaları doğru türle sunulur', async () => {
  assert.deepEqual(await get('/'), { status: 200, type: 'text/html; charset=utf-8' });
  assert.equal((await get('/js/core/budget.js')).type, 'text/javascript; charset=utf-8');
  assert.equal((await get('/manifest.webmanifest')).type, 'application/manifest+json; charset=utf-8');
  assert.equal((await get('/icons/icon-512.png')).status, 200);
});

test('uygulama dışındaki dosyalar ve klasörden kaçış denemeleri 404 döner', async () => {
  const blocked = [
    '/package.json',
    '/tests/budget.test.js',
    '/.planning/specs/harclik.md',
    '/.git/config',
    '/js/../package.json',
    '/js/%2e%2e/package.json',
    '/js/..%2fpackage.json',
    '/js/..%5cpackage.json',
    '/js/core/budget.js%00.png',
    '//etc/passwd',
    '/js/yok.js'
  ];
  for (const path of blocked) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('bozuk adres ve yazma istekleri reddedilir', async () => {
  assert.equal((await get('/%E0%A4%A')).status, 400);
  assert.equal((await get('/index.html', 'POST')).status, 405);
});
