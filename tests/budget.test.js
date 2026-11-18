import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_LEFTOVER_NOTE,
  SETUP_SPENT_NOTE,
  applyPlan,
  buildPeriods,
  catchUpAllowances,
  createEntry,
  groupByDay,
  lastExpenseCategory,
  lastPaydayOnOrBefore,
  nextPayday,
  nextPaydayAfter,
  paydayDate,
  paydaysBetween,
  periodBudget,
  planFor,
  setupState,
  updatePaydays,
  validatePaydays,
  validatePlanRows
} from '../js/core/budget.js';

const PLAN = [{ day: 1, amount: 300000 }, { day: 15, amount: 300000 }];

let sequence = 0;
function entry(type, amount, date, category = type === 'expense' ? 'keyif' : 'harclik', note = '') {
  sequence += 1;
  return { id: `t${sequence}`, type, amount, category, note, date, createdAt: sequence };
}

function stateWith(entries, { carryOver = true, paydays = PLAN, generatedThrough = '2026-11-16', sections = [], plans = {} } = {}) {
  return { version: 2, settings: { setupDone: true, paydays, carryOver }, generatedThrough, sections, plans, entries };
}

function dates(list) {
  return list.map((item) => item.date);
}

const YEMEK = { id: 'yemek', name: 'Yemek', color: '#D9734E' };
const ULASIM = { id: 'ulasim', name: 'Ulaşım', color: '#3B82C4' };

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

