import { lastPaydayOnOrBefore } from '../core/budget.js';
import { formatDayMonth } from '../core/dates.js';
import { parseAmount } from '../core/money.js';
import { emptyState } from '../core/store.js';
import { importControl, moneyField, paydayEditor } from './components.js';
import { h } from './dom.js';

export function renderSetup({ today, onComplete, onImport }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const lastPaydayHint = h('p', { class: 'hint' });
  const editor = paydayEditor(emptyState().settings.paydays, { onChange: update });
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
    const [first, second] = editor.days();
    if (first === second) {
      lastPaydayHint.textContent = '';
      return;
    }
    const last = lastPaydayOnOrBefore([{ day: first }, { day: second }], today);
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
    onComplete({ paydays: result.paydays, balance });
  }

  update();

  return h(
    'div',
    { class: 'view setup' },
    h('img', { class: 'setup-mark', src: 'icons/icon.svg', alt: '', width: 64, height: 64 }),
    h('h1', { class: 'title' }, 'Harçlık'),
    h('p', { class: 'setup-lead' }, 'Harçlığın ayda iki kez geliyor. Bir sonrakine kadar günde ne kadar harcayabileceğini sen sormadan söyleyeyim.'),
    h(
      'form',
      { class: 'setup-form', novalidate: true, onSubmit: submit },
      h('h2', { class: 'group-title' }, 'Harçlık ne zaman, ne kadar geliyor?'),
      h('div', { class: 'group' }, editor.element),
      h('h2', { class: 'group-title' }, 'Şu an elinde ne kadar var?'),
      h('div', { class: 'group' }, moneyField(balanceInput), lastPaydayHint),
      error,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Başla')
    ),
    h(
      'p',
      { class: 'setup-restore' },
      'Daha önce yedek aldın mı? ',
      restoreButton,
      fileInput
    )
  );
}
