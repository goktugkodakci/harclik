import { NOTE_MAX_LENGTH } from '../core/budget.js';
import { EXTRA_INCOME_CATEGORY, categoriesFor } from '../core/categories.js';
import { formatDayHeading, isValidISODate } from '../core/dates.js';
import { bufferToKurus, formatBuffer, kurusToBuffer, pressKey } from '../core/money.js';
import { h, icon, prefersReducedMotion } from './dom.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const KEY_LABELS = { ',': 'Virgül', back: 'Son rakamı sil' };
// Fallback in case animationend never fires (tab hidden mid-animation).
const CLOSE_FALLBACK_MS = 320;
const TYPE_LABELS = { expense: 'Harcama', income: 'Gelir' };

// Bottom sheet for adding or editing an entry. Uses an on-screen keypad so the iPhone
// keyboard never covers the form while typing an amount.
export function openEntrySheet({
  entry = null,
  type = 'expense',
  category = null,
  today,
  defaultExpenseCategory,
  onSave,
  onDelete = null
}) {
  const opener = document.activeElement;
  const draft = {
    type: entry?.type ?? type,
    buffer: entry ? kurusToBuffer(entry.amount) : '',
    note: entry?.note ?? '',
    date: entry?.date ?? today
  };
  const chosen = { expense: defaultExpenseCategory, income: EXTRA_INCOME_CATEGORY };
  chosen[draft.type] = entry?.category ?? category ?? chosen[draft.type];

  const amountEl = h('output', { class: 'amount-display num', 'aria-live': 'polite' });
  const categoryGrid = h('div', { class: 'cats', role: 'group', 'aria-label': 'Kategori' });
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

  // The sheet itself takes focus on open: a focused button would swallow Enter, and a
  // focused text field would pop up the iPhone keyboard over the keypad.
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': entry ? 'Kaydı düzenle' : 'Yeni kayıt', tabindex: '-1' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'sheet-head' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Kayıt türü' }, typeButtons),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onClick: close }, icon('close'))
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
  );

  function renderAmount() {
    const empty = draft.buffer === '';
    amountEl.classList.toggle('is-empty', empty);
    amountEl.replaceChildren(h('span', { class: 'cur' }, '₺'), formatBuffer(draft.buffer));
    saveButton.disabled = bufferToKurus(draft.buffer) === 0;
  }

  function renderType() {
    for (const button of typeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.type === draft.type));
    }
    const categories = categoriesFor(draft.type);
    categoryGrid.classList.toggle('is-income', draft.type === 'income');
    categoryGrid.replaceChildren(...categories.map((item) => h(
      'button',
      {
        type: 'button',
        class: 'cat',
        'aria-pressed': String(item.id === chosen[draft.type]),
        onClick: () => {
          chosen[draft.type] = item.id;
          errorEl.textContent = '';
          renderType();
        }
      },
      h('span', { class: 'emoji', 'aria-hidden': 'true' }, item.emoji),
      h('span', {}, item.label)
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
    close();
  }

  function remove() {
    onDelete();
    close();
  }

  let closing = false;
  function close() {
    if (closing) {
      return;
    }
    closing = true;
    const finish = () => {
      if (!dialog.isConnected) {
        return;
      }
      dialog.close();
      dialog.remove();
      // Saving re-renders the page, so the row that opened the sheet may be gone. Keep focus
      // somewhere sensible for keyboard and VoiceOver users instead of dropping it on <body>.
      // Safari does not focus buttons on tap, so the opener is often <body> itself.
      const usable = opener instanceof HTMLElement && opener !== document.body && opener.isConnected;
      const target = usable ? opener : document.querySelector('main');
      target?.focus({ preventScroll: true });
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    dialog.classList.add('is-closing');
    dialog.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, CLOSE_FALLBACK_MS);
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return;
    }
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) {
      close();
    }
  });
  // Lets the sheet work with a hardware keyboard too (desktop testing, iPad keyboards).
  dialog.addEventListener('keydown', (event) => {
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
  });

  renderType();
  renderAmount();
  document.body.append(dialog);
  dialog.showModal();
  dialog.focus();
}
