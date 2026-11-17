import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function filesUnder(directory) {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    return item.isDirectory() ? filesUnder(path) : [relative('.', path).split(sep).join('/')];
  });
}

test('service worker her uygulama dosyasını önbelleğe alır, fazlasını değil', () => {
  const source = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = source.slice(source.indexOf('const ASSETS'), source.indexOf('];'));
  const cached = [...list.matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]).sort();
  const expected = ['', 'index.html', 'manifest.webmanifest', ...filesUnder('css'), ...filesUnder('js'), ...filesUnder('icons')].sort();
  assert.deepEqual(cached, expected);
});

test('sürüm numarası her yerde aynı', () => {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(readFileSync(join(ROOT, 'sw.js'), 'utf8'), new RegExp(`const VERSION = 'harclik-${version}'`));
  assert.match(readFileSync(join(ROOT, 'js/ui/settings.js'), 'utf8'), new RegExp(`const APP_VERSION = '${version}'`));
});

test('manifest ve sayfa var olan dosyalara işaret eder', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const [, path] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(existsSync(join(ROOT, path)), path);
  }
});
