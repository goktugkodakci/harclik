import { categoryBreakdown, groupByDay } from '../core/budget.js';
import { findCategory } from '../core/categories.js';
import { formatDayHeading, formatRange } from '../core/dates.js';
import { emptyCard, entryRow, moneyEl } from './components.js';
import { h, icon } from './dom.js';

function percentLabel(share) {
  const rounded = Math.round(share * 100);
  return rounded === 0 && share > 0 ? '%<1' : `%${rounded}`;
}

function stat(label, kurus) {
  return h('div', { class: 'stat' }, h('p', { class: 'stat-k' }, label), h('p', { class: 'stat-v' }, moneyEl(kurus)));
}

function breakdownSection(period) {
  const items = categoryBreakdown(period.entries);
  if (items.length === 0) {
    return null;
  }
  return h(
    'section',
    { class: 'card breakdown', 'aria-label': 'Kategorilere göre harcama' },
    h(
      'div',
      { class: 'stack', 'aria-hidden': 'true' },
      items.map((item) => h('span', {
        style: { '--c': findCategory('expense', item.category).color, '--w': `${item.share * 100}%` }
      }))
    ),
    h('ul', { class: 'legend' }, items.map((item) => {
      const category = findCategory('expense', item.category);
      return h(
        'li',
        { class: 'legend-row' },
        h('span', { class: 'swatch', style: { '--c': category.color }, 'aria-hidden': 'true' }),
        h('span', { class: 'legend-label' }, `${category.emoji} ${category.label}`),
        moneyEl(item.amount, { className: 'legend-amount' }),
        h('span', { class: 'legend-pct num' }, percentLabel(item.share))
      );
    }))
  );
}

// The selected period is remembered by its start date, not its position, so deleting an
// allowance (which merges two periods) keeps the user on the period they were looking at.
function periodIndexFor(periods, start) {
  if (!start) {
    return periods.length - 1;
  }
  return Math.max(0, periods.findLastIndex((period) => period.start <= start));
}

export function renderHistory({ periods, start, today, onSelect, onOpenEntry }) {
  const lastIndex = periods.length - 1;
  const current = periodIndexFor(periods, start);
  const period = periods[current];
  const isCurrent = current === lastIndex;
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
    breakdownSection(period),
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
        h('ul', { class: 'list' }, group.entries.map((entry) => entryRow(entry, { today, showDate: false, onOpen: onOpenEntry })))
      ))
  );
}
