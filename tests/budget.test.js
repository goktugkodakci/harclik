import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_LEFTOVER_NOTE,
  SETUP_SPENT_NOTE,
  buildPeriods,
  catchUpAllowances,
  categoryBreakdown,
  createEntry,
  groupByDay,
  lastExpenseCategory,
  lastPaydayOnOrBefore,
  nextPaydayAfter,
  paydayDate,
  paydaysBetween,
  setupState,
  todayStatus,
  updatePlan,
  validatePaydays
} from '../js/core/budget.js';

const PLAN = [{ day: 1, amount: 300000 }, { day: 15, amount: 300000 }];

let sequence = 0;
function entry(type, amount, date, category = type === 'expense' ? 'yemek' : 'harclik', note = '') {
  sequence += 1;
  return { id: `t${sequence}`, type, amount, category, note, date, createdAt: sequence };
}

function stateWith(entries, { carryOver = true, paydays = PLAN, generatedThrough = '2026-11-16' } = {}) {
  return { version: 1, settings: { setupDone: true, paydays, carryOver }, generatedThrough, entries };
}

function dates(list) {
  return list.map((item) => item.date);
}

test('paydayDate ayda olmayan günü ayın son gününe kaydırır', () => {
  assert.equal(paydayDate(2026, 2, 31), '2026-02-28');
  assert.equal(paydayDate(2028, 2, 30), '2028-02-29');
  assert.equal(paydayDate(2026, 11, 31), '2026-11-30');
  assert.equal(paydayDate(2026, 12, 31), '2026-12-31');
});

test('paydaysBetween başlangıcı dışarıda, bitişi içeride sayar ve yılı geçer', () => {
  assert.deepEqual(dates(paydaysBetween(PLAN, '2026-11-16', '2027-01-15')), [
    '2026-12-01', '2026-12-15', '2027-01-01', '2027-01-15'
  ]);
  assert.deepEqual(paydaysBetween(PLAN, '2026-11-15', '2026-11-15'), []);
  assert.deepEqual(paydaysBetween(PLAN, '2026-11-14', '2026-11-15'), [{ date: '2026-11-15', amount: 300000 }]);
});

test('paydaysBetween ayın 31i planını kısa aylarda da üretir', () => {
  const plan = [{ day: 31, amount: 100 }, { day: 15, amount: 100 }];
  assert.deepEqual(dates(paydaysBetween(plan, '2026-01-31', '2026-04-30')), [
    '2026-02-15', '2026-02-28', '2026-03-15', '2026-03-31', '2026-04-15', '2026-04-30'
  ]);
});

test('nextPaydayAfter bir sonraki harçlık gününü bulur', () => {
  assert.equal(nextPaydayAfter(PLAN, '2026-11-16'), '2026-12-01');
  assert.equal(nextPaydayAfter(PLAN, '2026-11-14'), '2026-11-15');
  assert.equal(nextPaydayAfter(PLAN, '2026-11-15'), '2026-12-01');
  assert.equal(nextPaydayAfter(PLAN, '2026-12-20'), '2027-01-01');
  assert.equal(nextPaydayAfter([{ day: 31, amount: 1 }, { day: 15, amount: 1 }], '2026-02-16'), '2026-02-28');
});

test('lastPaydayOnOrBefore geriye doğru en yakın harçlık gününü bulur', () => {
  assert.equal(lastPaydayOnOrBefore(PLAN, '2026-11-16'), '2026-11-15');
  assert.equal(lastPaydayOnOrBefore(PLAN, '2026-11-15'), '2026-11-15');
  assert.equal(lastPaydayOnOrBefore(PLAN, '2027-01-01'), '2027-01-01');
  assert.equal(lastPaydayOnOrBefore([{ day: 10, amount: 1 }, { day: 25, amount: 1 }], '2026-11-05'), '2026-10-25');
});

