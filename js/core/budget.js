import { ALLOWANCE_CATEGORY, DEFAULT_EXPENSE_CATEGORY, EXTRA_INCOME_CATEGORY, FALLBACK_EXPENSE_CATEGORY } from './categories.js';
import { addDays, daysInMonth, diffDays, makeISODate, parseISODate } from './dates.js';
import { KURUS_PER_LIRA, MAX_AMOUNT } from './money.js';

export const STATE_VERSION = 1;
export const NOTE_MAX_LENGTH = 60;
export const SETUP_SPENT_NOTE = 'Önceki harcamalar';
export const SETUP_LEFTOVER_NOTE = 'Önceki dönemden kalan';

const PAYDAY_COUNT = 2;
// The keypad stops at MAX_AMOUNT; only the setup adjustment can exceed it, when two paydays
// fall on the same clamped day (30th and 31st in February).
export const MAX_ENTRY_AMOUNT = MAX_AMOUNT * PAYDAY_COUNT;
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

function floorToLira(kurus) {
  return Math.floor(kurus / KURUS_PER_LIRA) * KURUS_PER_LIRA;
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

export function validatePaydays(paydays) {
  if (!Array.isArray(paydays) || paydays.length !== PAYDAY_COUNT) {
    return 'İki harçlık günü gerekli.';
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
  if (paydays[0].day === paydays[1].day) {
    return 'İki harçlık günü farklı olmalı.';
  }
  return null;
}

function copyPaydays(paydays) {
  return paydays.map(({ day, amount }) => ({ day, amount }));
}

// First launch: the user is usually mid-period, so we ask how much is left instead of
// making them reconstruct every past expense. The difference becomes one adjustable entry.
export function setupState({ paydays, carryOver = true, balance = null, today, now = Date.now() }) {
  const start = lastPaydayOnOrBefore(paydays, today);
  const due = paydaysBetween(paydays, addDays(start, -1), start);
  const entries = due.map(({ date, amount }) => createEntry({ type: 'income', amount, category: ALLOWANCE_CATEGORY, date }, now));
  const received = due.reduce((total, payday) => total + payday.amount, 0);

  if (balance !== null && balance !== received) {
    const difference = balance - received;
    entries.push(createEntry(
      difference < 0
        ? { type: 'expense', amount: -difference, category: FALLBACK_EXPENSE_CATEGORY, note: SETUP_SPENT_NOTE, date: start }
        : { type: 'income', amount: difference, category: EXTRA_INCOME_CATEGORY, note: SETUP_LEFTOVER_NOTE, date: start },
      now + 1
    ));
  }

  return {
    version: STATE_VERSION,
    settings: { setupDone: true, paydays: copyPaydays(paydays), carryOver },
    generatedThrough: today,
    entries
  };
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

export function updatePlan(state, paydays, today) {
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

export function todayStatus(period, today) {
  const totalDays = diffDays(period.end, period.start) + 1;
  const daysLeft = Math.max(1, diffDays(period.end, today) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(1, diffDays(today, period.start) + 1));
  const spentToday = sumAmounts(period.entries.filter((entry) => entry.type === 'expense' && entry.date === today));

  // Today's limit is fixed at the start of the day: spending today lowers what is left
  // today, not the limit itself. Otherwise every purchase would quietly move the goalpost.
  const startOfToday = period.balance + spentToday;
  const dailyLimit = daysLeft === 1
    ? Math.max(0, startOfToday)
    : Math.max(0, floorToLira(startOfToday / daysLeft));
  const tomorrowLimit = daysLeft > 1 ? Math.max(0, floorToLira(period.balance / (daysLeft - 1))) : null;

  const budget = period.carryIn + period.income;
  let spentShare = 0;
  if (budget > 0) {
    spentShare = period.spent / budget;
  } else if (period.spent > 0) {
    spentShare = 1;
  }
  const timeShare = elapsedDays / totalDays;
  let pace = 'ok';
  if (period.balance < 0) {
    pace = 'over';
  } else if (spentShare > timeShare) {
    pace = 'fast';
  }

  return {
    totalDays,
    daysLeft,
    elapsedDays,
    spentToday,
    dailyLimit,
    leftToday: dailyLimit - spentToday,
    tomorrowLimit,
    budget,
    spentShare,
    timeShare,
    pace
  };
}

export function categoryBreakdown(entries) {
  const totals = new Map();
  for (const entry of entries) {
    if (entry.type === 'expense') {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
    }
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals]
    .map(([category, amount]) => ({ category, amount, share: amount / total }))
    .sort((a, b) => b.amount - a.amount);
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
  return latest?.category ?? DEFAULT_EXPENSE_CATEGORY;
}
