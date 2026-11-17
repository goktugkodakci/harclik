// Static server for trying the app on this computer and on a phone on the same Wi-Fi.
// Run: npm start   (PORT=3000 npm start to change the port)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_PORT = 8080;
const HOST = '0.0.0.0';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

// Only the app itself is served; planning notes, tests and git data stay private.
const PUBLIC_PATH = /^\/(index\.html|sw\.js|manifest\.webmanifest|css\/[\w.-]+|js\/[\w./-]+|icons\/[\w.-]+)$/;

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  response.end(body);
}

export function createAppServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'İzin verilmiyor');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      send(response, 400, 'Geçersiz adres');
      return;
    }
    if (pathname === '/') {
      pathname = '/index.html';
    }
    const file = resolve(ROOT, `.${pathname}`);
    if (!PUBLIC_PATH.test(pathname) || pathname.includes('..') || !file.startsWith(ROOT + sep)) {
      send(response, 404, 'Bulunamadı');
      return;
    }
    try {
      send(response, 200, await readFile(file), CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
    } catch (error) {
      const missing = error.code === 'ENOENT';
      send(response, missing ? 404 : 500, missing ? 'Bulunamadı' : 'Sunucu hatası');
    }
  });
}

function lanAddresses(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createAppServer().listen(port, HOST, () => {
    console.log(`Harçlık çalışıyor:\n  Bu bilgisayar: http://localhost:${port}`);
    for (const address of lanAddresses(port)) {
      console.log(`  Aynı Wi-Fi'deki telefon: ${address}`);
    }
    console.log('Durdurmak için Ctrl+C');
  });
}
