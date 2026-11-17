// Money is always an integer number of kuruş, so sums never pick up floating point dust.
export const KURUS_PER_LIRA = 100;
const MAX_INTEGER_DIGITS = 7;
const MAX_DECIMALS = 2;
const MINUS = '−';

export const MAX_AMOUNT = 10 ** MAX_INTEGER_DIGITS * KURUS_PER_LIRA - 1;

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const GROUPED = /^\d{1,3}(\.\d{3})+$/;

// Accepts what people actually type: "45", "12,5", "1.250,50", "3.000", "12.5", "₺ 45", "45 TL".
export function parseAmount(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return null;
  }
  const text = String(input).replace(/[\s₺]/g, '').replace(/tl$/i, '');
  if (!/^[\d.,]+$/.test(text)) {
    return null;
  }

  const commas = text.split(',').length - 1;
  const dots = text.split('.').length - 1;
  let integerPart;
  let fractionPart = '';

  if (commas > 1) {
    return null;
  }
  if (commas === 1) {
    [integerPart, fractionPart] = text.split(',');
    if (dots > 0) {
      if (!GROUPED.test(integerPart)) {
        return null;
      }
      integerPart = integerPart.replace(/\./g, '');
    }
  } else if (dots === 1) {
    const [before, after] = text.split('.');
    // "3.000" is three thousand in Turkish; "12.5" is a decimal typed on an English keyboard.
    // So exactly three digits after a lone dot always mean thousands, even in "0.500".
    if (after.length === 3) {
      integerPart = before + after;
    } else {
      integerPart = before;
      fractionPart = after;
    }
  } else if (dots > 1) {
    if (!GROUPED.test(text)) {
      return null;
    }
    integerPart = text.replace(/\./g, '');
  } else {
    integerPart = text;
  }

  if (integerPart === '') {
    integerPart = '0';
  }
  if (!/^\d+$/.test(integerPart) || fractionPart.length > MAX_DECIMALS || !/^\d*$/.test(fractionPart)) {
    return null;
  }
  if (integerPart.replace(/^0+/, '').length > MAX_INTEGER_DIGITS) {
    return null;
  }
  return Number(integerPart) * KURUS_PER_LIRA + Number(fractionPart.padEnd(MAX_DECIMALS, '0'));
}

export function formatAmount(kurus, { cents = 'auto' } = {}) {
  const absolute = Math.abs(Math.round(kurus));
  const lira = Math.floor(absolute / KURUS_PER_LIRA);
  const rest = absolute % KURUS_PER_LIRA;
  const integerText = groupThousands(String(lira));
  const showCents = cents === 'always' || (cents === 'auto' && rest !== 0);
  return showCents ? `${integerText},${String(rest).padStart(MAX_DECIMALS, '0')}` : integerText;
}

export function formatMoney(kurus, { sign = 'auto', cents = 'auto' } = {}) {
  const body = `₺${formatAmount(kurus, { cents })}`;
  if (sign === 'never' || kurus === 0) {
    return body;
  }
  if (kurus < 0) {
    return `${MINUS}${body}`;
  }
  return sign === 'always' ? `+${body}` : body;
}

export function signPrefix(kurus, sign = 'auto') {
  if (sign === 'never' || kurus === 0) {
    return '';
  }
  if (kurus < 0) {
    return MINUS;
  }
  return sign === 'always' ? '+' : '';
}

// Keypad buffer: what the user has typed so far, e.g. "1250,5". Only digits and one comma.
export function pressKey(buffer, key) {
  if (key === 'back') {
    return buffer.slice(0, -1);
  }
  if (key === ',') {
    if (buffer.includes(',')) {
      return buffer;
    }
    return buffer === '' ? '0,' : `${buffer},`;
  }
  if (!/^\d$/.test(key)) {
    return buffer;
  }
  const commaAt = buffer.indexOf(',');
  if (commaAt >= 0) {
    return buffer.length - commaAt - 1 >= MAX_DECIMALS ? buffer : buffer + key;
  }
  if (buffer === '0') {
    return key;
  }
  if (buffer.length >= MAX_INTEGER_DIGITS) {
    return buffer;
  }
  return buffer + key;
}

export function bufferToKurus(buffer) {
  if (!buffer) {
    return 0;
  }
  const [integerPart, fractionPart = ''] = buffer.split(',');
  return Number(integerPart || '0') * KURUS_PER_LIRA
    + Number(fractionPart.padEnd(MAX_DECIMALS, '0').slice(0, MAX_DECIMALS));
}

export function kurusToBuffer(kurus) {
  if (!kurus) {
    return '';
  }
  const lira = Math.floor(kurus / KURUS_PER_LIRA);
  const rest = kurus % KURUS_PER_LIRA;
  if (rest === 0) {
    return String(lira);
  }
  return rest % 10 === 0 ? `${lira},${rest / 10}` : `${lira},${String(rest).padStart(MAX_DECIMALS, '0')}`;
}

export function formatBuffer(buffer) {
  if (!buffer) {
    return '0';
  }
  const [integerPart, fractionPart] = buffer.split(',');
  const grouped = groupThousands(integerPart || '0');
  return fractionPart === undefined ? grouped : `${grouped},${fractionPart}`;
}
