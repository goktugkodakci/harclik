import {
  MAX_ENTRY_AMOUNT,
  NOTE_MAX_LENGTH,
  SECTION_NAME_MAX_LENGTH,
  STATE_VERSION,
  normalizeSectionName,
  validatePaydays
} from './budget.js';
import { EXTRA_INCOME_CATEGORY, KEYIF_CATEGORY, RESERVED_IDS, SECTION_COLORS, isIncomeCategory, isReservedName } from './categories.js';
import { isValidISODate } from './dates.js';
import { MAX_AMOUNT } from './money.js';

export const STORAGE_KEY = 'harclik.v1';
// Unreadable data is set aside here instead of being overwritten by a fresh start.
export const CORRUPT_KEY = 'harclik.v1.bozuk';
// The last save from an older data version, kept once in case a migration ever needs redoing.
export const PRE_MIGRATION_KEY = 'harclik.v1.eski-surum';
const BACKUP_APP = 'harclik';
const BACKUP_INDENT = 2;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

// Version 1 had eight fixed expense categories. They become ordinary sections with the same ids,
// so nothing is lost and adding a "Yemek" section later picks up the old food entries.
const LEGACY_CATEGORIES = [
  ['yemek', 'Yemek', '#D9734E'],
  ['kahve', 'Kahve', '#9C6B43'],
  ['ulasim', 'Ulaşım', '#3B82C4'],
  ['eglence', 'Eğlence', '#B05FB0'],
  ['alisveris', 'Alışveriş', '#D6A02A'],
  ['okul', 'Okul', '#2F9C7E'],
  ['abonelik', 'Abonelik', '#6574D1'],
  ['diger', 'Diğer', '#8A8A80']
];
const LEGACY_FALLBACK = 'diger';

export function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { setupDone: false, paydays: [{ day: 1, amount: 0 }, { day: 15, amount: 0 }], carryOver: true },
    generatedThrough: null,
    sections: [],
    plans: {},
    entries: []
  };
}

function migrateFromV1(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1) {
    return raw;
  }
  const legacyIds = new Set(LEGACY_CATEGORIES.map(([id]) => id));
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry) => (
      entry && entry.type === 'expense'
        ? { ...entry, category: legacyIds.has(entry.category) ? entry.category : LEGACY_FALLBACK }
        : entry
    ))
    : raw.entries;
  const used = new Set((Array.isArray(entries) ? entries : []).filter((entry) => entry?.type === 'expense').map((entry) => entry.category));
  const sections = LEGACY_CATEGORIES.filter(([id]) => used.has(id)).map(([id, name, color]) => ({ id, name, color }));
  return { ...raw, version: 2, sections, plans: {}, entries };
}

// Plans keep their display order through object key order, which only holds for keys that do
// not look like integers; such ids can only come from a hand-edited file.
const INTEGER_LIKE = /^\d+$/;

function uniqueName(name, taken) {
  let candidate = name;
  for (let copy = 2; taken.has(candidate.toLocaleLowerCase('tr')); copy += 1) {
    candidate = `${name} ${copy}`;
  }
  return candidate;
}

function sanitizeSections(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result = [];
  const seenIds = new Set();
  const takenNames = new Set();
  for (const item of raw) {
    if (!item || typeof item.id !== 'string' || item.id === '' || INTEGER_LIKE.test(item.id) || RESERVED_IDS.includes(item.id) || seenIds.has(item.id)) {
      continue;
    }
    // Cut by characters, not UTF-16 units, so an emoji at the edge is not split in half.
    const trimmed = Array.from(normalizeSectionName(item.name)).slice(0, SECTION_NAME_MAX_LENGTH).join('');
    if (trimmed === '' || isReservedName(trimmed)) {
      continue;
    }
    // Two sections with one name could never be told apart; keep both, numbered.
    const name = uniqueName(trimmed, takenNames);
    seenIds.add(item.id);
    takenNames.add(name.toLocaleLowerCase('tr'));
    result.push({
      id: item.id,
      name,
      color: HEX_COLOR.test(item.color) ? item.color : SECTION_COLORS[result.length % SECTION_COLORS.length]
    });
  }
  return result;
}

function sanitizePlans(raw, sectionIds) {
  const plans = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return plans;
  }
  for (const [date, plan] of Object.entries(raw)) {
    if (!isValidISODate(date) || !plan || typeof plan !== 'object') {
      continue;
    }
    const clean = {};
    for (const [id, amount] of Object.entries(plan)) {
      if (sectionIds.has(id) && Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT) {
        clean[id] = amount;
      }
    }
    plans[date] = clean;
  }
  return plans;
}

function sanitizeCategory(type, category, sectionIds) {
  if (type === 'income') {
    return isIncomeCategory(category) ? category : EXTRA_INCOME_CATEGORY;
  }
  return category === KEYIF_CATEGORY || sectionIds.has(category) ? category : KEYIF_CATEGORY;
}

