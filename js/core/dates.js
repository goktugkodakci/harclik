// All dates in the app are local calendar days ("YYYY-MM-DD"). An expense belongs to a day,
// not to an instant, so arithmetic runs on UTC midnights and never sees DST shifts.
const DAY_MS = 86_400_000;

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// The Turkish suffix follows how the number is read aloud: bir'i, iki'si, on'u, yirmi'si.
const DIGIT_SUFFIX = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
const TENS_SUFFIX = { 10: 'u', 20: 'si', 30: 'u' };

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function makeISODate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function toISODate(date) {
  return makeISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUTC(iso) {
  const { year, month, day } = parseISODate(iso);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms) {
  const date = new Date(ms);
  return makeISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(iso, days) {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

export function diffDays(later, earlier) {
  return Math.round((toUTC(later) - toUTC(earlier)) / DAY_MS);
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const { year, month, day } = parseISODate(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function formatDayMonth(iso, { short = false, withYear = false } = {}) {
  const { year, month, day } = parseISODate(iso);
  const name = (short ? MONTHS_SHORT : MONTHS)[month - 1];
  return withYear ? `${day} ${name} ${year}` : `${day} ${name}`;
}

function weekdayName(iso) {
  return WEEKDAYS[new Date(toUTC(iso)).getUTCDay()];
}

export function formatDayHeading(iso, today) {
  const ago = diffDays(today, iso);
  if (ago === 0) {
    return 'Bugün';
  }
  if (ago === 1) {
    return 'Dün';
  }
  const withYear = iso.slice(0, 4) !== today.slice(0, 4);
  return `${formatDayMonth(iso, { withYear })} ${weekdayName(iso)}`;
}

export function formatRange(start, end, today) {
  const year = today.slice(0, 4);
  const withYear = start.slice(0, 4) !== year || end.slice(0, 4) !== year;
  return `${formatDayMonth(start, { short: true, withYear })} – ${formatDayMonth(end, { short: true, withYear })}`;
}

export function dayWithSuffix(day) {
  const suffix = day % 10 === 0 ? TENS_SUFFIX[day] : DIGIT_SUFFIX[day % 10];
  return `${day}'${suffix}`;
}
