import { lastPaydayOnOrBefore } from '../core/budget.js';
import { formatDayMonth } from '../core/dates.js';
import { parseAmount } from '../core/money.js';
import { emptyState } from '../core/store.js';
import { importControl, moneyField, paydayEditor, planRowsEditor } from './components.js';
import { h } from './dom.js';

// Suggestions only: rows left without an amount are skipped.
const SUGGESTED_SECTIONS = [{ name: 'Yemek' }, { name: 'Ulaşım' }];

function stepTitle(number, text) {
  return h('h2', { class: 'group-title step-title' }, h('span', { class: 'step', 'aria-hidden': 'true' }, number), text);
}

export function renderSetup({ today, onComplete, onImport }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const lastPaydayHint = h('p', { class: 'hint' });
  const editor = paydayEditor(emptyState().settings.paydays, { onChange: update });
  const planEditor = planRowsEditor(SUGGESTED_SECTIONS, {
    onChange: () => {
      error.textContent = '';
    }
  });
  const balanceInput = h('input', {
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    enterkeyhint: 'done',
    placeholder: 'Örn. 2.450',
    'aria-label': 'Şu an elinde kalan para'
  });
  const [restoreButton, fileInput] = importControl('Yedekten yükle', onImport);

  function update() {
    error.textContent = '';
    const days = editor.days();
    if (new Set(days).size !== days.length) {
      lastPaydayHint.textContent = '';
      return;
    }
    const last = lastPaydayOnOrBefore(days.map((day) => ({ day })), today);
    const when = last === today ? 'Bugün harçlık günün.' : `Son harçlık günün ${formatDayMonth(last)}.`;
    lastPaydayHint.textContent = `${when} O günden beri harcadıklarını düşüp elinde kalanı yaz. Boş bırakırsan harçlığın tamamı duruyor sayılır.`;
  }

  function submit(event) {
    event.preventDefault();
    const result = editor.read();
    if (result.error) {
      error.textContent = result.error;
      return;
    }
    let balance = null;
    if (balanceInput.value.trim() !== '') {
      balance = parseAmount(balanceInput.value);
      if (balance === null) {
        error.textContent = 'Elindeki tutarı anlayamadım. Örn. 2.450 ya da 2450,50';
        return;
      }
    }
    const plan = planEditor.read({ dropUnpriced: true });
    if (plan.error) {
      error.textContent = plan.error;
      return;
    }
    onComplete({ paydays: result.paydays, balance, planRows: plan.rows });
  }

  update();

  return h(
    'div',
    { class: 'view setup' },
    h(
      'header',
      { class: 'setup-hero' },
      h('img', { class: 'setup-mark', src: 'icons/icon.svg', alt: '', width: 72, height: 72 }),
      h('h1', { class: 'title setup-title' }, 'Harçlık'),
      h('p', { class: 'setup-lead' }, 'Gerekli harcamalarını harçlığından ayır, keyif için ne kadar kaldığını hep gör.')
    ),
    h(
      'form',
      { class: 'setup-form', novalidate: true, onSubmit: submit },
      stepTitle('1', 'Harçlık ne zaman, ne kadar geliyor?'),
      h('div', { class: 'group' }, editor.element),
      stepTitle('2', 'Şu an elinde ne kadar var?'),
      h('div', { class: 'group' }, moneyField(balanceInput), lastPaydayHint),
      stepTitle('3', 'Gerekli harcamaların'),
      h(
        'div',
        { class: 'group' },
        h('p', { class: 'hint hint-top' }, 'Her harçlıktan bu işlere ne kadar ayırıyorsun? Tutar yazmadığın satırlar atlanır; sonra değiştirebilirsin.'),
        planEditor.element
      ),
      error,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Başla')
    ),
    h('p', { class: 'setup-restore' }, 'Daha önce yedek aldın mı? ', restoreButton, fileInput)
  );
}
