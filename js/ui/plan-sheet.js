import { formatRange } from '../core/dates.js';
import { formatMoney } from '../core/money.js';
import { planRowsEditor } from './components.js';
import { h, icon } from './dom.js';
import { openSheet } from './sheet.js';

// Edits this period's "gerekli" sections. The footer shows, live, what is left for keyif.
// onSave returns false to keep the sheet open (for example when the user cancels a confirm).
export function openPlanSheet({ period, today, sections, available, rows, onSave }) {
  let sheet = null;
  const error = h('p', { class: 'form-error', role: 'alert' });
  const footer = h('p', { class: 'plan-footer' });
  const editor = planRowsEditor(rows, { onChange: update, sections });

  function update() {
    error.textContent = '';
    const total = editor.total();
    const keyif = available - total;
    footer.replaceChildren(
      h('span', {}, `Eldeki para ${formatMoney(available)} · gerekli ${formatMoney(total)}`),
      h('strong', { class: keyif < 0 ? 'is-over' : '' }, `Keyif bütçen ${formatMoney(keyif)}`)
    );
  }

  function save() {
    const result = editor.read();
    if (result.error) {
      error.textContent = result.error;
      return;
    }
    if (onSave(result.rows) !== false) {
      sheet.close();
    }
  }

  update();
  sheet = openSheet({
    label: 'Gerekli harcamalar',
    content: [
      h(
        'div',
        { class: 'sheet-head' },
        h(
          'div',
          { class: 'sheet-heading' },
          h('h2', { class: 'sheet-title' }, 'Gerekli harcamalar'),
          h('p', { class: 'sheet-sub' }, `${formatRange(period.start, period.end, today)} dönemi · sonraki dönemlere de geçer`)
        ),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onClick: () => sheet.close() }, icon('close'))
      ),
      h('p', { class: 'hint plan-hint' }, 'Bu dönem her işe ne kadar ayırıyorsun? Kalan para keyif paran olur.'),
      editor.element,
      footer,
      error,
      h('button', { type: 'button', class: 'btn btn-primary', onClick: save }, 'Kaydet')
    ]
  });
}
