import { validatePaydays } from '../core/budget.js';
import { findCategory } from '../core/categories.js';
import { dayWithSuffix, formatDayHeading } from '../core/dates.js';
import { formatAmount, parseAmount, signPrefix } from '../core/money.js';
import { h, icon } from './dom.js';

const DAYS_IN_LONGEST_MONTH = 31;

// A visible button that opens the hidden file picker (iOS shows the Files app).
// Returns [button, input]; both must be placed in the DOM.
export function importControl(label, onImport, { className = 'link-btn', iconName = null } = {}) {
  const input = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    onChange: (event) => {
      const [file] = event.target.files;
      event.target.value = '';
      if (file) {
        onImport(file);
      }
    }
  });
  const button = h('button', { type: 'button', class: className, onClick: () => input.click() }, iconName ? icon(iconName) : null, label);
  return [button, input];
}

export function moneyEl(kurus, { sign = 'auto', cents = 'auto', className = '' } = {}) {
  return h(
    'span',
    { class: `money num ${className}`.trim() },
    signPrefix(kurus, sign),
    h('span', { class: 'cur' }, '₺'),
    formatAmount(kurus, { cents })
  );
}

export function sectionHead(title, action = null) {
  return h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title), action);
}

export function linkButton(label, onClick) {
  return h('button', { type: 'button', class: 'link-btn', onClick }, label);
}

export function emptyCard(title, text) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'empty-text' }, text) : null);
}

export function entryRow(entry, { today, showDate, onOpen }) {
  const category = findCategory(entry.type, entry.category);
  const title = entry.note || category.label;
  const details = [];
  if (entry.note) {
    details.push(category.label);
  }
  if (showDate) {
    details.push(formatDayHeading(entry.date, today));
  }
  const signed = entry.type === 'expense' ? -entry.amount : entry.amount;
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: 'row', onClick: () => onOpen(entry) },
      h('span', { class: 'bubble', style: { '--c': category.color }, 'aria-hidden': 'true' }, category.emoji),
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title' }, title),
        details.length > 0 ? h('span', { class: 'row-sub' }, details.join(' · ')) : null
      ),
      moneyEl(signed, { sign: 'always', className: entry.type === 'income' ? 'row-amount is-income' : 'row-amount' })
    )
  );
}

export function moneyField(input) {
  return h('label', { class: 'money-field' }, h('span', { class: 'money-field-cur', 'aria-hidden': 'true' }, '₺'), input);
}

function selectField(select) {
  return h('span', { class: 'select-wrap' }, select);
}

// Used by first-run setup and settings. Until the second amount is touched it mirrors the
// first one, because most people get the same amount both times.
export function paydayEditor(paydays, { onChange = () => {} } = {}) {
  const rows = paydays.map((payday, index) => {
    const select = h(
      'select',
      { class: 'select', 'aria-label': `${index + 1}. harçlık günü`, onChange },
      Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, offset) => {
        const day = offset + 1;
        return h('option', { value: day, selected: day === payday.day }, `Ayın ${dayWithSuffix(day)}`);
      })
    );
    const input = h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'next',
      placeholder: '3.000',
      value: payday.amount ? formatAmount(payday.amount) : '',
      'aria-label': `${index + 1}. harçlık tutarı`,
      onInput: onChange
    });
    return {
      select,
      input,
      element: h('div', { class: 'payday-row' }, h('span', { class: 'payday-label' }, `${index + 1}. harçlık`), selectField(select), moneyField(input))
    };
  });

  let secondTouched = Boolean(paydays[1]?.amount);
  rows[1].input.addEventListener('input', () => {
    secondTouched = true;
  });
  rows[0].input.addEventListener('input', () => {
    if (!secondTouched) {
      rows[1].input.value = rows[0].input.value;
    }
  });

  function read() {
    const amounts = rows.map((row) => (row.input.value.trim() === '' ? null : parseAmount(row.input.value)));
    if (amounts.some((amount) => amount === null)) {
      return { error: 'Her iki harçlık için de geçerli bir tutar yaz. Örn. 3.000' };
    }
    const result = rows.map((row, index) => ({ day: Number(row.select.value), amount: amounts[index] }));
    const error = validatePaydays(result);
    return error ? { error } : { paydays: result };
  }

  function days() {
    return rows.map((row) => Number(row.select.value));
  }

  return { element: h('div', { class: 'payday-list' }, rows.map((row) => row.element)), read, days };
}