test('setupState dönem ortasında elde kalanı tek düzeltme kaydıyla kurar', () => {
  const state = setupState({ paydays: PLAN, balance: 250000, today: '2026-11-16' });
  assert.equal(state.settings.setupDone, true);
  assert.equal(state.generatedThrough, '2026-11-16');
  assert.equal(state.entries.length, 2);
  const [allowance, spent] = state.entries;
  assert.deepEqual(
    { type: allowance.type, amount: allowance.amount, category: allowance.category, date: allowance.date },
    { type: 'income', amount: 300000, category: 'harclik', date: '2026-11-15' }
  );
  assert.deepEqual(
    { type: spent.type, amount: spent.amount, category: spent.category, note: spent.note, date: spent.date },
    { type: 'expense', amount: 50000, category: 'diger', note: SETUP_SPENT_NOTE, date: '2026-11-15' }
  );
});

test('setupState boş bakiyede sadece harçlığı, fazlasında ek geliri yazar', () => {
  assert.equal(setupState({ paydays: PLAN, balance: null, today: '2026-11-16' }).entries.length, 1);
  assert.equal(setupState({ paydays: PLAN, balance: 300000, today: '2026-11-16' }).entries.length, 1);
  const extra = setupState({ paydays: PLAN, balance: 350000, today: '2026-11-16' }).entries[1];
  assert.equal(extra.type, 'income');
  assert.equal(extra.category, 'ek');
  assert.equal(extra.amount, 50000);
  assert.equal(extra.note, SETUP_LEFTOVER_NOTE);
});

test('catchUpAllowances uzun aradan sonra eksiksiz ve tekrarsız üretir', () => {
  const first = catchUpAllowances(stateWith([]), '2027-02-02');
  assert.equal(first.added, 5);
  assert.deepEqual(dates(first.state.entries), ['2026-12-01', '2026-12-15', '2027-01-01', '2027-01-15', '2027-02-01']);
  assert.equal(first.state.generatedThrough, '2027-02-02');

  const again = catchUpAllowances(first.state, '2027-02-02');
  assert.equal(again.added, 0);
  assert.equal(again.state, first.state);
});

test('catchUpAllowances silinen harçlığı geri getirmez', () => {
  const { state } = catchUpAllowances(stateWith([]), '2026-12-02');
  const withoutDecember = { ...state, entries: state.entries.filter((item) => item.date !== '2026-12-01') };
  const later = catchUpAllowances(withoutDecember, '2026-12-03');
  assert.equal(later.added, 0);
  assert.deepEqual(later.state.entries, []);
});

test('catchUpAllowances yıllar sonra açılınca en fazla son 36 ayı üretir', () => {
  const { state, added } = catchUpAllowances(stateWith([], { generatedThrough: '2020-01-01' }), '2026-11-16');
  assert.equal(added, 74);
  assert.equal(state.entries[0].date, '2023-11-01');
  assert.equal(state.entries[state.entries.length - 1].date, '2026-11-15');
});

test('catchUpAllowances ileri alınmış saatten sonra takılmaz ve çift kayıt üretmez', () => {
  const fromTheFuture = stateWith([entry('income', 300000, '2026-12-01')], { generatedThrough: '2027-03-01' });
  const pulledBack = catchUpAllowances(fromTheFuture, '2026-11-20');
  assert.equal(pulledBack.added, 0);
  assert.equal(pulledBack.state.generatedThrough, '2026-11-20');

  const later = catchUpAllowances(pulledBack.state, '2026-12-16');
  assert.equal(later.added, 1);
  assert.deepEqual(dates(later.state.entries), ['2026-12-01', '2026-12-15']);
});

test('catchUpAllowances kurulum bitmeden bir şey yapmaz', () => {
  const state = { ...stateWith([]), settings: { ...stateWith([]).settings, setupDone: false } };
  assert.equal(catchUpAllowances(state, '2027-01-01').state, state);
});

test('updatePlan sadece gelecekteki harçlıkları etkiler', () => {
  const changed = updatePlan(stateWith([]), [{ day: 1, amount: 300000 }, { day: 18, amount: 250000 }], '2026-11-20');
  assert.deepEqual(changed.entries, []);
  assert.equal(changed.generatedThrough, '2026-11-20');

  const later = catchUpAllowances(changed, '2026-12-19');
  assert.deepEqual(later.state.entries.map((item) => [item.date, item.amount]), [
    ['2026-12-01', 300000],
    ['2026-12-18', 250000]
  ]);
});

