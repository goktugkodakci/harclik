import {
  buildPeriods,
  catchUpAllowances,
  createEntry,
  lastExpenseCategory,
  normalizeNote,
  setupState,
  updatePlan
} from './core/budget.js';
import { ALLOWANCE_CATEGORY } from './core/categories.js';
import { toISODate } from './core/dates.js';
import { formatMoney } from './core/money.js';
import { discardSetAside, emptyState, exportBackup, importBackup, loadState, saveState } from './core/store.js';
import { h } from './ui/dom.js';
import { openEntrySheet } from './ui/entry-sheet.js';
import { renderHistory } from './ui/history.js';
import { renderSettings } from './ui/settings.js';
import { renderSetup } from './ui/setup.js';
import { renderSummary } from './ui/summary.js';
import { showToast } from './ui/toast.js';

// The app can stay open across midnight; this is how often we notice the new day.
const DAY_CHECK_INTERVAL_MS = 60_000;
const LONG_TOAST_MS = 8000;
const OBJECT_URL_LIFETIME_MS = 10_000;

const root = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const storage = openStorage();
const ui = { view: 'summary', historyStart: null };
let today = toISODate(new Date());
let state = emptyState();

function openStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('localStorage kullanılamıyor', error);
    return null;
  }
}

function persist() {
  if (!saveState(storage, state)) {
    showToast('Kaydedilemedi. Telefonun depolama alanı dolu ya da kapalı olabilir.', { tone: 'error', duration: LONG_TOAST_MS });
  }
}

function commit(next, { rerender = true } = {}) {
  state = next;
  persist();
  if (rerender) {
    render();
  }
}

function catchUp() {
  const result = catchUpAllowances(state, today);
  if (result.state === state) {
    return;
  }
  state = result.state;
  persist();
  if (result.added === 1) {
    showToast('Yeni harçlığın eklendi');
  } else if (result.added > 1) {
    showToast(`${result.added} harçlık eklendi`);
  }
}

function refreshDay() {
  const now = toISODate(new Date());
  if (now === today) {
    return;
  }
  today = now;
  catchUp();
  render();
}

function go(view) {
  ui.view = view;
  ui.historyStart = null;
  render();
  window.scrollTo(0, 0);
}

function addEntry({ type = 'expense', category = null } = {}) {
  openEntrySheet({
    type,
    category,
    today,
    defaultExpenseCategory: lastExpenseCategory(state.entries),
    onSave: (values) => {
      commit({ ...state, entries: [...state.entries, createEntry(values)] });
      showToast(values.type === 'expense'
        ? `${formatMoney(values.amount)} harcama eklendi`
        : `${formatMoney(values.amount)} gelir eklendi`);
    }
  });
}

function editEntry(entry) {
  openEntrySheet({
    entry,
    today,
    defaultExpenseCategory: lastExpenseCategory(state.entries),
    onSave: (values) => {
      commit({ ...state, entries: state.entries.map((item) => (item.id === entry.id ? { ...item, ...values, note: normalizeNote(values.note) } : item)) });
      showToast('Kayıt güncellendi');
    },
    onDelete: () => deleteEntry(entry)
  });
}

function deleteEntry(entry) {
  commit({ ...state, entries: state.entries.filter((item) => item.id !== entry.id) });
  showToast('Kayıt silindi', {
    action: {
      label: 'Geri al',
      run: () => {
        const others = state.entries.filter((item) => item.id !== entry.id);
        commit({ ...state, entries: [...others, entry] });
      }
    }
  });
}

function completeSetup({ paydays, balance }) {
  commit(setupState({ paydays, balance, today }));
  ui.view = 'summary';
  showToast('Hazırsın. Harcadıkça + ile ekle.');
}

function savePlan(paydays) {
  commit(updatePlan(state, paydays, today));
  showToast('Plan kaydedildi');
}

function setCarryOver(carryOver) {
  // No re-render: it would reset half-typed plan fields on the same screen.
  commit({ ...state, settings: { ...state.settings, carryOver } }, { rerender: false });
  showToast(carryOver ? 'Artan para sonraki döneme geçecek' : 'Her dönem sıfırdan başlayacak');
}

async function exportData() {
  const filename = `harclik-yedek-${today}.json`;
  const file = new File([exportBackup(state)], filename, { type: 'application/json' });
  // On iPhone the share sheet is the natural way to put a file into Files or iCloud Drive.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Harçlık yedeği' });
      return;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.warn('Paylaşım açılamadı, dosya indiriliyor', error);
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: filename, class: 'visually-hidden' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
  showToast('Yedek indirildi');
}

