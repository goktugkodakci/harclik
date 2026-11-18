export const ALLOWANCE_CATEGORY = 'harclik';
export const EXTRA_INCOME_CATEGORY = 'ek';
export const KEYIF_CATEGORY = 'keyif';
// Expense entries point either at "keyif" or at a user-made section id; these ids are taken.
export const RESERVED_IDS = [KEYIF_CATEGORY, ALLOWANCE_CATEGORY, EXTRA_INCOME_CATEGORY];

export const KEYIF = { id: KEYIF_CATEGORY, label: 'Keyif', emoji: '🎉', color: '#D4537E' };

export const INCOME_CATEGORIES = [
  { id: ALLOWANCE_CATEGORY, label: 'Harçlık', emoji: '💸', color: '#2F8A63' },
  { id: EXTRA_INCOME_CATEGORY, label: 'Ek para', emoji: '💰', color: '#2F8A63' }
];

// New sections take the next color in turn; mid-tones that read on both light and dark.
export const SECTION_COLORS = ['#D9734E', '#3B82C4', '#2F9C7E', '#6574D1', '#D6A02A', '#9C6B43', '#B05FB0', '#4E8FA8'];

// Section names are free text, so the icon is a best guess from the words in the name.
// Each pattern is tested against single words; "ev" must match whole, or "evrak" would be a house.
const ICON_HINTS = [
  [/^(yemek|kantin|market|mutfak|gıda|öğle|akşam|kahvaltı|yemekhane)/, '🍽️'],
  [/^(kahve|çay|kafe)/, '☕'],
  [/^(ulaşım|yol|otobüs|metro|akbil|istanbulkart|taksi|benzin|dolmuş|marmaray|tramvay)/, '🚌'],
  [/^(telefon|fatura|internet|hat|abonelik|spotify|netflix|youtube)/, '📱'],
  [/^(kira|yurt|aidat)|^ev$/, '🏠'],
  [/^(okul|kitap|kırtasiye|ders|kurs|fotokopi|üniversite)/, '📚'],
  [/^(spor|gym|salon|fitness)/, '🏋️'],
  [/^(sağlık|ilaç|eczane|doktor)/, '💊'],
  [/^(giyim|kıyafet|ayakkabı)/, '👕'],
  [/^(bakım|kozmetik|kuaför|berber)/, '🧴'],
  [/^(eğlence|oyun|sinema|konser)/, '🎮'],
  [/^(alışveriş)/, '🛍️'],
  [/^(hediye)/, '🎁'],
  [/^(birikim|tasarruf|kumbara)/, '🐷'],
  [/^(diğer)/, '📦']
];

function nameWords(name) {
  return name.toLocaleLowerCase('tr').split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
}

export function isReservedName(name) {
  return name.trim().toLocaleLowerCase('tr') === KEYIF.label.toLocaleLowerCase('tr');
}

export function isIncomeCategory(id) {
  return INCOME_CATEGORIES.some((category) => category.id === id);
}

export function sectionEmoji(name) {
  const words = nameWords(name);
  for (const [pattern, emoji] of ICON_HINTS) {
    if (words.some((word) => pattern.test(word))) {
      return emoji;
    }
  }
  return null;
}

function firstLetter(name) {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase('tr');
}

// One shape for everything a row, chip or bubble needs to draw a category.
export function describeCategory(type, id, sections = []) {
  if (type === 'income') {
    const income = INCOME_CATEGORIES.find((category) => category.id === id) ?? INCOME_CATEGORIES[1];
    return { id: income.id, label: income.label, emoji: income.emoji, letter: null, color: income.color };
  }
  const section = sections.find((item) => item.id === id);
  if (!section) {
    return { id: KEYIF.id, label: KEYIF.label, emoji: KEYIF.emoji, letter: null, color: KEYIF.color };
  }
  return { id: section.id, label: section.name, emoji: sectionEmoji(section.name), letter: firstLetter(section.name), color: section.color };
}
