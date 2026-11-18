import { importControl, paydayEditor } from './components.js';
import { h, icon } from './dom.js';

const APP_VERSION = '1.1.0';

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function renderSettings({ settings, onBack, onSavePlan, onCarryOver, onExport, onImport, onReset }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const editor = paydayEditor(settings.paydays, {
    onChange: () => {
      error.textContent = '';
    }
  });
  const [restoreButton, fileInput] = importControl('Geri yükle', onImport, { className: 'btn btn-secondary', iconName: 'upload' });

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'back-btn', onClick: onBack }, icon('chevron-left'), 'Özet'),
      h('h1', { class: 'title title-small' }, 'Ayarlar'),
      h('span', { class: 'topbar-spacer', 'aria-hidden': 'true' })
    ),

    h('h2', { class: 'group-title' }, 'Harçlık planı'),
    h(
      'form',
      {
        class: 'group',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          const result = editor.read();
          if (result.error) {
            error.textContent = result.error;
            return;
          }
          onSavePlan(result.paydays);
        }
      },
      editor.element,
      h('p', { class: 'hint' }, 'Ayda 1 ile 4 arası harçlık günü ekleyebilirsin. Değişiklik bir sonraki harçlıktan itibaren geçerli olur; gelmiş bir harçlığın tutarını ya da gününü Geçmiş\'ten düzeltebilirsin.'),
      error,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Planı kaydet')
    ),

    h('h2', { class: 'group-title' }, 'Devir'),
    h(
      'label',
      { class: 'group switch-row' },
      h(
        'span',
        {},
        h('span', { class: 'switch-title' }, 'Artan para sonraki döneme geçsin'),
        h('span', { class: 'hint' }, 'Kapalıysa her dönem sadece o dönemin harçlığıyla başlar; eksiye düştüysen o da silinir.')
      ),
      h('input', {
        type: 'checkbox',
        role: 'switch',
        class: 'switch',
        checked: settings.carryOver,
        onChange: (event) => onCarryOver(event.target.checked)
      })
    ),

    h('h2', { class: 'group-title' }, 'Yedek'),
    h(
      'div',
      { class: 'group' },
      h('p', { class: 'hint hint-top' }, 'Verilerin sadece bu telefonda duruyor. Arada bir yedek alıp Dosyalar\'a ya da iCloud Drive\'a kaydet.'),
      h(
        'div',
        { class: 'button-pair' },
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: onExport }, icon('download'), 'Yedek al'),
        restoreButton
      ),
      fileInput
    ),

    isStandalone()
      ? null
      : h(
        'div',
        { class: 'tip' },
        h('p', { class: 'tip-title' }, 'Ana ekrana ekle'),
        h('p', { class: 'hint' }, 'Safari\'de alttaki Paylaş düğmesine dokun, sonra "Ana Ekrana Ekle"yi seç. Uygulama kendi simgesiyle açılır.')
      ),

    h('button', { type: 'button', class: 'btn btn-quiet-danger reset-btn', onClick: onReset }, 'Tüm verileri sil'),
    h('p', { class: 'version' }, `Harçlık · sürüm ${APP_VERSION}`)
  );
}
