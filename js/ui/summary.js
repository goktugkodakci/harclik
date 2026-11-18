import { nextPayday, periodBudget, planFor } from '../core/budget.js';
import { KEYIF } from '../core/categories.js';
import { calendarParts, diffDays, formatDayMonth, formatRange } from '../core/dates.js';
import { formatAmount, formatMoney } from '../core/money.js';
import { bubble, emptyCard, entryRow, linkButton, moneyEl, ring, sectionHead } from './components.js';
import { h, icon } from './dom.js';

const RECENT_COUNT = 5;
// Above this many characters the number inside the hero ring steps down a size.
const LONG_AMOUNT_CHARS = 6;
const HERO_RING = { size: 196, stroke: 14 };
const TILE_RING = { size: 46, stroke: 5 };

function percent(share) {
  return Math.round(Math.max(0, Math.min(1, share)) * 100);
}

function heroContent(period, budget, settings, onAddAllowance) {
  if (!period.hasAllowance) {
    return {
      tone: 'neutral',
      label: 'Bu dönem için harçlık kaydı yok',
      amount: null,
      sub: 'Harçlığın geldiğinde Gelir > Harçlık olarak ekle; hesap ondan başlar.',
      action: { label: 'Harçlık ekle', run: onAddAllowance }
    };
  }
  if (period.balance < 0) {
    return {
      tone: 'over',
      label: 'Bu dönem eksidesin',
      amount: period.balance,
      caption: 'eksi',
      sub: settings.carryOver
        ? 'Devir açık olduğu için bu eksi bir sonraki harçlıktan düşülecek.'
        : 'Sonraki harçlığa kadar harcamaya ara vermeye çalış.'
    };
  }
  if (budget.keyifBudget < 0) {
    return {
      tone: 'warn',
      label: 'Gerekli harcamalar parayı aşıyor',
      amount: budget.keyifLeft,
      caption: 'keyif yok',
      sub: `Eldeki para ${formatMoney(budget.available)}, gerekli toplam ${formatMoney(budget.plannedTotal)}. Planı küçültmeyi düşün.`
    };
  }
  if (budget.keyifLeft < 0) {
    return {
      tone: 'warn',
      label: 'Keyif bütçesini aştın',
      amount: budget.keyifLeft,
      caption: 'aşıldı',
      sub: `Gerekli harcamalara ayırdığın paradan ${formatMoney(-budget.keyifLeft)} kullandın.`
    };
  }
  let sub = `${formatMoney(budget.keyifBudget)} keyif bütçenden ${formatMoney(budget.keyifSpent + budget.overrun)} kullandın`;
  if (budget.plannedTotal === 0) {
    sub = 'Henüz gerekli harcama ayırmadın; paranın hepsi keyif sayılıyor.';
  }
  const share = budget.keyifBudget > 0 ? budget.keyifLeft / budget.keyifBudget : 0;
  return {
    tone: 'ok',
    label: 'Keyif için kalan',
    amount: budget.keyifLeft,
    share,
    caption: `kalan %${percent(share)}`,
    sub,
    note: budget.overrun > 0 ? `Gerekli bölümlerde planı ${formatMoney(budget.overrun)} aştın; fark keyiften düştü.` : null
  };
}

// How this period's money is split: every planned section, then keyif.
function splitBar(budget) {
  const keyif = Math.max(0, budget.keyifBudget);
  const total = budget.plannedTotal + keyif;
  if (total <= 0 || budget.sections.length === 0) {
    return null;
  }
  const parts = [
    ...budget.sections.filter((section) => section.planned > 0).map((section) => ({ name: section.name, amount: section.planned, color: section.color })),
    ...(keyif > 0 ? [{ name: KEYIF.label, amount: keyif, color: 'var(--split-keyif)' }] : [])
  ];
  const description = parts.map((part) => `${part.name} ${formatMoney(part.amount)}`).join(', ');
  return h(
    'div',
    { class: 'split' },
    h('div', { class: 'split-bar', role: 'img', 'aria-label': `Paranın bölünüşü: ${description}` }, parts.map((part) => h('span', {
      style: { '--w': `${(part.amount / total) * 100}%`, '--c': part.color }
    }))),
    h(
      'div',
      { class: 'split-legend' },
      h('span', {}, 'Gerekli ', moneyEl(budget.plannedTotal)),
      h('span', {}, 'Keyif ', moneyEl(keyif))
    )
  );
}

function hero(content, budget) {
  const { tone, label, amount, sub, note = null, action = null, caption = null, share = 0 } = content;
  const amountText = amount === null ? '' : formatAmount(amount);
  return h(
    'section',
    { class: 'hero', 'data-tone': tone, 'aria-label': label },
    h('p', { class: 'hero-label' }, label),
    amount === null
      ? null
      : ring({
        ...HERO_RING,
        value: share,
        className: 'hero-ring',
        label: `${label}: ${formatMoney(amount)}`,
        content: [
          h('span', { class: amountText.length > LONG_AMOUNT_CHARS ? 'hero-amount is-long' : 'hero-amount' }, moneyEl(amount)),
          caption ? h('span', { class: 'hero-caption' }, caption) : null
        ]
      }),
    h('p', { class: 'hero-sub' }, sub),
    note ? h('p', { class: 'hero-note' }, note) : null,
    tone === 'neutral' ? null : splitBar(budget),
    action ? h('button', { type: 'button', class: 'btn btn-on-hero', onClick: action.run }, action.label) : null
  );
}

