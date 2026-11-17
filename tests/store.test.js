import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupState } from '../js/core/budget.js';
import {
  CORRUPT_KEY,
  STORAGE_KEY,
  exportBackup,
  importBackup,
  loadState,
  saveState
} from '../js/core/store.js';

const PLAN = [{ day: 1, amount: 300000 }, { day: 15, amount: 300000 }];

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value))
  };
}

function sampleState() {
  return setupState({ paydays: PLAN, balance: 250000, today: '2026-11-16', now: 1000 });
}

test('boş depoda kurulum gerektiren durum döner', () => {
  const { state, status } = loadState(memoryStorage());
  assert.equal(status, 'empty');
  assert.equal(state.settings.setupDone, false);
});

test('depo yoksa unavailable döner', () => {
  assert.equal(loadState(null).status, 'unavailable');
  assert.equal(saveState(null, sampleState()), false);
});

test('kaydet ve yükle aynı durumu verir', () => {
  const storage = memoryStorage();
  const state = sampleState();
  assert.equal(saveState(storage, state), true);
  const loaded = loadState(storage);
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.state, state);
});

test('bozuk JSON çökertmez ve ham veri kenara alınır', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{bozuk' });
  const { state, status } = loadState(storage);
  assert.equal(status, 'corrupt');
  assert.equal(state.settings.setupDone, false);
  assert.equal(storage.map.get(CORRUPT_KEY), '{bozuk');
});

test('geçersiz plan bozuk sayılır', () => {
  const broken = { ...sampleState(), settings: { setupDone: true, paydays: [{ day: 40, amount: 1 }], carryOver: true } };
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(broken) });
  assert.equal(loadState(storage).status, 'corrupt');
});

test('kurulum bayrağı kaybolmuş ama kayıt içeren veri sessizce silinmez', () => {
  const { setupDone, ...settingsWithoutFlag } = sampleState().settings;
  assert.equal(setupDone, true);
  const text = JSON.stringify({ ...sampleState(), settings: settingsWithoutFlag });
  const storage = memoryStorage({ [STORAGE_KEY]: text });
  const { state, status } = loadState(storage);
  assert.equal(status, 'repaired');
  assert.equal(state.settings.setupDone, false);
  assert.equal(storage.map.get(CORRUPT_KEY), text);
});

test('bozuk kayıtlar atılır, eksik alanlar onarılır', () => {
  const state = sampleState();
  const raw = {
    ...state,
    entries: [
      ...state.entries,
      { id: 'x1', type: 'expense', amount: 500, category: 'uydurma', note: 'n'.repeat(90), date: '2026-11-16' },
      { id: 'x1', type: 'expense', amount: 700, category: 'yemek', date: '2026-11-16' },
      { id: 'x2', type: 'expense', amount: -5, category: 'yemek', date: '2026-11-16' },
      { id: 'x3', type: 'transfer', amount: 5, category: 'yemek', date: '2026-11-16' },
      { id: 'x4', type: 'income', amount: 5, category: 'ek', date: '2026-02-30' },
      { id: 'x5', type: 'income', amount: 9e15, category: 'ek', date: '2026-11-16' },
      null,
      'metin'
    ]
  };
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(raw) });
  const { state: loaded, status } = loadState(storage);
  assert.equal(status, 'repaired');
  assert.equal(storage.map.get(CORRUPT_KEY), JSON.stringify(raw));
  assert.equal(loaded.entries.length, state.entries.length + 1);
  const repaired = loaded.entries.find((item) => item.id === 'x1');
  assert.equal(repaired.amount, 500);
  assert.equal(repaired.category, 'diger');
  assert.equal(repaired.note.length, 60);
  assert.equal(repaired.createdAt, 0);
});

test('depolama hata verirse saveState false döner', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(saveState(storage, sampleState()), false);
});

test('yedek al ve geri yükle gidiş dönüşü', () => {
  const state = sampleState();
  const text = exportBackup(state, Date.UTC(2026, 10, 16));
  assert.match(text, /"app": "harclik"/);
  const result = importBackup(text);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.state, state);
});

test('yedekte okunamayan kayıtlar sayılır', () => {
  const state = sampleState();
  const result = importBackup(JSON.stringify({ ...state, entries: [...state.entries, { id: 'bozuk' }] }));
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 1);
});

test('sarmalayıcısız ham durum da yedek olarak kabul edilir', () => {
  const state = sampleState();
  assert.deepEqual(importBackup(JSON.stringify(state)).state, state);
});

test('yanlış dosyalar anlaşılır hata verir', () => {
  assert.equal(importBackup('bu json değil').ok, false);
  assert.match(importBackup('bu json değil').error, /okunamadı/);
  assert.match(importBackup('{"foo":1}').error, /Harçlık yedeği/);
  assert.match(importBackup(JSON.stringify({ version: 1, settings: { setupDone: false } })).error, /plan/);
});
