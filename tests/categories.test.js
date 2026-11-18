import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCategory, isReservedName, sectionEmoji } from '../js/core/categories.js';

test('sectionEmoji bölüm adından simge tahmin eder', () => {
  assert.equal(sectionEmoji('Yemek'), '🍽️');
  assert.equal(sectionEmoji('Kantin'), '🍽️');
  assert.equal(sectionEmoji('ULAŞIM'), '🚌');
  assert.equal(sectionEmoji('İstanbulkart'), '🚌');
  assert.equal(sectionEmoji('Telefon faturası'), '📱');
  assert.equal(sectionEmoji('Kira'), '🏠');
  assert.equal(sectionEmoji('Evrak'), null);
  assert.equal(sectionEmoji('Zxq'), null);
});

test('isReservedName Keyif adını Türkçe büyük harfle de tanır', () => {
  assert.equal(isReservedName('keyif'), true);
  assert.equal(isReservedName(' KEYİF '), true);
  assert.equal(isReservedName('Keyifli şeyler'), false);
});

test('describeCategory gelir, keyif ve bölümleri adlandırır', () => {
  const sections = [{ id: 's1', name: 'ıspanak', color: '#123456' }];
  assert.equal(describeCategory('income', 'harclik', sections).label, 'Harçlık');
  assert.equal(describeCategory('income', 'bilinmeyen', sections).label, 'Ek para');
  assert.equal(describeCategory('expense', 'keyif', sections).label, 'Keyif');
  assert.deepEqual(describeCategory('expense', 's1', sections), {
    id: 's1', label: 'ıspanak', emoji: null, letter: 'I', color: '#123456'
  });
  assert.equal(describeCategory('expense', 'yok', sections).label, 'Keyif');
});
