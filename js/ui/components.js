import { MAX_PAYDAYS, SECTION_NAME_MAX_LENGTH, validatePaydays, validatePlanRows } from '../core/budget.js';
import { describeCategory } from '../core/categories.js';
import { dayWithSuffix, formatDayHeading } from '../core/dates.js';
import { formatAmount, parseAmount, signPrefix } from '../core/money.js';
import { h, icon } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAYS_IN_LONGEST_MONTH = 31;
// Days offered first when a payday row is added: the usual "ay başı / ay ortası" rhythm.
const SUGGESTED_PAYDAYS = [1, 15, 8, 22, 5, 20, 10, 25];

function svg(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
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

// Progress ring. With `segments` it becomes a donut: each segment { value (0..1 of the whole),
// color }. Values are drawn in real stroke lengths, not pathLength, for older Safari.
export function ring({ size, stroke, value = 0, segments = null, className = '', label = null, content = null }) {
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const graphic = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', focusable: 'false' });
  graphic.append(svg('circle', { cx: center, cy: center, r: radius, fill: 'none', 'stroke-width': stroke, class: 'ring-track' }));

  const parts = segments ?? [{ value }];
  let start = 0;
  for (const part of parts) {
    const length = Math.max(0, Math.min(1, part.value)) * circumference;
    if (length <= 0) {
      continue;
    }
    const arc = svg('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      'stroke-width': stroke,
      'stroke-linecap': segments ? 'butt' : 'round',
      'stroke-dasharray': `${length} ${circumference}`,
      'stroke-dashoffset': -start,
      transform: `rotate(-90 ${center} ${center})`,
      class: 'ring-value'
    });
    if (part.color) {
      arc.style.stroke = part.color;
    }
    graphic.append(arc);
    start += length;
  }

  return h(
    'div',
    { class: `ring ${className}`.trim(), style: { '--size': `${size}px` }, role: label ? 'img' : null, 'aria-label': label },
    graphic,
    content ? h('div', { class: 'ring-center' }, content) : null
  );
}

// Emoji when the name suggests one, otherwise the first letter in the section's color.
export function categoryGlyph(info) {
  return info.emoji
    ? h('span', { class: 'emoji', 'aria-hidden': 'true' }, info.emoji)
    : h('span', { class: 'letter', style: { '--c': info.color }, 'aria-hidden': 'true' }, info.letter);
}

export function bubble(info) {
  return h('span', { class: 'bubble', style: { '--c': info.color }, 'aria-hidden': 'true' }, categoryGlyph(info));
}

export function sectionHead(title, action = null) {
  return h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title), action);
}

export function linkButton(label, onClick) {
  return h('button', { type: 'button', class: 'link-btn', onClick }, label);
}

export function emptyCard(title, text, action = null) {
  return h(
    'div',
    { class: 'empty' },
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'empty-text' }, text) : null,
    action
  );
}

// Planned-vs-spent progress for one bucket. Over plan turns the bar and the note red.
// `left` defaults to planned − spent; keyif passes its own, which can be negative even with
// nothing spent when the plan already eats more than the money there is.
export function usageLine(spent, planned, left = planned - spent) {
  const over = left < 0;
  let fill = 0;
  if (planned > 0) {
    fill = Math.min(1, spent / planned);
  }
  if (over) {
    fill = 1;
  }
  const status = over
    ? h('span', { class: 'usage-status is-over' }, moneyEl(-left), ' aştı')
    : h('span', { class: 'usage-status' }, moneyEl(left), ' kaldı');
  return [
    h('span', { class: 'usage-text' }, h('span', {}, moneyEl(spent), ' / ', moneyEl(planned)), status),
    h('span', { class: over ? 'usage-bar is-over' : 'usage-bar', style: { '--fill': `${fill * 100}%` }, 'aria-hidden': 'true' }, h('span', {}))
  ];
}