test('setupState dönem ortasında elde kalanı tek keyif kaydıyla kurar', () => {
  const state = setupState({ paydays: PLAN, balance: 250000, today: '2026-11-16' });
  assert.equal(state.version, 2);
  assert.equal(state.settings.setupDone, true);
  assert.equal(state.generatedThrough, '2026-11-16');
  assert.deepEqual(state.sections, []);
  assert.deepEqual(state.plans, {});
  assert.equal(state.entries.length, 2);
  const [allowance, spent] = state.entries;
  assert.deepEqual(
    { type: allowance.type, amount: allowance.amount, category: allowance.category, date: allowance.date },
    { type: 'income', amount: 300000, category: 'harclik', date: '2026-11-15' }
  );
  assert.deepEqual(
    { type: spent.type, amount: spent.amount, category: spent.category, note: spent.note, date: spent.date },
    { type: 'expense', amount: 50000, category: 'keyif', note: SETUP_SPENT_NOTE, date: '2026-11-15' }
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

test('setupState gerekli bölümleri ilk dönemin planı olarak kaydeder', () => {
  const state = setupState({
    paydays: PLAN,
    today: '2026-11-16',
    planRows: [{ name: 'Yemek', amount: 120000 }, { name: 'Ulaşım', amount: 30000 }]
  });
  assert.deepEqual(state.sections.map((section) => section.name), ['Yemek', 'Ulaşım']);
  const plan = state.plans['2026-11-15'];
  assert.deepEqual(Object.values(plan), [120000, 30000]);
  assert.deepEqual(Object.keys(plan), state.sections.map((section) => section.id));
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

test('updatePaydays sadece gelecekteki harçlıkları etkiler', () => {
  const changed = updatePaydays(stateWith([]), [{ day: 1, amount: 300000 }, { day: 18, amount: 250000 }], '2026-11-20');
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
});

test('buildPeriods ilk harçlıktan önceki kaydı ilk döneme katar', () => {
  const entries = [entry('expense', 5000, '2026-11-10'), entry('income', 300000, '2026-11-15')];
  const periods = buildPeriods(stateWith(entries), '2026-11-16');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].start, '2026-11-10');
  assert.equal(periods[0].balance, 295000);
});

function span(start, end) {
  return { start, end };
}

test('planFor dönem başlangıcına eşit ya da önceki en son planı seçer', () => {
  const plans = { '2026-11-01': { yemek: 1 }, '2026-11-15': { yemek: 2 }, '2026-12-15': { yemek: 3 } };
  assert.deepEqual(planFor(plans, span('2026-11-15', '2026-11-30')), { yemek: 2 });
  assert.deepEqual(planFor(plans, span('2026-12-01', '2026-12-14')), { yemek: 2 });
  assert.deepEqual(planFor(plans, span('2026-11-17', '2026-11-30')), { yemek: 2 });
  assert.deepEqual(planFor({}, span('2026-11-15', '2026-11-30')), {});
});

test('planFor ilk plandan önceki dönemlere planı geriye dönük uygulamaz', () => {
  const plans = { '2026-11-15': { yemek: 2 } };
  assert.deepEqual(planFor(plans, span('2026-11-01', '2026-11-14')), {});
  // Kurulumdan önceye tarihli bir kayıt ilk dönemi geriye uzatır; plan o dönemin içinde kalır.
  assert.deepEqual(planFor(plans, span('2026-11-10', '2026-11-30')), { yemek: 2 });
});

function currentPeriod(entries, today, options = {}) {
  const periods = buildPeriods(stateWith(entries, options), today);
  return periods[periods.length - 1];
}

test('periodBudget gerekli bölümleri harçlıktan düşüp keyif parasını verir', () => {
  const period = currentPeriod([
    entry('income', 300000, '2026-11-15'),
    entry('expense', 80000, '2026-11-15', 'yemek'),
    entry('expense', 30000, '2026-11-16', 'ulasim'),
    entry('expense', 20000, '2026-11-16', 'keyif')
  ], '2026-11-16');
  const budget = periodBudget(period, { yemek: 120000, ulasim: 30000 }, [YEMEK, ULASIM]);
  assert.equal(budget.available, 300000);
  assert.equal(budget.plannedTotal, 150000);
  assert.equal(budget.keyifBudget, 150000);
  assert.equal(budget.keyifSpent, 20000);
  assert.equal(budget.keyifLeft, 130000);
  assert.equal(budget.overrun, 0);
  assert.deepEqual(budget.sections.map(({ id, planned, spent }) => [id, planned, spent]), [
    ['yemek', 120000, 80000],
    ['ulasim', 30000, 30000]
  ]);
});

test('periodBudget bölüm planı aşılınca farkı keyiften düşer', () => {
  const period = currentPeriod([
    entry('income', 300000, '2026-11-15'),
    entry('expense', 150000, '2026-11-16', 'yemek')
  ], '2026-11-16');
  const budget = periodBudget(period, { yemek: 120000 }, [YEMEK]);
  assert.equal(budget.overrun, 30000);
  assert.equal(budget.keyifBudget, 180000);
  assert.equal(budget.keyifLeft, 150000);
});

test('periodBudget plansız bölüme yapılan harcamayı keyiften sayar', () => {
  const period = currentPeriod([
    entry('income', 300000, '2026-11-15'),
    entry('expense', 10000, '2026-11-16', 'ulasim')
  ], '2026-11-16');
  const budget = periodBudget(period, { yemek: 120000 }, [YEMEK, ULASIM]);
  assert.equal(budget.keyifSpent, 10000);
  assert.equal(budget.keyifLeft, 170000);
  assert.deepEqual(budget.sections.map((section) => section.id), ['yemek']);
});

test('periodBudget devri ve plan sırasını korur, katalogda olmayanı atlar', () => {
  const period = currentPeriod([
    entry('income', 300000, '2026-11-01'),
    entry('expense', 250000, '2026-11-05'),
    entry('income', 300000, '2026-11-15')
  ], '2026-11-16');
  const budget = periodBudget(period, { ulasim: 30000, yemek: 120000, silinmis: 5000 }, [YEMEK, ULASIM]);
  assert.equal(budget.available, 350000);
  assert.equal(budget.keyifLeft, 200000);
  assert.deepEqual(budget.sections.map((section) => section.id), ['ulasim', 'yemek']);
});

test('periodBudget plan parayı aşarsa keyif bütçesi eksiye düşer', () => {
  const period = currentPeriod([entry('income', 100000, '2026-11-15')], '2026-11-16');
  const budget = periodBudget(period, { yemek: 120000 }, [YEMEK]);
  assert.equal(budget.keyifBudget, -20000);
  assert.equal(budget.keyifLeft, -20000);
});

test('validatePlanRows anlaşılır hata verir', () => {
  assert.equal(validatePlanRows([{ name: 'Yemek', amount: 120000 }, { name: 'Ulaşım', amount: 0 }]), null);
  assert.match(validatePlanRows([{ name: '  ', amount: 1 }]), /ad yaz/);
  assert.match(validatePlanRows([{ name: 'Yemek', amount: 1 }, { name: 'yemek ', amount: 2 }]), /iki kez/);
  assert.match(validatePlanRows([{ name: 'KEYİF', amount: 1 }]), /ayrılmış/);
  assert.match(validatePlanRows([{ name: 'Yemek', amount: null }]), /Yemek için geçerli bir tutar/);
  assert.match(validatePlanRows([{ name: 'a'.repeat(25), amount: 1 }]), /uzun/);
  assert.match(validatePlanRows(Array.from({ length: 13 }, (_, i) => ({ name: `B${i}`, amount: 1 }))), /12/);
});

test('applyPlan yeni bölüm açar, yeniden adlandırır ve aynı adı eski bölüme bağlar', () => {
  const base = stateWith([], { sections: [YEMEK, ULASIM], plans: { '2026-11-01': { yemek: 100000 } } });
  const next = applyPlan(base, '2026-11-15', [
    { id: 'yemek', name: 'Yemek & market', amount: 130000 },
    { name: ' ulaşım ', amount: 30000 },
    { name: 'Telefon', amount: 15000 }
  ]);
  assert.deepEqual(next.plans['2026-11-01'], { yemek: 100000 });
  assert.equal(next.sections.find((section) => section.id === 'yemek').name, 'Yemek & market');
  assert.equal(next.sections.length, 3);
  const telefon = next.sections[2];
  assert.equal(telefon.name, 'Telefon');
  assert.match(telefon.color, /^#[0-9A-F]{6}$/i);
  assert.deepEqual(next.plans['2026-11-15'], { yemek: 130000, ulasim: 30000, [telefon.id]: 15000 });
});

test('applyPlan önce kimliği olan satırları çözer, sıra sonucu değiştirmez', () => {
  const base = stateWith([], { sections: [YEMEK], plans: {} });
  const next = applyPlan(base, '2026-11-15', [
    { name: 'Yemek', amount: 5 },
    { id: 'yemek', name: 'Market', amount: 7 }
  ]);
  assert.equal(next.sections.length, 2);
  assert.equal(next.sections[0].name, 'Market');
  const created = next.sections[1];
  assert.deepEqual(next.plans['2026-11-15'], { [created.id]: 5, yemek: 7 });
});

test('validatePlanRows plan dışındaki eski bir bölümün adına yeniden adlandırmayı reddeder', () => {
  const sections = [YEMEK, { id: 'kahve', name: 'Kahve', color: '#9C6B43' }];
  assert.match(validatePlanRows([{ id: 'yemek', name: 'kahve', amount: 1 }], sections), /eski bir bölümde/);
  assert.equal(validatePlanRows([{ id: 'yemek', name: 'Kahve', amount: 1 }, { id: 'kahve', name: 'Çay', amount: 1 }], sections), null);
  assert.equal(validatePlanRows([{ name: 'Kahve', amount: 1 }], sections), null);
});

test('groupByDay yeni günü üste, gün içinde son ekleneni üste koyar', () => {
  const morning = entry('expense', 1000, '2026-11-16');
  const evening = entry('expense', 2000, '2026-11-16');
  const today = entry('expense', 500, '2026-11-17');
  const groups = groupByDay([morning, today, evening]);
  assert.deepEqual(groups.map((group) => [group.date, group.spent]), [['2026-11-17', 500], ['2026-11-16', 3000]]);
  assert.deepEqual(groups[1].entries, [evening, morning]);
});

test('lastExpenseCategory son eklenen harcamanın bölümünü hatırlar', () => {
  assert.equal(lastExpenseCategory([]), 'keyif');
  assert.equal(lastExpenseCategory([entry('expense', 1, '2026-11-16', 'kahve'), entry('expense', 1, '2026-11-01', 'ulasim')]), 'ulasim');
  assert.equal(lastExpenseCategory([entry('expense', 1, '2026-11-15', 'yemek', SETUP_SPENT_NOTE)]), 'keyif');
});

test('createEntry notu kırpar ve sınırlar', () => {
  const created = createEntry({ type: 'expense', amount: 100, category: 'keyif', note: `  ${'a'.repeat(80)}  `, date: '2026-11-16' }, 5);
  assert.equal(created.note.length, 60);
  assert.equal(created.createdAt, 5);
  assert.equal(typeof created.id, 'string');
});

test('validatePaydays 1 ile 4 arası farklı günü kabul eder', () => {
  assert.equal(validatePaydays(PLAN), null);
  assert.equal(validatePaydays([PLAN[0]]), null);
  assert.equal(validatePaydays([{ day: 1, amount: 1 }, { day: 8, amount: 1 }, { day: 15, amount: 1 }, { day: 22, amount: 1 }]), null);
  assert.match(validatePaydays([]), /En az bir/);
  assert.match(validatePaydays([1, 2, 3, 4, 5].map((day) => ({ day, amount: 1 }))), /En fazla 4/);
  assert.match(validatePaydays([{ day: 15, amount: 1 }, { day: 3, amount: 1 }, { day: 15, amount: 1 }]), /farklı/);
  assert.match(validatePaydays([{ day: 0, amount: 1 }, { day: 15, amount: 1 }]), /1 ile 31/);
  assert.match(validatePaydays([{ day: 1, amount: 0 }, { day: 15, amount: 1 }]), /tutar/);
});

test('tek harçlık gününde dönem bir ay sürer', () => {
  const monthly = [{ day: 5, amount: 600000 }];
  assert.equal(nextPaydayAfter(monthly, '2026-11-16'), '2026-12-05');
  assert.equal(lastPaydayOnOrBefore(monthly, '2026-11-16'), '2026-11-05');
  const state = setupState({ paydays: monthly, today: '2026-11-16' });
  const [period] = buildPeriods(state, '2026-11-16');
  assert.deepEqual([period.start, period.end, period.income], ['2026-11-05', '2026-12-04', 600000]);
});

test('nextPayday sonraki harçlığın gününü ve tutarını verir', () => {
  const plan = [{ day: 15, amount: 200000 }, { day: 1, amount: 300000 }, { day: 31, amount: 50000 }, { day: 30, amount: 70000 }];
  assert.deepEqual(nextPayday(plan, '2026-11-16'), { date: '2026-11-30', amount: 120000 });
  assert.deepEqual(nextPayday(plan, '2026-12-02'), { date: '2026-12-15', amount: 200000 });
  assert.deepEqual(nextPayday(PLAN, '2026-11-30'), { date: '2026-12-01', amount: 300000 });
});

test('updatePaydays günleri sıralı kaydeder', () => {
  const changed = updatePaydays(stateWith([]), [{ day: 20, amount: 2 }, { day: 5, amount: 1 }], '2026-11-16');
  assert.deepEqual(changed.settings.paydays, [{ day: 5, amount: 1 }, { day: 20, amount: 2 }]);
});