function sanitizeEntry(raw, sectionIds) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { id, type, amount, category, note, date, createdAt } = raw;
  if (typeof id !== 'string' || id === '') {
    return null;
  }
  if (type !== 'expense' && type !== 'income') {
    return null;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_ENTRY_AMOUNT || !isValidISODate(date)) {
    return null;
  }
  return {
    id,
    type,
    amount,
    category: sanitizeCategory(type, category, sectionIds),
    note: typeof note === 'string' ? note.slice(0, NOTE_MAX_LENGTH) : '',
    date,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0
  };
}

// Returns a clean state, or null when the data cannot be trusted at all.
function sanitizeState(input) {
  const raw = migrateFromV1(input);
  if (!raw || typeof raw !== 'object' || raw.version !== STATE_VERSION) {
    return null;
  }
  const { settings } = raw;
  if (!settings || typeof settings !== 'object') {
    return null;
  }
  if (settings.setupDone !== true) {
    return emptyState();
  }
  const paydays = Array.isArray(settings.paydays)
    ? settings.paydays.map((payday) => ({ day: payday?.day, amount: payday?.amount }))
    : null;
  if (validatePaydays(paydays) !== null || !isValidISODate(raw.generatedThrough) || !Array.isArray(raw.entries)) {
    return null;
  }

  const sections = sanitizeSections(raw.sections);
  const sectionIds = new Set(sections.map((section) => section.id));
  const seen = new Set();
  const entries = [];
  for (const item of raw.entries) {
    const entry = sanitizeEntry(item, sectionIds);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return {
    version: STATE_VERSION,
    settings: { setupDone: true, paydays, carryOver: settings.carryOver !== false },
    generatedThrough: raw.generatedThrough,
    sections,
    plans: sanitizePlans(raw.plans, sectionIds),
    entries
  };
}

function droppedEntries(raw, state) {
  return (Array.isArray(raw?.entries) ? raw.entries.length : 0) - state.entries.length;
}

function setAside(storage, text) {
  try {
    storage.setItem(CORRUPT_KEY, text);
  } catch (error) {
    console.warn('Bozuk veri yedeklenemedi', error);
  }
}

export function discardSetAside(storage) {
  try {
    storage?.removeItem(CORRUPT_KEY);
  } catch (error) {
    console.warn('Kenara alınan veri silinemedi', error);
  }
}

// status: 'ok' | 'empty' | 'unavailable' | 'corrupt' (nothing usable) | 'repaired' (some
// entries were unreadable and skipped). In the last two cases the raw text is kept aside.
// needsSave: the stored copy is out of date (repaired or an older version) and should be rewritten.
export function loadState(storage) {
  if (!storage) {
    return { state: emptyState(), status: 'unavailable' };
  }
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Kayıtlı veri okunamadı', error);
    return { state: emptyState(), status: 'unavailable' };
  }
  if (text === null || text === undefined) {
    return { state: emptyState(), status: 'empty' };
  }

  let raw = null;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    console.warn('Kayıtlı veri JSON değil', error);
  }
  const state = raw === null ? null : sanitizeState(raw);
  if (!state) {
    setAside(storage, text);
    return { state: emptyState(), status: 'corrupt' };
  }
  const outdated = raw.version !== STATE_VERSION;
  if (outdated) {
    keepPreMigrationCopy(storage, text);
  }
  if (droppedEntries(raw, state) > 0) {
    setAside(storage, text);
    return { state, status: 'repaired', needsSave: true };
  }
  return { state, status: 'ok', needsSave: outdated };
}

function keepPreMigrationCopy(storage, text) {
  try {
    if (storage.getItem(PRE_MIGRATION_KEY) === null) {
      storage.setItem(PRE_MIGRATION_KEY, text);
    }
  } catch (error) {
    console.warn('Eski sürüm verisi saklanamadı', error);
  }
}

export function saveState(storage, state) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('Veri kaydedilemedi', error);
    return false;
  }
}

export function exportBackup(state, now = Date.now()) {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: new Date(now).toISOString(), data: state }, null, BACKUP_INDENT);
}

export function importBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dosya okunamadı: geçerli bir yedek dosyası değil.' };
  }
  const data = raw && typeof raw === 'object' && raw.app === BACKUP_APP ? raw.data : raw;
  const state = sanitizeState(data);
  if (!state) {
    return { ok: false, error: 'Bu dosya bir Harçlık yedeği gibi görünmüyor.' };
  }
  if (!state.settings.setupDone) {
    return { ok: false, error: 'Bu yedekte kayıtlı bir harçlık planı yok.' };
  }
  return { ok: true, state, skipped: droppedEntries(data, state) };
}