export function entryRow(entry, { today, sections, showDate, onOpen }) {
  const info = describeCategory(entry.type, entry.category, sections);
  const title = entry.note || info.label;
  const details = [];
  if (entry.note) {
    details.push(info.label);
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
      bubble(info),
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

// 1 to MAX_PAYDAYS paydays, each a day of the month and an amount. Rows the user has not typed
// an amount into follow the first row's amount, because most people get the same sum each time.
export function paydayEditor(paydays, { onChange = () => {} } = {}) {
  const list = h('div', { class: 'payday-list' });
  const rows = [];
  const addButton = h('button', {
    type: 'button',
    class: 'link-btn add-row',
    onClick: () => {
      addRow({ day: freeDay(), amountText: rows[0]?.input.value ?? '' });
      refresh();
      onChange();
    }
  }, icon('plus'), 'Harçlık günü ekle');

  function freeDay() {
    const used = new Set(rows.map((row) => Number(row.select.value)));
    const all = Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, offset) => offset + 1);
    return [...SUGGESTED_PAYDAYS, ...all].find((day) => !used.has(day));
  }

  function addRow({ day, amountText, typed = false }) {
    const row = { typed };
    row.select = h(
      'select',
      { class: 'select', onChange },
      Array.from({ length: DAYS_IN_LONGEST_MONTH }, (_, offset) => {
        const value = offset + 1;
        return h('option', { value, selected: value === day }, `Ayın ${dayWithSuffix(value)}`);
      })
    );
    row.input = h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      enterkeyhint: 'next',
      placeholder: '3.000',
      value: amountText,
      onInput: () => {
        row.typed = true;
        if (row === rows[0]) {
          for (const other of rows.slice(1)) {
            if (!other.typed) {
              other.input.value = row.input.value;
            }
          }
        }
        onChange();
      }
    });
    row.label = h('span', { class: 'payday-label' });
    row.remove = h('button', {
      type: 'button',
      class: 'icon-btn icon-btn-quiet icon-btn-small',
      onClick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.element.remove();
        refresh();
        onChange();
      }
    }, icon('close'));
    row.element = h('div', { class: 'payday-row' }, h('div', { class: 'payday-head' }, row.label, row.remove), selectField(row.select), moneyField(row.input));
    rows.push(row);
    list.append(row.element);
  }

  function refresh() {
    rows.forEach((row, index) => {
      const name = rows.length === 1 ? 'Harçlık' : `${index + 1}. harçlık`;
      row.label.textContent = name;
      row.select.setAttribute('aria-label', `${name} günü`);
      row.input.setAttribute('aria-label', `${name} tutarı`);
      row.remove.setAttribute('aria-label', `${name} gününü kaldır`);
      row.remove.hidden = rows.length === 1;
    });
    addButton.hidden = rows.length >= MAX_PAYDAYS;
  }

  for (const payday of paydays) {
    addRow({ day: payday.day, amountText: payday.amount ? formatAmount(payday.amount) : '', typed: Boolean(payday.amount) });
  }
  refresh();

  function read() {
    const amounts = rows.map((row) => (row.input.value.trim() === '' ? null : parseAmount(row.input.value)));
    if (amounts.some((amount) => amount === null)) {
      return { error: 'Her harçlık için geçerli bir tutar yaz. Örn. 3.000' };
    }
    const result = rows.map((row, index) => ({ day: Number(row.select.value), amount: amounts[index] }));
    const error = validatePaydays(result);
    return error ? { error } : { paydays: result };
  }

  function days() {
    return rows.map((row) => Number(row.select.value));
  }

  return { element: h('div', { class: 'payday-editor' }, list, addButton), read, days };
}

// Editable list of "gerekli" sections: name + amount per row, rows can be added and removed.
// Each row remembers the section id it came from, so renaming keeps the section's history.
export function planRowsEditor(initialRows, { onChange = () => {}, sections = [] } = {}) {
  const list = h('div', { class: 'plan-rows' });
  const rows = [];

  function addRow({ id = null, name = '', amount = null } = {}, { focus = false } = {}) {
    const nameInput = h('input', {
      class: 'input',
      type: 'text',
      placeholder: 'Bölüm adı',
      maxlength: SECTION_NAME_MAX_LENGTH,
      value: name,
      autocomplete: 'off',
      enterkeyhint: 'next',
      'aria-label': 'Bölüm adı',
      onInput: onChange
    });
    const amountInput = h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'decimal',
      placeholder: 'Tutar',
      value: amount === null ? '' : formatAmount(amount),
      autocomplete: 'off',
      enterkeyhint: 'next',
      'aria-label': 'Ayrılan tutar',
      onInput: onChange
    });
    const row = { id, nameInput, amountInput, element: null };
    const removeButton = h('button', {
      type: 'button',
      class: 'icon-btn icon-btn-quiet',
      'aria-label': 'Bölümü kaldır',
      onClick: () => {
        rows.splice(rows.indexOf(row), 1);
        row.element.remove();
        onChange();
      }
    }, icon('close'));
    row.element = h('div', { class: 'plan-row' }, nameInput, moneyField(amountInput), removeButton);
    rows.push(row);
    list.append(row.element);
    if (focus) {
      nameInput.focus();
    }
  }

  for (const row of initialRows) {
    addRow(row);
  }

  const addButton = h('button', {
    type: 'button',
    class: 'link-btn add-row',
    onClick: () => {
      addRow({}, { focus: true });
      onChange();
    }
  }, icon('plus'), 'Bölüm ekle');

  // Rows left completely blank are ignored. In setup, rows without an amount are skipped too,
  // so the suggested "Yemek" / "Ulaşım" rows cost nothing if the user does not want them.
  function read({ dropUnpriced = false } = {}) {
    const result = [];
    for (const row of rows) {
      const name = row.nameInput.value;
      const amountText = row.amountInput.value.trim();
      if (name.trim() === '' && amountText === '') {
        continue;
      }
      if (amountText === '' && dropUnpriced) {
        continue;
      }
      result.push({ id: row.id, name, amount: amountText === '' ? null : parseAmount(amountText) });
    }
    const error = validatePlanRows(result, sections);
    return error ? { error } : { rows: result };
  }

  function total() {
    return rows.reduce((sum, row) => sum + (parseAmount(row.amountInput.value.trim()) ?? 0), 0);
  }

  return { element: h('div', { class: 'plan-editor' }, list, addButton), read, total };
}
