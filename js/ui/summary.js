import { todayStatus } from '../core/budget.js';
import { addDays, diffDays, formatDayMonth } from '../core/dates.js';
import { formatAmount, formatMoney } from '../core/money.js';
import { emptyCard, entryRow, linkButton, moneyEl, sectionHead } from './components.js';
import { h, icon } from './dom.js';

const RECENT_COUNT = 5;
// Above this many characters the hero number steps down a size so it never wraps.
const LONG_AMOUNT_CHARS = 7;
const PACE_TEXT = { ok: 'Tempon iyi', fast: 'Biraz hızlı gidiyorsun', over: 'Bütçeyi aştın' };

function percent(share) {
  return `%${Math.round(share * 100)}`;
}

function heroContent(period, status, settings, onAddAllowance) {
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
      sub: settings.carryOver
        ? 'Devir açık olduğu için bu eksi bir sonraki harçlıktan düşülecek.'
        : 'Sonraki harçlığa kadar harcamaya ara vermeye çalış.'
    };
  }
  if (status.leftToday < 0) {
    return {
      tone: 'warn',
      label: 'Bugünkü limiti aştın',
      amount: status.leftToday,
      sub: `Yarından itibaren günde ${formatMoney(status.tomorrowLimit)} harcayabilirsin.`
    };
  }
  let sub = `Sonraki harçlığa kadar günde ${formatMoney(status.dailyLimit)}`;
  if (status.daysLeft === 1) {
    sub = 'Dönemin son günü; kalan paranın hepsi bugünün.';
  } else if (status.spentToday > 0) {
    sub = `Günlük limitin ${formatMoney(status.dailyLimit)} · bugün ${formatMoney(status.spentToday)} harcadın`;
  }
  return { tone: 'ok', label: 'Bugün harcayabileceğin', amount: status.leftToday, sub };
}

function hero({ tone, label, amount, sub, action = null }) {
  const isLong = amount !== null && formatAmount(amount).length > LONG_AMOUNT_CHARS;
  return h(
    'section',
    { class: 'hero', 'data-tone': tone, 'aria-label': label },
    h('p', { class: 'hero-label' }, label),
    amount === null ? null : h('p', { class: isLong ? 'hero-amount is-long' : 'hero-amount' }, moneyEl(amount)),
    h('p', { class: 'hero-sub' }, sub),
    action ? h('button', { type: 'button', class: 'btn btn-on-hero', onClick: action.run }, action.label) : null
  );
}

function periodCard(period, status) {
  const fill = Math.min(1, Math.max(0, status.spentShare));
  const details = [`Gelen ${formatMoney(period.income)}`, `Harcanan ${formatMoney(period.spent)}`];
  if (period.carryIn !== 0) {
    details.push(`Devreden ${formatMoney(period.carryIn, { sign: 'always' })}`);
  }
  return h(
    'section',
    { class: 'card period-card', 'aria-label': 'Dönem durumu' },
    h('div', { class: 'stat-row' }, h('span', { class: 'stat-label' }, 'Dönemde kalan'), moneyEl(period.balance, { className: 'stat-value' })),
    h(
      'div',
      {
        class: 'meter',
        'data-pace': status.pace,
        role: 'img',
        'aria-label': `Geçen süre ${percent(status.timeShare)}, harcanan ${percent(status.spentShare)}`,
        style: { '--fill': `${fill * 100}%`, '--mark': `${status.timeShare * 100}%` }
      },
      h('span', { class: 'meter-fill' }),
      h('span', { class: 'meter-mark' })
    ),
    h(
      'div',
      { class: 'meter-caption' },
      h('span', {}, `Gün ${status.elapsedDays}/${status.totalDays}`),
      h('span', {}, `${percent(status.spentShare)} harcandı`)
    ),
    h('p', { class: 'pill', 'data-tone': status.pace }, PACE_TEXT[status.pace]),
    h('p', { class: 'period-detail' }, details.join(' · '))
  );
}

export function renderSummary({ periods, today, settings, onOpenEntry, onAddAllowance, onShowHistory, onOpenSettings }) {
  const period = periods[periods.length - 1];
  const status = todayStatus(period, today);
  const nextPayday = addDays(period.end, 1);
  const daysToNext = diffDays(nextPayday, today);
  const recent = period.entries.slice(0, RECENT_COUNT);

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'topbar' },
      h('h1', { class: 'title' }, 'Harçlık'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ayarlar', onClick: onOpenSettings }, icon('settings'))
    ),
    h('p', { class: 'subtitle' }, `Sonraki harçlık ${formatDayMonth(nextPayday)} · ${daysToNext === 1 ? 'yarın' : `${daysToNext} gün sonra`}`),
    hero(heroContent(period, status, settings, onAddAllowance)),
    period.hasAllowance ? periodCard(period, status) : null,
    sectionHead('Bu dönem', period.entries.length > 0 ? linkButton('Tümü', onShowHistory) : null),
    recent.length > 0
      ? h('ul', { class: 'list' }, recent.map((entry) => entryRow(entry, { today, showDate: true, onOpen: onOpenEntry })))
      : emptyCard('Bu dönemde henüz kayıt yok', 'Bir şey harcadığında ortadaki + düğmesiyle ekle.')
  );
}