test('buildPeriods dönemleri harçlıklardan çıkarır ve devri taşır', () => {
  const entries = [
    entry('income', 300000, '2026-11-01'),
    entry('expense', 100000, '2026-11-05'),
    entry('income', 300000, '2026-11-15'),
    entry('expense', 20000, '2026-11-16')
  ];
  const periods = buildPeriods(stateWith(entries), '2026-11-16');
  assert.equal(periods.length, 2);
  assert.deepEqual(
    periods.map(({ start, end, income, spent, carryIn, balance, isCurrent }) => ({ start, end, income, spent, carryIn, balance, isCurrent })),
    [
      { start: '2026-11-01', end: '2026-11-14', income: 300000, spent: 100000, carryIn: 0, balance: 200000, isCurrent: false },
      { start: '2026-11-15', end: '2026-11-30', income: 300000, spent: 20000, carryIn: 200000, balance: 480000, isCurrent: true }
    ]
  );

  const noCarry = buildPeriods(stateWith(entries, { carryOver: false }), '2026-11-16');
  assert.equal(noCarry[1].carryIn, 0);
  assert.equal(noCarry[1].balance, 280000);
});

test('buildPeriods eksi bakiyeyi de sonraki döneme taşır', () => {
  const entries = [
    entry('income', 300000, '2026-11-01'),
    entry('expense', 350000, '2026-11-10'),
    entry('income', 300000, '2026-11-15')
  ];
  const [, current] = buildPeriods(stateWith(entries), '2026-11-16');
  assert.equal(current.carryIn, -50000);
  assert.equal(current.balance, 250000);
});

test('buildPeriods silinen harçlıkta iki dönemi birleştirir', () => {
  const entries = [entry('income', 300000, '2026-11-01'), entry('expense', 5000, '2026-11-18')];
  const periods = buildPeriods(stateWith(entries), '2026-11-20');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].start, '2026-11-01');
  assert.equal(periods[0].end, '2026-11-30');
});

test('buildPeriods harçlık yokken tek açık dönem verir', () => {
  const periods = buildPeriods(stateWith([entry('expense', 5000, '2026-11-10')]), '2026-11-16');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].start, '2026-11-10');
  assert.equal(periods[0].end, '2026-11-30');
  assert.equal(periods[0].hasAllowance, false);
  assert.equal(periods[0].balance, -5000);

  const empty = buildPeriods(stateWith([]), '2026-11-16');
  assert.equal(empty[0].start, '2026-11-16');
  assert.equal(empty[0].entries.length, 0);
});

test('buildPeriods ilk harçlıktan önceki kaydı ilk döneme katar', () => {
  const entries = [entry('expense', 5000, '2026-11-10'), entry('income', 300000, '2026-11-15')];
  const periods = buildPeriods(stateWith(entries), '2026-11-16');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].start, '2026-11-10');
  assert.equal(periods[0].balance, 295000);
  assert.equal(periods[0].hasAllowance, true);
});

function currentPeriod(entries, today) {
  const periods = buildPeriods(stateWith(entries), today);
  return periods[periods.length - 1];
}

test('todayStatus günlük limiti kalan güne böler ve liraya yuvarlar', () => {
  const period = currentPeriod([
    entry('income', 300000, '2026-11-01'),
    entry('expense', 100000, '2026-11-05'),
    entry('income', 300000, '2026-11-15'),
    entry('expense', 20000, '2026-11-16')
  ], '2026-11-16');
  const status = todayStatus(period, '2026-11-16');
  assert.equal(status.daysLeft, 15);
  assert.equal(status.totalDays, 16);
  assert.equal(status.elapsedDays, 2);
  assert.equal(status.spentToday, 20000);
  assert.equal(status.dailyLimit, 33300);
  assert.equal(status.leftToday, 13300);
  assert.equal(status.tomorrowLimit, 34200);
  assert.equal(status.pace, 'ok');
});

test('todayStatus bugünkü harcama bugünkü limiti küçültmez', () => {
  const base = [entry('income', 300000, '2026-11-15')];
  const before = todayStatus(currentPeriod(base, '2026-11-16'), '2026-11-16');
  const after = todayStatus(currentPeriod([...base, entry('expense', 50000, '2026-11-16')], '2026-11-16'), '2026-11-16');
  assert.equal(after.dailyLimit, before.dailyLimit);
  assert.equal(after.leftToday, before.dailyLimit - 50000);
});

