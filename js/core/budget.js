import { ALLOWANCE_CATEGORY, EXTRA_INCOME_CATEGORY, KEYIF_CATEGORY, SECTION_COLORS, isReservedName } from './categories.js';
import { addDays, daysInMonth, makeISODate, parseISODate } from './dates.js';
import { MAX_AMOUNT } from './money.js';

export const STATE_VERSION = 2;
export const NOTE_MAX_LENGTH = 60;
export const SECTION_NAME_MAX_LENGTH = 24;
const MAX_SECTIONS = 12;
export const SETUP_SPENT_NOTE = 'Önceki harcamalar';
export const SETUP_LEFTOVER_NOTE = 'Önceki dönemden kalan';

export const MAX_PAYDAYS = 4;
// The keypad stops at MAX_AMOUNT; only the setup adjustment can exceed it, when several paydays
// fall on the same clamped day (29th, 30th and 31st in February).
export const MAX_ENTRY_AMOUNT = MAX_AMOUNT * MAX_PAYDAYS;
// A phone left in a drawer for years (or a clock that jumped) must not flood the list.
const MAX_CATCH_UP_MONTHS = 36;
// Enough months to always reach a payday, even for day 31 in a short month.
const PAYDAY_SEARCH_MONTHS = 2;

function compareDates(a, b) {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function sumAmounts(entries) {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthSpan(from, to) {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

function isAllowance(entry) {
  return entry.type === 'income' && entry.category === ALLOWANCE_CATEGORY;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeNote(note) {
  return note.trim().slice(0, NOTE_MAX_LENGTH);
}

export function createEntry({ type, amount, category, note = '', date }, now = Date.now()) {
  return { id: newId(), type, amount, category, note: normalizeNote(note), date, createdAt: now };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => compareDates(b.date, a.date) || b.createdAt - a.createdAt);
}

// A payday on the 31st lands on the last day of shorter months.
export function paydayDate(year, month, day) {
  return makeISODate(year, month, Math.min(day, daysInMonth(year, month)));
}

// Payday occurrences with after < date <= until, oldest first.
export function paydaysBetween(paydays, after, until) {
  if (until <= after) {
    return [];
  }
  const end = parseISODate(until);
  const start = parseISODate(after);
  const first = monthSpan(start, end) > MAX_CATCH_UP_MONTHS
    ? shiftMonth(end.year, end.month, -MAX_CATCH_UP_MONTHS)
    : start;
  const result = [];
  for (let offset = 0; offset <= monthSpan(first, end); offset += 1) {
    const { year, month } = shiftMonth(first.year, first.month, offset);
    for (const payday of paydays) {
      const date = paydayDate(year, month, payday.day);
      if (date > after && date <= until) {
        result.push({ date, amount: payday.amount });
      }
    }
  }
  return result.sort((a, b) => compareDates(a.date, b.date));
}

export function nextPaydayAfter(paydays, date) {
  const { year, month } = parseISODate(date);
  for (let offset = 0; offset <= PAYDAY_SEARCH_MONTHS; offset += 1) {
    const target = shiftMonth(year, month, offset);
    const dates = paydays
      .map((payday) => paydayDate(target.year, target.month, payday.day))
      .filter((candidate) => candidate > date)
      .sort(compareDates);
    if (dates.length > 0) {
      return dates[0];
    }
  }
  return null;
}

export function lastPaydayOnOrBefore(paydays, date) {
  const { year, month } = parseISODate(date);
  for (let offset = 0; offset <= PAYDAY_SEARCH_MONTHS; offset += 1) {
    const target = shiftMonth(year, month, -offset);
    const dates = paydays
      .map((payday) => paydayDate(target.year, target.month, payday.day))
      .filter((candidate) => candidate <= date)
      .sort(compareDates);
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
  }
  return null;
}

export function nextPayday(paydays, today) {
  const date = nextPaydayAfter(paydays, today);
  if (!date) {
    return null;
  }
  const amount = paydaysBetween(paydays, addDays(date, -1), date).reduce((total, payday) => total + payday.amount, 0);
  return { date, amount };
}

export function validatePaydays(paydays) {
  if (!Array.isArray(paydays) || paydays.length === 0) {
    return 'En az bir harçlık günü gerekli.';
  }
  if (paydays.length > MAX_PAYDAYS) {
    return `En fazla ${MAX_PAYDAYS} harçlık günü ekleyebilirsin.`;
  }
  for (const payday of paydays) {
    if (!Number.isInteger(payday?.day) || payday.day < 1 || payday.day > 31) {
      return 'Gün 1 ile 31 arasında olmalı.';
    }
    if (!Number.isSafeInteger(payday.amount) || payday.amount <= 0) {
      return 'Her iki harçlık için de bir tutar yaz.';
    }
    if (payday.amount > MAX_AMOUNT) {
      return 'Tutar çok büyük.';
    }
  }
  if (new Set(paydays.map((payday) => payday.day)).size !== paydays.length) {
    return 'Harçlık günleri birbirinden farklı olmalı.';
  }
  return null;
}

function copyPaydays(paydays) {
  return paydays.map(({ day, amount }) => ({ day, amount })).sort((a, b) => a.day - b.day);
}

export function normalizeSectionName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function nameKey(name) {
  return normalizeSectionName(name).toLocaleLowerCase('tr');
}

// `sections` is the catalog. Renaming a section to the name of an old section that is not in
// this plan would leave two sections with one name, and the old one's history could never be
// reattached by name again, so that is refused.
export function validatePlanRows(rows, sections = []) {
  if (rows.length > MAX_SECTIONS) {
    return `En fazla ${MAX_SECTIONS} bölüm ekleyebilirsin.`;
  }
  const idsInRows = new Set(rows.map((row) => row.id).filter(Boolean));
  const seen = new Set();
  for (const row of rows) {
    const name = normalizeSectionName(row.name);
    if (name === '') {
      return 'Her bölüme bir ad yaz.';
    }
    if (name.length > SECTION_NAME_MAX_LENGTH) {
      return `“${name}” çok uzun; en fazla ${SECTION_NAME_MAX_LENGTH} karakter olabilir.`;
    }
    if (isReservedName(name)) {
      return `“${name}” adı ayrılmış, başka bir ad seç.`;
    }
    if (!Number.isSafeInteger(row.amount) || row.amount < 0 || row.amount > MAX_AMOUNT) {
      return `${name} için geçerli bir tutar yaz (0 da olabilir).`;
    }
    const key = nameKey(name);
    if (seen.has(key)) {
      return `“${name}” iki kez yazılmış.`;
    }
    seen.add(key);
    const clash = row.id && sections.some((section) => section.id !== row.id && !idsInRows.has(section.id) && nameKey(section.name) === key);
    if (clash) {
      return `“${name}” adı eski bir bölümde kullanılmış; başka bir ad seç.`;
    }
  }
  return null;
}

// Saves the "gerekli" plan of the period starting at periodStart. Sections live in a catalog
// that is never pruned: renaming shows up in history too, and a section added again under the
// same name gets its old id back, so its earlier expenses count toward it again.
export function applyPlan(state, periodStart, rows) {
  const sections = [...state.sections];
  const claimed = new Map();
  const used = new Set();
  // Rows that came from an existing section keep it, whatever their position; only then are
  // new rows matched by name, so a new row can never steal a section another row is renaming.
  rows.forEach((row, index) => {
    const found = row.id ? sections.findIndex((section) => section.id === row.id) : -1;
    if (found >= 0 && !used.has(sections[found].id)) {
      claimed.set(index, found);
      used.add(sections[found].id);
    }
  });
  rows.forEach((row, index) => {
    if (claimed.has(index)) {
      return;
    }
    let found = sections.findIndex((section) => !used.has(section.id) && nameKey(section.name) === nameKey(row.name));
    if (found < 0) {
      sections.push({ id: `s-${newId()}`, name: normalizeSectionName(row.name), color: SECTION_COLORS[sections.length % SECTION_COLORS.length] });
      found = sections.length - 1;
    }
    claimed.set(index, found);
    used.add(sections[found].id);
  });

  const plan = {};
  rows.forEach((row, index) => {
    const position = claimed.get(index);
    const name = normalizeSectionName(row.name);
    if (sections[position].name !== name) {
      sections[position] = { ...sections[position], name };
    }
    plan[sections[position].id] = row.amount;
  });
  return { ...state, sections, plans: { ...state.plans, [periodStart]: plan } };
}

// A period uses the latest plan saved on or before its start, so a plan carries forward on its
// own and editing today's plan never rewrites earlier periods. A period older than every plan
// has none, except the one the first plan was saved in (its start can be pulled earlier by an
// entry dated before setup).
export function planFor(plans, period) {
  const keys = Object.keys(plans).sort(compareDates);
  const inherited = keys.filter((key) => key <= period.start).pop();
  if (inherited) {
    return plans[inherited];
  }
  const first = keys[0];
  return first && first <= period.end ? plans[first] : {};
}

// First launch: the user is usually mid-period, so we ask how much is left instead of
// making them reconstruct every past expense. The difference becomes one adjustable entry.
export function setupState({ paydays, carryOver = true, balance = null, planRows = [], today, now = Date.now() }) {
  const start = lastPaydayOnOrBefore(paydays, today);
  const due = paydaysBetween(paydays, addDays(start, -1), start);
  const entries = due.map(({ date, amount }) => createEntry({ type: 'income', amount, category: ALLOWANCE_CATEGORY, date }, now));
  const received = due.reduce((total, payday) => total + payday.amount, 0);

  if (balance !== null && balance !== received) {
    const difference = balance - received;
    entries.push(createEntry(
      difference < 0
        ? { type: 'expense', amount: -difference, category: KEYIF_CATEGORY, note: SETUP_SPENT_NOTE, date: start }
        : { type: 'income', amount: difference, category: EXTRA_INCOME_CATEGORY, note: SETUP_LEFTOVER_NOTE, date: start },
      now + 1
    ));
  }

  const state = {
    version: STATE_VERSION,
    settings: { setupDone: true, paydays: copyPaydays(paydays), carryOver },
    generatedThrough: today,
    sections: [],
    plans: {},
    entries
  };
  return planRows.length > 0 ? applyPlan(state, start, planRows) : state;
}

// Adds the allowance for every payday since the last visit. generatedThrough only moves
// forward, so a deleted allowance never comes back and plan changes never rewrite the past.
export function catchUpAllowances(state, today, now = Date.now()) {
  const from = state.generatedThrough;
  if (!state.settings.setupDone || !from || today === from) {
    return { state, added: 0 };
  }
  // The phone's date was once set ahead. Pull the marker back, or allowances would stall until
  // that future day; days that already got an allowance back then are skipped below.
  if (today < from) {
    return { state: { ...state, generatedThrough: today }, added: 0 };
  }
  const alreadyPaid = new Set(state.entries.filter(isAllowance).map((entry) => entry.date));
  const created = paydaysBetween(state.settings.paydays, from, today)
    .filter(({ date }) => !alreadyPaid.has(date))
    .map(({ date, amount }, index) => createEntry({ type: 'income', amount, category: ALLOWANCE_CATEGORY, date }, now + index));
  return {
    state: { ...state, generatedThrough: today, entries: [...state.entries, ...created] },
    added: created.length
  };
}

export function updatePaydays(state, paydays, today) {
  const { state: current } = catchUpAllowances(state, today);
  return { ...current, settings: { ...current.settings, paydays: copyPaydays(paydays) } };
}

// A period runs from one allowance to the day before the next. Allowance entries, not the
// plan, mark the boundaries, so editing a late allowance's date moves the boundary with it.
export function buildPeriods(state, today) {
  const { entries, settings } = state;
  const allowanceDates = [...new Set(entries.filter((entry) => isAllowance(entry) && entry.date <= today).map((entry) => entry.date))]
    .sort(compareDates);
  const earliest = entries.reduce((min, entry) => (entry.date < min ? entry.date : min), today);
  const starts = allowanceDates.length > 0 ? allowanceDates : [earliest];
  if (earliest < starts[0]) {
    starts[0] = earliest;
  }

  const next = nextPaydayAfter(settings.paydays, today);
  const lastEnd = next ? addDays(next, -1) : today;
  const buckets = starts.map(() => []);
  for (const entry of entries) {
    let index = starts.length - 1;
    while (index > 0 && entry.date < starts[index]) {
      index -= 1;
    }
    buckets[index].push(entry);
  }

  let carry = 0;
  return starts.map((start, index) => {
    const isCurrent = index === starts.length - 1;
    const own = sortEntries(buckets[index]);
    const income = sumAmounts(own.filter((entry) => entry.type === 'income'));
    const spent = sumAmounts(own.filter((entry) => entry.type === 'expense'));
    const carryIn = settings.carryOver ? carry : 0;
    const balance = carryIn + income - spent;
    carry = balance;
    return {
      start,
      end: isCurrent ? lastEnd : addDays(starts[index + 1], -1),
      entries: own,
      income,
      spent,
      carryIn,
      balance,
      isCurrent,
      hasAllowance: own.some(isAllowance)
    };
  });
}

// "Keyif" is whatever is left once every planned section has its money set aside. A section
// that runs over its plan eats into keyif; spending on a section that is not in this period's
// plan counts as keyif spending.
export function periodBudget(period, plan, sections) {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const spentBy = new Map();
  for (const entry of period.entries) {
    if (entry.type === 'expense') {
      spentBy.set(entry.category, (spentBy.get(entry.category) ?? 0) + entry.amount);
    }
  }
  const planned = Object.entries(plan)
    .filter(([id]) => byId.has(id))
    .map(([id, amount]) => ({ ...byId.get(id), planned: amount, spent: spentBy.get(id) ?? 0 }));
  const plannedIds = new Set(planned.map((section) => section.id));

  let keyifSpent = 0;
  for (const [id, amount] of spentBy) {
    if (!plannedIds.has(id)) {
      keyifSpent += amount;
    }
  }
  const available = period.carryIn + period.income;
  const plannedTotal = planned.reduce((total, section) => total + section.planned, 0);
  const stillReserved = planned.reduce((total, section) => total + Math.max(0, section.planned - section.spent), 0);
  const overrun = planned.reduce((total, section) => total + Math.max(0, section.spent - section.planned), 0);

  return {
    sections: planned,
    available,
    plannedTotal,
    keyifBudget: available - plannedTotal,
    keyifSpent,
    keyifLeft: period.balance - stillReserved,
    overrun
  };
}

export function groupByDay(entries) {
  const groups = [];
  for (const entry of sortEntries(entries)) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== entry.date) {
      group = { date: entry.date, entries: [], spent: 0 };
      groups.push(group);
    }
    group.entries.push(entry);
    if (entry.type === 'expense') {
      group.spent += entry.amount;
    }
  }
  return groups;
}

export function lastExpenseCategory(entries) {
  let latest = null;
  for (const entry of entries) {
    if (entry.type === 'expense' && entry.note !== SETUP_SPENT_NOTE && (!latest || entry.createdAt > latest.createdAt)) {
      latest = entry;
    }
  }
  return latest?.category ?? KEYIF_CATEGORY;
}
