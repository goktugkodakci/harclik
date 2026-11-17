import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  dayWithSuffix,
  daysInMonth,
  diffDays,
  formatDayHeading,
  formatDayMonth,
  formatRange,
  isValidISODate,
  makeISODate,
  parseISODate,
  toISODate
} from '../js/core/dates.js';

test('formatDayHeading bugün, dün ve hafta gününü yazar', () => {
  assert.equal(formatDayHeading('2026-11-17', '2026-11-17'), 'Bugün');
  assert.equal(formatDayHeading('2026-11-16', '2026-11-17'), 'Dün');
  assert.equal(formatDayHeading('2026-11-10', '2026-11-17'), '10 Kasım Salı');
  assert.equal(formatDayHeading('2025-12-31', '2026-11-17'), '31 Aralık 2025 Çarşamba');
});

test('formatDayMonth ve formatRange kısa ay adlarını kullanır', () => {
  assert.equal(formatDayMonth('2026-12-01'), '1 Aralık');
  assert.equal(formatRange('2026-11-15', '2026-11-30', '2026-11-17'), '15 Kas – 30 Kas');
  assert.equal(formatRange('2026-12-15', '2026-12-31', '2027-01-03'), '15 Ara 2026 – 31 Ara 2026');
});

test('dayWithSuffix Türkçe eki sayının okunuşuna göre seçer', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 20, 23, 30, 31].map(dayWithSuffix),
    ["1'i", "2'si", "3'ü", "4'ü", "5'i", "6'sı", "7'si", "8'i", "9'u", "10'u", "15'i", "16'sı", "20'si", "23'ü", "30'u", "31'i"]
  );
});

test('toISODate yerel takvim gününü verir', () => {
  assert.equal(toISODate(new Date(2026, 10, 16, 23, 59)), '2026-11-16');
  assert.equal(toISODate(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('parseISODate ve makeISODate birbirinin tersidir', () => {
  assert.deepEqual(parseISODate('2026-02-09'), { year: 2026, month: 2, day: 9 });
  assert.equal(makeISODate(2026, 2, 9), '2026-02-09');
});

test('daysInMonth artık yılı bilir', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 11), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test('addDays ay ve yıl sınırını geçer', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('diffDays yaz saati geçişinden etkilenmez', () => {
  assert.equal(diffDays('2026-12-01', '2026-11-15'), 16);
  assert.equal(diffDays('2026-03-30', '2026-03-28'), 2);
  assert.equal(diffDays('2026-11-15', '2026-11-15'), 0);
  assert.equal(diffDays('2026-11-14', '2026-11-15'), -1);
});

test('isValidISODate olmayan günleri reddeder', () => {
  assert.equal(isValidISODate('2026-11-16'), true);
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('2026-13-01'), false);
  assert.equal(isValidISODate('16.11.2026'), false);
  assert.equal(isValidISODate(null), false);
});