test('todayStatus limit aşılınca yarının günlük tutarını verir', () => {
  const period = currentPeriod([entry('income', 300000, '2026-11-15'), entry('expense', 40000, '2026-11-16')], '2026-11-16');
  const status = todayStatus(period, '2026-11-16');
  assert.equal(status.dailyLimit, 20000);
  assert.equal(status.leftToday, -20000);
  assert.equal(status.tomorrowLimit, 18500);
  assert.equal(status.pace, 'fast');
});

test('todayStatus dönemin son günü kalanın tamamını verir', () => {
  const period = currentPeriod([entry('income', 300000, '2026-11-15'), entry('expense', 295450, '2026-11-20')], '2026-11-30');
  const status = todayStatus(period, '2026-11-30');
  assert.equal(status.daysLeft, 1);
  assert.equal(status.dailyLimit, 4550);
  assert.equal(status.tomorrowLimit, null);
});

test('todayStatus eksi bakiyede limiti sıfırlar', () => {
  const period = currentPeriod([entry('income', 300000, '2026-11-15'), entry('expense', 305000, '2026-11-16')], '2026-11-17');
  const status = todayStatus(period, '2026-11-17');
  assert.equal(status.dailyLimit, 0);
  assert.equal(status.leftToday, 0);
  assert.equal(status.tomorrowLimit, 0);
  assert.equal(status.pace, 'over');
});

test('categoryBreakdown büyükten küçüğe sıralar ve payları verir', () => {
  const breakdown = categoryBreakdown([
    entry('expense', 3000, '2026-11-16', 'kahve'),
    entry('expense', 6000, '2026-11-16', 'yemek'),
    entry('expense', 1000, '2026-11-17', 'kahve'),
    entry('income', 9999, '2026-11-17')
  ]);
  assert.deepEqual(breakdown, [
    { category: 'yemek', amount: 6000, share: 0.6 },
    { category: 'kahve', amount: 4000, share: 0.4 }
  ]);
});

test('groupByDay yeni günü üste, gün içinde son ekleneni üste koyar', () => {
  const morning = entry('expense', 1000, '2026-11-16');
  const evening = entry('expense', 2000, '2026-11-16');
  const today = entry('expense', 500, '2026-11-17');
  const groups = groupByDay([morning, today, evening]);
  assert.deepEqual(groups.map((group) => [group.date, group.spent]), [['2026-11-17', 500], ['2026-11-16', 3000]]);
  assert.deepEqual(groups[1].entries, [evening, morning]);
});

test('lastExpenseCategory son eklenen harcamanın kategorisini hatırlar', () => {
  assert.equal(lastExpenseCategory([]), 'yemek');
  assert.equal(lastExpenseCategory([entry('expense', 1, '2026-11-16', 'kahve'), entry('expense', 1, '2026-11-01', 'ulasim')]), 'ulasim');
  assert.equal(lastExpenseCategory([entry('expense', 1, '2026-11-15', 'diger', SETUP_SPENT_NOTE)]), 'yemek');
});

test('createEntry notu kırpar ve sınırlar', () => {
  const created = createEntry({ type: 'expense', amount: 100, category: 'yemek', note: `  ${'a'.repeat(80)}  `, date: '2026-11-16' }, 5);
  assert.equal(created.note.length, 60);
  assert.equal(created.createdAt, 5);
  assert.equal(typeof created.id, 'string');
});

test('validatePaydays anlaşılır hata verir', () => {
  assert.equal(validatePaydays(PLAN), null);
  assert.match(validatePaydays([{ day: 15, amount: 1 }, { day: 15, amount: 1 }]), /farklı/);
  assert.match(validatePaydays([{ day: 0, amount: 1 }, { day: 15, amount: 1 }]), /1 ile 31/);
  assert.match(validatePaydays([{ day: 1, amount: 0 }, { day: 15, amount: 1 }]), /tutar/);
  assert.match(validatePaydays([PLAN[0]]), /İki/);
});
