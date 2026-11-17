import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bufferToKurus,
  formatAmount,
  formatBuffer,
  formatMoney,
  kurusToBuffer,
  parseAmount,
  pressKey
} from '../js/core/money.js';

test('parseAmount Türkçe yazımı kuruşa çevirir', () => {
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('1.250,50'), 125050);
  assert.equal(parseAmount('3000'), 300000);
  assert.equal(parseAmount('3.000'), 300000);
  assert.equal(parseAmount(' ₺ 45 '), 4500);
  assert.equal(parseAmount('12,'), 1200);
});

test('parseAmount noktayı ondalık olarak da kabul eder', () => {
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(parseAmount('0.75'), 75);
});

test('parseAmount anlamsız girdide null döner', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('12,345'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('1,2,3'), null);
});

test('formatAmount binlik ayırır, kuruşu gerektiğinde gösterir', () => {
  assert.equal(formatAmount(0), '0');
  assert.equal(formatAmount(4500), '45');
  assert.equal(formatAmount(125050), '1.250,50');
  assert.equal(formatAmount(123456789), '1.234.567,89');
  assert.equal(formatAmount(4500, { cents: 'always' }), '45,00');
  assert.equal(formatAmount(4599, { cents: 'never' }), '45');
});

test('formatMoney işaret ve simge ekler', () => {
  assert.equal(formatMoney(4500), '₺45');
  assert.equal(formatMoney(-4500), '−₺45');
  assert.equal(formatMoney(4500, { sign: 'always' }), '+₺45');
  assert.equal(formatMoney(-125050, { sign: 'never' }), '₺1.250,50');
});

test('pressKey rakam ekler, baştaki sıfırı yutar', () => {
  assert.equal(pressKey('', '5'), '5');
  assert.equal(pressKey('5', '0'), '50');
  assert.equal(pressKey('0', '7'), '7');
  assert.equal(pressKey('0', '0'), '0');
});

test('pressKey virgülü bir kez ve en fazla iki haneyle kabul eder', () => {
  assert.equal(pressKey('', ','), '0,');
  assert.equal(pressKey('12', ','), '12,');
  assert.equal(pressKey('12,', ','), '12,');
  assert.equal(pressKey('12,5', '0'), '12,50');
  assert.equal(pressKey('12,50', '9'), '12,50');
});

test('pressKey yedi tam haneden sonrasını almaz', () => {
  assert.equal(pressKey('1234567', '8'), '1234567');
  assert.equal(pressKey('1234567', ','), '1234567,');
});

test('pressKey geri tuşu son karakteri siler', () => {
  assert.equal(pressKey('12,5', 'back'), '12,');
  assert.equal(pressKey('1', 'back'), '');
  assert.equal(pressKey('', 'back'), '');
});

test('tuş takımı tamponu kuruşla gidip gelir', () => {
  assert.equal(bufferToKurus(''), 0);
  assert.equal(bufferToKurus('12,'), 1200);
  assert.equal(bufferToKurus('12,5'), 1250);
  assert.equal(kurusToBuffer(1250), '12,5');
  assert.equal(kurusToBuffer(1200), '12');
  assert.equal(kurusToBuffer(1205), '12,05');
  assert.equal(kurusToBuffer(0), '');
});

test('formatBuffer yazılanı binlik ayraçla gösterir', () => {
  assert.equal(formatBuffer(''), '0');
  assert.equal(formatBuffer('1250'), '1.250');
  assert.equal(formatBuffer('1250,'), '1.250,');
  assert.equal(formatBuffer('1250,5'), '1.250,5');
});
