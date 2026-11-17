export const ALLOWANCE_CATEGORY = 'harclik';
export const EXTRA_INCOME_CATEGORY = 'ek';
export const DEFAULT_EXPENSE_CATEGORY = 'yemek';
export const FALLBACK_EXPENSE_CATEGORY = 'diger';

export const EXPENSE_CATEGORIES = [
  { id: 'yemek', label: 'Yemek', emoji: '🍽️', color: '#D9734E' },
  { id: 'kahve', label: 'Kahve', emoji: '☕', color: '#9C6B43' },
  { id: 'ulasim', label: 'Ulaşım', emoji: '🚌', color: '#3B82C4' },
  { id: 'eglence', label: 'Eğlence', emoji: '🎮', color: '#B05FB0' },
  { id: 'alisveris', label: 'Alışveriş', emoji: '🛍️', color: '#D6A02A' },
  { id: 'okul', label: 'Okul', emoji: '📚', color: '#2F9C7E' },
  { id: 'abonelik', label: 'Abonelik', emoji: '📱', color: '#6574D1' },
  { id: 'diger', label: 'Diğer', emoji: '📦', color: '#8A8A80' }
];

export const INCOME_CATEGORIES = [
  { id: ALLOWANCE_CATEGORY, label: 'Harçlık', emoji: '💸', color: '#2F8A63' },
  { id: EXTRA_INCOME_CATEGORY, label: 'Ek para', emoji: '💰', color: '#2F8A63' }
];

export function categoriesFor(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function isKnownCategory(type, id) {
  return categoriesFor(type).some((category) => category.id === id);
}

export function fallbackCategory(type) {
  return type === 'income' ? EXTRA_INCOME_CATEGORY : FALLBACK_EXPENSE_CATEGORY;
}

export function findCategory(type, id) {
  const list = categoriesFor(type);
  return list.find((category) => category.id === id)
    ?? list.find((category) => category.id === fallbackCategory(type));
}
