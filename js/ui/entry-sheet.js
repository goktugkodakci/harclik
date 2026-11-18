import { NOTE_MAX_LENGTH } from '../core/budget.js';
import { EXTRA_INCOME_CATEGORY } from '../core/categories.js';
import { formatDayHeading, isValidISODate } from '../core/dates.js';
import { bufferToKurus, formatBuffer, kurusToBuffer, pressKey } from '../core/money.js';
import { categoryGlyph } from './components.js';
import { h, icon } from './dom.js';
import { openSheet } from './sheet.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const KEY_LABELS = { ',': 'Virgül', back: 'Son rakamı sil' };
const TYPE_LABELS = { expense: 'Harcama', income: 'Gelir' };

// Bottom sheet for adding or editing an entry. Uses an on-screen keypad so the iPhone
// keyboard never covers the form while typing an amount. Options are described categories:
// "Keyif" plus this period's sections for expenses, Harçlık / Ek para for income.
export function openEntrySheet({
  entry = null,
  type = 'expense',
  category = null,
  today,
  expenseOptions,
  incomeOptions,
  defaultExpenseCategory,
  onSave,
  onDelete = null
}) {
  const options = { expense: expenseOptions, income: incomeOptions };
  const draft = {
    type: entry?.type ?? type,
    buffer: entry ? kurusToBuffer(entry.amount) : '',
    note: entry?.note ?? '',
    date: entry?.date ?? today
  };
  const isOffered = (kind, id) => options[kind].some((option) => option.id === id);
  const chosen = {
    expense: isOffered('expense', defaultExpenseCategory) ? defaultExpenseCategory : expenseOptions[0].id,
    income: EXTRA_INCOME_CATEGORY
  };
  const wanted = entry?.category ?? category;
  if (wanted && isOffered(draft.type, wanted)) {
    chosen[draft.type] = wanted;
  }

  let sheet = null;
  const amountEl = h('output', { class: 'amount-display num', 'aria-live': 'polite' });
  const categoryGrid = h('div', { class: 'cats', role: 'group', 'aria-label': 'Nereye' });
  const typeButtons = Object.entries(TYPE_LABELS).map(([value, label]) => h(
    'button',
    { type: 'button', 'data-type': value, onClick: () => setType(value) },
    label
  ));
  const noteInput = h('input', {
    class: 'note-input',
    type: 'text',
    placeholder: 'Not (isteğe bağlı)',
    maxlength: NOTE_MAX_LENGTH,
    value: draft.note,
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': 'Not',
    onInput: (event) => {
      draft.note = event.target.value;
    }
  });
  const dateLabel = h('span', {}, formatDayHeading(draft.date, today));
  const dateInput = h('input', {
    type: 'date',
    value: draft.date,
    max: today,
    'aria-label': 'Tarih',
    onChange: (event) => {
      const value = event.target.value;
      if (isValidISODate(value) && value <= today) {
        draft.date = value;
        dateLabel.textContent = formatDayHeading(value, today);
      } else {
        event.target.value = draft.date;
      }
    }
  });
  const errorEl = h('p', { class: 'form-error', role: 'alert' });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', onClick: save }, entry ? 'Güncelle' : 'Kaydet');
  const keypad = h('div', { class: 'keypad' }, KEYS.map((key) => h(
    'button',
    { type: 'button', class: 'key num', 'aria-label': KEY_LABELS[key] ?? null, onClick: () => press(key) },
    key === 'back' ? icon('backspace') : key
  )));

  function renderAmount() {
    amountEl.classList.toggle('is-empty', draft.buffer === '');
    amountEl.replaceChildren(h('span', { class: 'cur' }, '₺'), formatBuffer(draft.buffer));
    saveButton.disabled = bufferToKurus(draft.buffer) === 0;
  }

  function renderType() {
    for (const button of typeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.type === draft.type));
    }
    categoryGrid.classList.toggle('is-income', draft.type === 'income');
    categoryGrid.replaceChildren(...options[draft.type].map((option) => h(
      'button',
      {
        type: 'button',
        class: 'cat',
        style: { '--c': option.color },
        'aria-pressed': String(option.id === chosen[draft.type]),
        onClick: () => {
          chosen[draft.type] = option.id;
          errorEl.textContent = '';
          renderType();
        }
      },
      categoryGlyph(option),
      h('span', { class: 'cat-label' }, option.label)
    )));
  }

  function setType(value) {
    draft.type = value;
    renderType();
  }

  function press(key) {
    draft.buffer = pressKey(draft.buffer, key);
    errorEl.textContent = '';
    renderAmount();
  }

  function save() {
    const amount = bufferToKurus(draft.buffer);
    if (amount <= 0) {
      errorEl.textContent = 'Önce bir tutar yaz.';
      return;
    }
    onSave({ type: draft.type, amount, category: chosen[draft.type], note: draft.note, date: draft.date });
    sheet.close();
  }

  function remove() {
    onDelete();
    sheet.close();
  }

  // Lets the sheet work with a hardware keyboard too (desktop testing, iPad keyboards).
  function onKeydown(event) {
    if (event.target === noteInput) {
      if (event.key === 'Enter') {
        event.preventDefault();
        noteInput.blur();
      }
      return;
    }
    if (event.target === dateInput || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (/^\d$/.test(event.key)) {
      press(event.key);
    } else if (event.key === ',' || event.key === '.') {
      press(',');
    } else if (event.key === 'Backspace') {
      press('back');
    } else if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
      save();
    } else {
      return;
    }
    event.preventDefault();
  }

  renderType();
  renderAmount();
  sheet = openSheet({
    label: entry ? 'Kaydı düzenle' : 'Yeni kayıt',
    onKeydown,
    content: [
      h(
        'div',
        { class: 'sheet-head' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Kayıt türü' }, typeButtons),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onClick: () => sheet.close() }, icon('close'))
      ),
      amountEl,
      categoryGrid,
      h('div', { class: 'meta-row' }, noteInput, h('label', { class: 'date-chip' }, icon('calendar'), dateLabel, dateInput)),
      keypad,
      errorEl,
      h(
        'div',
        { class: 'sheet-actions' },
        onDelete ? h('button', { type: 'button', class: 'btn btn-quiet-danger', onClick: remove }, 'Sil') : null,
        saveButton
      )
    ]
  });
}