function paydayCard(next, period, today) {
  if (!next) {
    return null;
  }
  const parts = calendarParts(next.date);
  const daysLeft = diffDays(next.date, today);
  const totalDays = diffDays(period.end, period.start) + 1;
  const dayOfPeriod = Math.min(totalDays, Math.max(1, diffDays(today, period.start) + 1));
  return h(
    'section',
    { class: 'card payday-card', 'aria-label': 'Sonraki harçlık' },
    h('div', { class: 'calendar', 'aria-hidden': 'true' }, h('span', { class: 'calendar-month' }, parts.monthShort), h('span', { class: 'calendar-day' }, parts.day)),
    h(
      'div',
      { class: 'payday-info' },
      h('p', { class: 'payday-kicker' }, 'Sonraki harçlık'),
      h('p', { class: 'payday-when' }, daysLeft === 1 ? 'Yarın' : `${daysLeft} gün sonra`),
      h('p', { class: 'payday-detail' }, moneyEl(next.amount), ` · ${formatDayMonth(next.date)} ${parts.weekday}`),
      h(
        'div',
        { class: 'period-progress' },
        h('span', { class: 'period-track', 'aria-hidden': 'true' }, h('span', { style: { '--fill': `${(dayOfPeriod / totalDays) * 100}%` } })),
        h('span', { class: 'period-label' }, `Dönemin ${dayOfPeriod}. günü / ${totalDays}`)
      )
    )
  );
}

function sectionTile(section, onAddTo) {
  const over = section.spent > section.planned;
  let share = 0;
  if (section.planned > 0) {
    share = section.spent / section.planned;
  } else if (section.spent > 0) {
    share = 1;
  }
  return h(
    'button',
    {
      type: 'button',
      class: over ? 'tile is-over' : 'tile',
      style: { '--c': section.color },
      'aria-label': `${section.name}: ${formatMoney(section.planned)} ayrıldı, ${formatMoney(section.spent)} harcandı. Harcama ekle`,
      onClick: () => onAddTo(section.id)
    },
    h(
      'span',
      { class: 'tile-top' },
      bubble(section.info),
      ring({ ...TILE_RING, value: share, className: 'tile-ring', content: h('span', { class: 'tile-pct' }, `${percent(share)}`) })
    ),
    h('span', { class: 'tile-name' }, section.name),
    over
      ? h('span', { class: 'tile-left' }, moneyEl(section.spent - section.planned), h('small', {}, ' aştı'))
      : h('span', { class: 'tile-left' }, moneyEl(section.planned - section.spent), h('small', {}, ' kaldı')),
    h('span', { class: 'tile-sub' }, moneyEl(section.spent), ' / ', moneyEl(section.planned))
  );
}

function needsSection(budget, { onAddTo, onEditPlan }) {
  if (budget.sections.length === 0) {
    return [
      sectionHead('Gerekli'),
      emptyCard(
        'Gerekli harcamalarını yaz',
        'Yemek, ulaşım, telefon... Her harçlıktan bunlara ne kadar ayırdığını yaz; kalanı keyif paran olarak görürsün.',
        h('button', { type: 'button', class: 'btn btn-primary empty-action', onClick: onEditPlan }, 'Gerekli harcamaları yaz')
      )
    ];
  }
  return [
    sectionHead('Gerekli', linkButton('Düzenle', onEditPlan)),
    h(
      'div',
      { class: 'tiles' },
      budget.sections.map((section) => sectionTile(section, onAddTo)),
      h('button', { type: 'button', class: 'tile tile-add', onClick: onEditPlan }, icon('plus'), h('span', {}, 'Bölüm ekle'))
    )
  ];
}

export function renderSummary({
  periods,
  today,
  settings,
  sections,
  plans,
  describe,
  onOpenEntry,
  onAddAllowance,
  onAddTo,
  onEditPlan,
  onShowHistory,
  onOpenSettings
}) {
  const period = periods[periods.length - 1];
  const raw = periodBudget(period, planFor(plans, period), sections);
  const budget = { ...raw, sections: raw.sections.map((section) => ({ ...section, info: describe(section.id) })) };
  const recent = period.entries.slice(0, RECENT_COUNT);

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'topbar' },
      h('div', {}, h('h1', { class: 'title' }, 'Harçlık'), h('p', { class: 'subtitle' }, `${formatRange(period.start, period.end, today)} dönemi`)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ayarlar', onClick: onOpenSettings }, icon('settings'))
    ),
    hero(heroContent(period, budget, settings, onAddAllowance), budget),
    paydayCard(nextPayday(settings.paydays, today), period, today),
    needsSection(budget, { onAddTo, onEditPlan }),
    sectionHead('Bu dönem', period.entries.length > 0 ? linkButton('Tümü', onShowHistory) : null),
    recent.length > 0
      ? h('ul', { class: 'list' }, recent.map((entry) => entryRow(entry, { today, sections, showDate: true, onOpen: onOpenEntry })))
      : emptyCard('Bu dönemde henüz kayıt yok', 'Bir şey harcadığında ortadaki + düğmesiyle ekle.')
  );
}