async function importFile(file) {
  let text;
  try {
    text = await file.text();
  } catch (error) {
    console.warn('Yedek dosyası okunamadı', error);
    showToast('Dosya okunamadı.', { tone: 'error' });
    return;
  }
  const result = importBackup(text);
  if (!result.ok) {
    showToast(result.error, { tone: 'error', duration: LONG_TOAST_MS });
    return;
  }
  // Native confirm is the most reliable modal inside an iOS home screen web app.
  if (state.settings.setupDone && !window.confirm('Yedek yüklensin mi? Bu telefondaki mevcut kayıtların yerini alacak.')) {
    return;
  }
  state = result.state;
  catchUp();
  commit(state);
  go('summary');
  const skippedNote = result.skipped > 0 ? ` (${result.skipped} kayıt okunamadı)` : '';
  showToast(`Yedek yüklendi: ${result.state.entries.length} kayıt${skippedNote}`);
}

function resetAll() {
  if (!window.confirm('Tüm kayıtlar ve ayarlar silinecek. Bu geri alınamaz. Devam edilsin mi?')) {
    return;
  }
  commit(emptyState());
  discardSetAside(storage);
  go('summary');
}

function render() {
  const inSetup = !state.settings.setupDone;
  const showTabbar = !inSetup && ui.view !== 'settings';
  tabbar.hidden = !showTabbar;
  root.classList.toggle('has-tabbar', showTabbar);

  let view;
  if (inSetup) {
    view = renderSetup({ today, onComplete: completeSetup, onImport: importFile });
  } else {
    const periods = buildPeriods(state, today);
    if (ui.view === 'history') {
      view = renderHistory({
        periods,
        start: ui.historyStart,
        today,
        onSelect: (start) => {
          ui.historyStart = start;
          render();
        },
        onOpenEntry: editEntry
      });
    } else if (ui.view === 'settings') {
      view = renderSettings({
        settings: state.settings,
        onBack: () => go('summary'),
        onSavePlan: savePlan,
        onCarryOver: setCarryOver,
        onExport: exportData,
        onImport: importFile,
        onReset: resetAll
      });
    } else {
      view = renderSummary({
        periods,
        today,
        settings: state.settings,
        onOpenEntry: editEntry,
        onAddAllowance: () => addEntry({ type: 'income', category: ALLOWANCE_CATEGORY }),
        onShowHistory: () => go('history'),
        onOpenSettings: () => go('settings')
      });
    }
  }

  root.replaceChildren(view);
  for (const tab of tabbar.querySelectorAll('[data-view]')) {
    if (tab.dataset.view === ui.view) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
}

function registerServiceWorker() {
  // Service workers need HTTPS (or localhost); on a plain LAN address the app still works online.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return;
  }
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('Çevrimdışı mod açılamadı', error);
  });
}

function requestPersistentStorage() {
  navigator.storage?.persist?.().catch((error) => {
    console.warn('Kalıcı depolama istenemedi', error);
  });
}

function boot() {
  const loaded = loadState(storage);
  state = loaded.state;
  if (loaded.status === 'repaired') {
    // Save the cleaned copy now so the warning does not repeat on every launch.
    persist();
  }
  catchUp();

  document.getElementById('add-button').addEventListener('click', () => addEntry());
  for (const tab of tabbar.querySelectorAll('[data-view]')) {
    tab.addEventListener('click', () => go(tab.dataset.view));
  }
  render();

  if (loaded.status === 'corrupt') {
    showToast('Kayıtlı veriler okunamadı. Yedeğin varsa aşağıdan yükleyebilirsin.', { tone: 'error', duration: LONG_TOAST_MS });
  } else if (loaded.status === 'repaired') {
    showToast('Bazı kayıtlar okunamadı ve atlandı. Gerekirse yedekten geri yükleyebilirsin.', { tone: 'error', duration: LONG_TOAST_MS });
  } else if (loaded.status === 'unavailable') {
    showToast('Bu tarayıcı kayıt yapmaya izin vermiyor; kapatınca veriler kaybolur.', { tone: 'error', duration: LONG_TOAST_MS });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshDay();
    }
  });
  setInterval(refreshDay, DAY_CHECK_INTERVAL_MS);
  registerServiceWorker();
  requestPersistentStorage();
}

boot();
