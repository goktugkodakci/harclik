import { groupByDay, periodBudget, planFor } from '../core/budget.js';
import { KEYIF } from '../core/categories.js';
import { formatDayHeading, formatRange } from '../core/dates.js';
import { formatMoney } from '../core/money.js';
import { bubble, emptyCard, entryRow, moneyEl, ring, usageLine } from './components.js';
import { h, icon } from './dom.js';

const DONUT = { size: 176, stroke: 22 };

// The selected period is remembered by its start date, not its position, so deleting an
// allowance (which merges two periods) keeps the user on the period they were looking at.
function periodIndexFor(periods, start) {
  if (!start) {
    return periods.length - 1;
  }
  return Math.max(0, periods.findLastIndex((period) => period.start <= start));
}

function stat(label, kurus) {
  return h('div', { class: 'stat' }, h('p', { class: 'stat-k' }, label), h('p', { class: 'stat-v' }, moneyEl(kurus)));
}

function usageRow(info, label, spent, planned, left = planned - spent) {
  return h(
    'li',
    { class: 'usage-row' },
    bubble(info),
    h('span', { class: 'need-main' }, h('span', { class: 'row-title' }, label), usageLine(spent, planned, left))
  );
}

// Donut of where the money went (each planned section, then keyif) above the plan-vs-spent list.
function spendingCard(period, budget, describe) {
  const hasSpending = period.spent > 0;
  if (budget.sections.length === 0 && !hasSpending) {
    return null;
  }
  const slices = [
    ...budget.sections.map((section) => ({ amount: section.spent, color: section.color, name: section.name })),
    { amount: budget.keyifSpent, color: KEYIF.color, name: KEYIF.label }
  ].filter((slice) => slice.amount > 0);
  const label = slices.map((slice) => `${slice.name} ${formatMoney(slice.amount)}`).join(', ');
  return h(
    'section',
    { class: 'card spending-card', 'aria-label': 'Harcamaların dağılımı' },
    hasSpending
      ? ring({
        ...DONUT,
        segments: slices.map((slice) => ({ value: slice.amount / period.spent, color: slice.color })),
        className: 'donut',
        label: `Harcamaların dağılımı: ${label}`,
        content: [h('span', { class: 'donut-total' }, moneyEl(period.spent)), h('span', { class: 'donut-caption' }, 'harcandı')]
      })
      : null,
    h(
      'ul',
      { class: 'usage-list' },
      budget.sections.map((section) => usageRow(describe(section.id), section.name, section.spent, section.planned)),
      // Overruns in planned sections are paid from keyif, so they count as keyif used here, and
      // what is left is exactly the summary's "Keyif için kalan".
      usageRow(KEYIF, 'Keyif', budget.keyifSpent + budget.overrun, Math.max(0, budget.keyifBudget), budget.keyifLeft)
    ),
    budget.sections.length === 0
      ? h('p', { class: 'hint' }, 'Bu dönem için gerekli harcama planı yoktu; tüm harcamalar keyiften sayıldı.')
      : null
  );
}

export function renderHistory({ periods, start, today, sections, plans, describe, onSelect, onOpenEntry }) {
  const lastIndex = periods.length - 1;
  const current = periodIndexFor(periods, start);
  const period = periods[current];
  const isCurrent = current === lastIndex;
  const budget = periodBudget(period, planFor(plans, period), sections);
  const groups = groupByDay(period.entries);

  return h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'title' }, 'Geçmiş')),
    h(
      'nav',
      { class: 'period-nav', 'aria-label': 'Dönemler' },
      h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Önceki dönem',
        disabled: current === 0,
        onClick: () => onSelect(periods[current - 1].start)
      }, icon('chevron-left')),
      h(
        'p',
        { class: 'range', 'aria-live': 'polite' },
        formatRange(period.start, period.end, today),
        h('small', {}, isCurrent ? 'Bu dönem' : `${lastIndex - current} dönem önce`)
      ),
      h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Sonraki dönem',
        disabled: isCurrent,
        onClick: () => onSelect(periods[current + 1].start)
      }, icon('chevron-right'))
    ),
    h(
      'div',
      { class: 'stats' },
      stat('Gelen', period.income),
      stat('Harcanan', period.spent),
      stat(isCurrent ? 'Kalan' : 'Dönem sonu', period.balance)
    ),
    period.carryIn === 0
      ? null
      : h('p', { class: 'carry-note' }, 'Önceki dönemden devreden: ', moneyEl(period.carryIn, { sign: 'always' })),
    spendingCard(period, budget, describe),
    groups.length === 0
      ? emptyCard('Bu dönemde kayıt yok', null)
      : groups.map((group) => h(
        'section',
        { class: 'day', 'aria-label': formatDayHeading(group.date, today) },
        h(
          'h2',
          { class: 'day-head' },
          h('span', {}, formatDayHeading(group.date, today)),
          group.spent > 0 ? moneyEl(-group.spent) : null
        ),
        h('ul', { class: 'list' }, group.entries.map((entry) => entryRow(entry, { today, sections, showDate: false, onOpen: onOpenEntry })))
      ))
  );
}
