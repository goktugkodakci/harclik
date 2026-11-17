import { MAX_ENTRY_AMOUNT, NOTE_MAX_LENGTH, STATE_VERSION, validatePaydays } from './budget.js';
import { fallbackCategory, isKnownCategory } from './categories.js';
import { isValidISODate } from './dates.js';

export const STORAGE_KEY = 'harclik.v1';
// Unreadable data is set aside here instead of being overwritten by a fresh start.
export const CORRUPT_KEY = 'harclik.v1.bozuk';
const BACKUP_APP = 'harclik';
const BACKUP_INDENT = 2;

export function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { setupDone: false, paydays: [{ day: 1, amount: 0 }, { day: 15, amount: 0 }], carryOver: true },
    generatedThrough: null,
    entries: []
  };
}

function sanitizeEntry(raw) {
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
    category: isKnownCategory(type, category) ? category : fallbackCategory(type),
    note: typeof note === 'string' ? note.slice(0, NOTE_MAX_LENGTH) : '',
    date,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0
  };
}

// Returns a clean state, or null when the data cannot be trusted at all.
export function sanitizeState(raw) {
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

  const seen = new Set();
  const entries = [];
  for (const item of raw.entries) {
    const entry = sanitizeEntry(item);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return {
    version: STATE_VERSION,
    settings: { setupDone: true, paydays, carryOver: settings.carryOver !== false },
    generatedThrough: raw.generatedThrough,
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
  if (droppedEntries(raw, state) > 0) {
    setAside(storage, text);
    return { state, status: 'repaired' };
  }
  return { state, status: 'ok' };
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
