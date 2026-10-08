import { describe, it, expect } from 'vitest';
import {
  fmt, uid, catInfo,
  gastosByMonth, ingresosByMonth, totalGastosMonth, totalIngresosMonth,
  cashGastosByMonth, creditGastosByMonth, cardPaymentsByMonth,
  totalCashGastosMonth, totalCreditGastosMonth, totalCardPaymentsMonth,
  getCardDebtAtEnd, getCardDebtAtStart, getCardBalanceAtEnd, totalBudgetMonth, gastoByCat,
  sanitizeText, sanitizeImporte, sanitizeMes, sanitizeEnum,
  normalizeText, matchesQuery, sortRecords, SORT_MODES,
  validateBudgetUpdate, validateMetaAhorro, validateGasto, validateIngreso,
  MAX_BUDGET_AMOUNT, META_TIPOS,
} from '../utils.js';
import { ALL_CATS, MESES } from '../constants.js';

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const stateWith = (gastos = [], ingresos = [], budgets = {}) => ({ gastos, ingresos, budgets });

describe('fmt', () => {
  it('returns $0 for undefined, null and NaN', () => {
    expect(fmt(undefined)).toBe('$0');
    expect(fmt(null)).toBe('$0');
    expect(fmt(NaN)).toBe('$0');
    expect(fmt('abc')).toBe('$0');
  });

  it('rounds to the nearest integer before formatting', () => {
    expect(fmt(1234.4)).toBe('$1.234');
    expect(fmt(1234.5)).toBe('$1.235');
  });

  it('formats sub-integer values down to $0', () => {
    expect(fmt(0.4)).toBe('$0');
  });

  it('uses es-AR thousand separators', () => {
    expect(fmt(1000)).toBe('$1.000');
    expect(fmt(123456789)).toBe('$123.456.789');
  });

  it('keeps a minus sign for negative balances', () => {
    expect(fmt(-5000)).toBe('$-5.000');
  });

  it('coerces numeric strings', () => {
    expect(fmt('2000')).toBe('$2.000');
  });
});

describe('uid', () => {
  it('returns a non-empty string', () => {
    expect(typeof uid()).toBe('string');
    expect(uid().length).toBeGreaterThan(0);
  });

  it('produces unique values in rapid succession', () => {
    const ids = Array.from({ length: 500 }, () => uid());
    expect(new Set(ids).size).toBe(500);
  });
});

describe('catInfo', () => {
  it('returns metadata for a known category', () => {
    const info = catInfo('alimentacion');
    expect(info.label).toBe('Alimentación');
    expect(info.icon).toBe('🛒');
  });

  it('resolves every category declared in ALL_CATS', () => {
    for (const c of ALL_CATS) {
      expect(catInfo(c.key)).toBe(c);
    }
  });

  it('falls back to a generic entry for an unknown key', () => {
    expect(catInfo('no_existe')).toEqual({ label: 'no_existe', icon: '📦', color: '#888' });
  });
});

describe('month queries', () => {
  const state = stateWith([
    gasto({ id: '1', mes: 0, importe: 100 }),
    gasto({ id: '2', mes: 0, importe: 50 }),
    gasto({ id: '3', mes: 1, importe: 25 }),
  ]);

  it('filters gastos by month', () => {
    expect(gastosByMonth(state, 0).map(g => g.id)).toEqual(['1', '2']);
    expect(gastosByMonth(state, 1).map(g => g.id)).toEqual(['3']);
    expect(gastosByMonth(state, 5)).toEqual([]);
  });

  it('sums gastos by month', () => {
    expect(totalGastosMonth(state, 0)).toBe(150);
    expect(totalGastosMonth(state, 1)).toBe(25);
    expect(totalGastosMonth(state, 5)).toBe(0);
  });

  it('treats a missing importe as 0 in totals', () => {
    const s = stateWith([gasto({ importe: undefined })]);
    expect(totalGastosMonth(s, 0)).toBe(0);
  });

  it('filters and sums ingresos by month', () => {
    const s = stateWith([], [
      { id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo' },
      { id: 'i2', descripcion: 'Freelance', importe: 500, mes: 1, tipo: 'freelance' },
    ]);
    expect(ingresosByMonth(s, 0)).toHaveLength(1);
    expect(totalIngresosMonth(s, 0)).toBe(1000);
    expect(totalIngresosMonth(s, 1)).toBe(500);
  });

  it('returns 0 for a month with no data', () => {
    expect(totalGastosMonth(state, 9)).toBe(0);
    expect(totalIngresosMonth(state, 9)).toBe(0);
  });
});

describe('credit card & cash split', () => {
  const state = stateWith([
    gasto({ id: 'a', importe: 100, medio: 'efectivo', categoria: 'alimentacion' }),
    gasto({ id: 'b', importe: 200, medio: 'credito',   categoria: 'alimentacion' }),
    gasto({ id: 'c', importe: 300, medio: 'debito',    categoria: 'servicios' }),
    gasto({ id: 'd', importe: 400, medio: 'credito',   categoria: 'pay_card' }),
  ]);

  it('treats every non-credit medio as cash', () => {
    expect(cashGastosByMonth(state, 0).map(g => g.id)).toEqual(['a', 'c']);
    expect(totalCashGastosMonth(state, 0)).toBe(400);
  });

  it('collects credit purchases', () => {
    expect(creditGastosByMonth(state, 0).map(g => g.id)).toEqual(['b', 'd']);
    expect(totalCreditGastosMonth(state, 0)).toBe(600);
  });

  it('collects card payments via the pay_card category', () => {
    expect(cardPaymentsByMonth(state, 0).map(g => g.id)).toEqual(['d']);
    expect(totalCardPaymentsMonth(state, 0)).toBe(400);
  });

  it('does not treat a debit purchase as a card payment', () => {
    expect(totalCardPaymentsMonth(state, 0)).not.toBe(700);
  });
});

describe('getCardDebtAtEnd', () => {
  it('is 0 when there are no transactions', () => {
    expect(getCardDebtAtEnd(stateWith(), 0)).toBe(0);
  });

  it('sums credit purchases of the month', () => {
    const s = stateWith([
      gasto({ importe: 500, medio: 'credito' }),
      gasto({ importe: 200, medio: 'efectivo' }),
    ]);
    expect(getCardDebtAtEnd(s, 0)).toBe(500);
  });

  it('accumulates debt across months', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 500, medio: 'credito' }),
      gasto({ id: '2', mes: 1, importe: 300, medio: 'credito' }),
    ]);
    expect(getCardDebtAtEnd(s, 0)).toBe(500);
    expect(getCardDebtAtEnd(s, 1)).toBe(800);
  });

  it('subtracts pay_card payments in the same month', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 500, medio: 'credito', categoria: 'salidas' }),
      gasto({ id: '2', mes: 0, importe: 200, medio: 'debito',  categoria: 'pay_card' }),
    ]);
    expect(getCardDebtAtEnd(s, 0)).toBe(300);
  });

  it('never reports negative debt (a credit balance is clamped away)', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
    ]);
    expect(getCardDebtAtEnd(s, 0)).toBe(0);
  });

  it('ignores cash expenses entirely', () => {
    const s = stateWith([gasto({ importe: 10_000, medio: 'efectivo' })]);
    expect(getCardDebtAtEnd(s, 0)).toBe(0);
  });

  it('carries an overpayment forward as credit instead of discarding it', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
      gasto({ id: '3', mes: 1, importe: 100, medio: 'credito' }),
    ]);
    expect(getCardDebtAtEnd(s, 0)).toBe(0);
    // The 400 surplus from month 0 offsets month 1's purchase.
    expect(getCardDebtAtEnd(s, 1)).toBe(0);
  });
});

describe('getCardBalanceAtEnd', () => {
  it('is 0 when there are no transactions', () => {
    expect(getCardBalanceAtEnd(stateWith(), 0)).toBe(0);
  });

  it('equals the debt when the card has never been overpaid', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 500, medio: 'credito' }),
      gasto({ id: '2', mes: 1, importe: 300, medio: 'credito' }),
    ]);
    expect(getCardBalanceAtEnd(s, 1)).toBe(800);
    expect(getCardBalanceAtEnd(s, 1)).toBe(getCardDebtAtEnd(s, 1));
  });

  it('reports a negative balance when the card was overpaid', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
    ]);
    expect(getCardBalanceAtEnd(s, 0)).toBe(-400);
  });

  it('lets a credit balance offset a later purchase', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
      gasto({ id: '3', mes: 1, importe: 250, medio: 'credito' }),
    ]);
    // -400 credit, then +250 of purchases => still in credit.
    expect(getCardBalanceAtEnd(s, 1)).toBe(-150);
  });

  it('goes back into debt once the credit is exhausted', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
      gasto({ id: '3', mes: 1, importe: 900, medio: 'credito' }),
    ]);
    expect(getCardBalanceAtEnd(s, 1)).toBe(500);
    expect(getCardDebtAtEnd(s, 1)).toBe(500);
  });

  it('accumulates credit across several overpayments', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 200, medio: 'debito', categoria: 'pay_card' }),
      gasto({ id: '2', mes: 1, importe: 300, medio: 'debito', categoria: 'pay_card' }),
    ]);
    expect(getCardBalanceAtEnd(s, 0)).toBe(-200);
    expect(getCardBalanceAtEnd(s, 1)).toBe(-500);
  });

  it('reports the balance at a past month, not the final one', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 100, medio: 'credito' }),
      gasto({ id: '2', mes: 5, importe: 700, medio: 'credito' }),
    ]);
    expect(getCardBalanceAtEnd(s, 0)).toBe(100);
    expect(getCardBalanceAtEnd(s, 5)).toBe(800);
  });
});

describe('getCardDebtAtStart', () => {
  it('is 0 for the first month', () => {
    expect(getCardDebtAtStart(stateWith(), 0)).toBe(0);
  });

  it('mirrors the previous month end', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 500, medio: 'credito' }),
      gasto({ id: '2', mes: 1, importe: 250, medio: 'credito' }),
    ]);
    expect(getCardDebtAtStart(s, 1)).toBe(500);
    expect(getCardDebtAtStart(s, 2)).toBe(750);
  });

  it('is 0 when the previous month closed in credit', () => {
    const s = stateWith([
      gasto({ id: '1', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
    ]);
    expect(getCardDebtAtStart(s, 1)).toBe(0);
  });
});

describe('totalBudgetMonth', () => {
  it('sums all budget categories of a month', () => {
    const s = stateWith([], [], { 0: { vivienda: 100, servicios: 50 } });
    expect(totalBudgetMonth(s, 0)).toBe(150);
  });

  it('returns 0 when the month has no budget entry', () => {
    expect(totalBudgetMonth(stateWith([], [], { 0: { vivienda: 10 } }), 5)).toBe(0);
  });

  it('treats null values as 0', () => {
    expect(totalBudgetMonth(stateWith([], [], { 0: { vivienda: null } }), 0)).toBe(0);
  });
});

describe('gastoByCat', () => {
  const s = stateWith([
    gasto({ id: '1', mes: 0, categoria: 'alimentacion', importe: 100 }),
    gasto({ id: '2', mes: 0, categoria: 'alimentacion', importe: 50 }),
    gasto({ id: '3', mes: 0, categoria: 'salidas', importe: 999 }),
    gasto({ id: '4', mes: 1, categoria: 'alimentacion', importe: 7 }),
  ]);

  it('sums a single category for one month', () => {
    expect(gastoByCat(s, 0, 'alimentacion')).toBe(150);
  });

  it('does not mix months', () => {
    expect(gastoByCat(s, 1, 'alimentacion')).toBe(7);
  });

  it('returns 0 for a category with no expenses', () => {
    expect(gastoByCat(s, 0, 'mascotas')).toBe(0);
  });

  it('treats a missing importe as 0 instead of poisoning the sum with NaN', () => {
    const bad = stateWith([gasto({ categoria: 'salidas', importe: undefined })]);
    expect(gastoByCat(bad, 0, 'salidas')).toBe(0);
  });

  it('keeps a good sum when one entry in the category is malformed', () => {
    const mixed = stateWith([
      gasto({ id: '1', categoria: 'salidas', importe: 100 }),
      gasto({ id: '2', categoria: 'salidas', importe: undefined }),
      gasto({ id: '3', categoria: 'salidas', importe: 50 }),
    ]);
    expect(gastoByCat(mixed, 0, 'salidas')).toBe(150);
  });
});

describe('normalizeText', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeText('Café')).toBe('cafe');
    expect(normalizeText('ALIMENTACIÓN')).toBe('alimentacion');
  });

  it('trims the outer whitespace', () => {
    expect(normalizeText('  Supermercado  ')).toBe('supermercado');
  });

  it('collapses the eñe, which NFD splits into n + tilde', () => {
    expect(normalizeText('Añejo')).toBe('anejo');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(normalizeText(42)).toBe('42');
    expect(normalizeText(true)).toBe('true');
  });
});

describe('matchesQuery', () => {
  it('matches everything when the query is empty or only whitespace', () => {
    expect(matchesQuery('', 'Café')).toBe(true);
    expect(matchesQuery('   ', 'Café')).toBe(true);
    expect(matchesQuery(null, 'Café')).toBe(true);
  });

  it('ignores case and accents in both directions', () => {
    expect(matchesQuery('cafe', 'Café con leche')).toBe(true);
    expect(matchesQuery('CAFÉ', 'café con leche')).toBe(true);
    expect(matchesQuery('supér', 'Super Coto')).toBe(true);
  });

  it('requires every word to appear, in any order', () => {
    expect(matchesQuery('coto super', 'Super Coto')).toBe(true);
    expect(matchesQuery('super coto', 'Super Coto')).toBe(true);
    expect(matchesQuery('coto pan', 'Super Coto')).toBe(false);
  });

  it('matches across fields', () => {
    expect(matchesQuery('salidas', 'Cena', 'Salidas')).toBe(true);
    expect(matchesQuery('cena salidas', 'Cena', 'Salidas')).toBe(true);
    expect(matchesQuery('cena Mascotas', 'Cena', 'Salidas')).toBe(false);
  });

  it('matches a substring of a word', () => {
    expect(matchesQuery('per', 'Super Coto')).toBe(true);
  });

  it('treats missing fields as empty text', () => {
    expect(matchesQuery('cena', 'Cena')).toBe(true);
    expect(matchesQuery('cena', null, undefined)).toBe(false);
  });
});

describe('sortRecords', () => {
  // El array de entrada está en orden de carga, así que la base de todos los
  // modos es el inverso: lo último cargado primero.
  const recs = [
    { id: 'a', importe: 3000, categoria: 'alimentacion' },
    { id: 'b', importe: 12000, categoria: 'alimentacion' },
    { id: 'c', importe: 5000, categoria: 'salidas' },
  ];
  const ids = (list) => list.map(r => r.id);

  it('recientes returns a reversed copy without sorting', () => {
    expect(ids(sortRecords(recs, 'recientes'))).toEqual(['c', 'b', 'a']);
  });

  it('monto-desc sorts by importe, biggest first', () => {
    expect(ids(sortRecords(recs, 'monto-desc'))).toEqual(['b', 'c', 'a']);
  });

  it('monto-asc sorts by importe, smallest first', () => {
    expect(ids(sortRecords(recs, 'monto-asc'))).toEqual(['a', 'c', 'b']);
  });

  it('keeps the most recent first when the importe ties', () => {
    const tied = [{ id: 'x', importe: 100 }, { id: 'y', importe: 100 }, { id: 'z', importe: 100 }];
    expect(ids(sortRecords(tied, 'monto-desc'))).toEqual(['z', 'y', 'x']);
    expect(ids(sortRecords(tied, 'monto-asc'))).toEqual(['z', 'y', 'x']);
  });

  it('categoria sorts by the given label, alphabetically', () => {
    const label = (r) => catInfo(r.categoria).label;
    expect(ids(sortRecords(recs, 'categoria', label))).toEqual(['b', 'a', 'c']);
  });

  it('categoria without a label function falls back to recientes', () => {
    expect(ids(sortRecords(recs, 'categoria'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortRecords(recs, 'categoria', 'no soy función'))).toEqual(['c', 'b', 'a']);
  });

  it('carga keeps the load order as-is', () => {
    expect(ids(sortRecords(recs, 'carga'))).toEqual(['a', 'b', 'c']);
  });

  it('an unknown mode falls back to recientes instead of throwing', () => {
    expect(ids(sortRecords(recs, 'por-dios'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortRecords(recs, undefined))).toEqual(['c', 'b', 'a']);
  });

  it('never mutates the input array', () => {
    const input = [...recs];
    sortRecords(input, 'monto-desc');
    sortRecords(input, 'categoria', (r) => r.categoria);
    expect(input).toEqual(recs);
    expect(input.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not choke on a missing or non-numeric importe', () => {
    const broken = [{ id: 'a' }, { id: 'b', importe: 50 }, { id: 'c', importe: undefined }];
    expect(ids(sortRecords(broken, 'monto-desc'))).toEqual(['b', 'c', 'a']);
    // a y c valen 0: empatan y el desempate conserva "más reciente primero".
    expect(ids(sortRecords(broken, 'monto-asc'))).toEqual(['c', 'a', 'b']);
  });

  it('handles an empty list', () => {
    expect(sortRecords([], 'monto-desc')).toEqual([]);
  });
});

describe('SORT_MODES', () => {
  it('lists the modes the UI offers, including the no-sort one', () => {
    expect(SORT_MODES).toEqual(['recientes', 'monto-desc', 'monto-asc', 'categoria', 'carga']);
  });

  it('every mode is handled by sortRecords without falling back to default', () => {
    const recs = [{ id: 'a', importe: 1, categoria: 'salidas' }];
    for (const mode of SORT_MODES) {
      expect(() => sortRecords(recs, mode, (r) => r.categoria)).not.toThrow();
    }
  });
});

describe('sanitizeText', () => {
  it('trims and collapses internal whitespace', () => {
    expect(sanitizeText('  hola   mundo  ')).toBe('hola mundo');
  });

  it('collapses tabs and newlines', () => {
    expect(sanitizeText('a\n\t  b')).toBe('a b');
  });

  it('returns an empty string for non-strings', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeText({})).toBe('');
  });

  it('does not escape HTML entities', () => {
    expect(sanitizeText('<img src=x>')).toBe('<img src=x>');
  });
});

describe('sanitizeImporte', () => {
  it('parses numbers as-is', () => {
    expect(sanitizeImporte(100)).toBe(100);
    expect(sanitizeImporte(100.55)).toBe(100.55);
    expect(sanitizeImporte(0)).toBe(0);
    expect(sanitizeImporte(-50)).toBe(-50);
  });

  it('parses plain numeric strings', () => {
    expect(sanitizeImporte('100')).toBe(100);
    expect(sanitizeImporte('100.55')).toBe(100.55);
    expect(sanitizeImporte('.5')).toBe(0.5);
    expect(sanitizeImporte('-42')).toBe(-42);
    expect(sanitizeImporte('+42')).toBe(42);
  });

  it('ignores surrounding whitespace', () => {
    expect(sanitizeImporte(' 42 ')).toBe(42);
    expect(sanitizeImporte('\t 1500.50 \n')).toBe(1500.5);
  });

  it('accepts exponent notation', () => {
    expect(sanitizeImporte('1e3')).toBe(1000);
    expect(sanitizeImporte('1.5e2')).toBe(150);
    expect(sanitizeImporte('1e+21')).toBe(1e21);
  });

  it('returns NaN for trailing garbage instead of a partial parse', () => {
    expect(sanitizeImporte('100abc')).toBeNaN();
    expect(sanitizeImporte('50usd')).toBeNaN();
    expect(sanitizeImporte('12px')).toBeNaN();
    expect(sanitizeImporte('$100')).toBeNaN();
  });

  it('returns NaN for leading garbage', () => {
    expect(sanitizeImporte('abc100')).toBeNaN();
    expect(sanitizeImporte('  # 100')).toBeNaN();
  });

  it('returns NaN for malformed separators', () => {
    expect(sanitizeImporte('1.2.3')).toBeNaN();
    expect(sanitizeImporte('1,2,3')).toBeNaN();
    expect(sanitizeImporte('1..2')).toBeNaN();
    expect(sanitizeImporte('..')).toBeNaN();
    expect(sanitizeImporte('-')).toBeNaN();
    expect(sanitizeImporte('.')).toBeNaN();
  });

  it('parses the es-AR thousands separator with a comma decimal', () => {
    expect(sanitizeImporte('1.500,50')).toBe(1500.5);
    expect(sanitizeImporte('1.234.567,89')).toBe(1234567.89);
    expect(sanitizeImporte('-1.500,50')).toBe(-1500.5);
  });

  it('parses a comma decimal without a thousands separator', () => {
    expect(sanitizeImporte('1500,50')).toBe(1500.5);
    expect(sanitizeImporte('0,5')).toBe(0.5);
    expect(sanitizeImporte('1500,000')).toBe(1500);
  });

  it('rejects the ambiguous es-AR thousands form instead of guessing', () => {
    // "250.000" es 250 con tres decimales o 250000 en formato es-AR: sin coma
    // decimal no hay forma de saber cuál es, y leerlo mal corrompe el importe.
    expect(sanitizeImporte('250.000')).toBeNaN();
    expect(sanitizeImporte('1.500')).toBeNaN();
    expect(sanitizeImporte('0.000')).toBeNaN();
    expect(sanitizeImporte('  250.000 ')).toBeNaN();
    expect(sanitizeImporte('-250.000')).toBeNaN();
  });

  it('still accepts every unambiguous neighbour of the ambiguous form', () => {
    expect(sanitizeImporte('1.500,50')).toBe(1500.5);    // es-AR con decimal
    expect(sanitizeImporte('1.234.567')).toBe(1234567);  // dos grupos: sin ambigüedad
    expect(sanitizeImporte('1.23')).toBe(1.23);          // decimal de 2 cifras
    expect(sanitizeImporte('1.2345')).toBe(1.2345);      // decimal de 4 cifras
    expect(sanitizeImporte('1234.000')).toBe(1234);      // 4 cifras antes del punto
    expect(sanitizeImporte('250000')).toBe(250000);
  });

  it('rejects a trailing separator with no digits after it', () => {
    expect(sanitizeImporte('1500,')).toBeNaN();
    expect(sanitizeImporte('1500.')).toBeNaN();
  });

  it('parses the en-US grouped format', () => {
    expect(sanitizeImporte('1,234,567.89')).toBe(1234567.89);
    expect(sanitizeImporte('1,000')).toBe(1000);
  });

  it('returns NaN for unparseable values', () => {
    expect(sanitizeImporte('abc')).toBeNaN();
    expect(sanitizeImporte('')).toBeNaN();
    expect(sanitizeImporte('   ')).toBeNaN();
  });

  it('returns NaN for non-string, non-number types', () => {
    expect(sanitizeImporte(null)).toBeNaN();
    expect(sanitizeImporte(undefined)).toBeNaN();
    expect(sanitizeImporte(true)).toBeNaN();
    expect(sanitizeImporte({})).toBeNaN();
    // parseFloat([100]) === 100, so arrays used to sneak through.
    expect(sanitizeImporte([100])).toBeNaN();
  });

  it('returns NaN for non-finite numbers', () => {
    expect(sanitizeImporte(Infinity)).toBeNaN();
    expect(sanitizeImporte(-Infinity)).toBeNaN();
    expect(sanitizeImporte(NaN)).toBeNaN();
  });
});

describe('sanitizeMes', () => {
  it('parses month indexes from strings', () => {
    expect(sanitizeMes('3')).toBe(3);
    expect(sanitizeMes(7)).toBe(7);
  });

  it('clamps out-of-range values into [0, 11]', () => {
    expect(sanitizeMes(-5)).toBe(0);
    expect(sanitizeMes(99)).toBe(11);
  });

  it('defaults to 0 for unparseable values', () => {
    expect(sanitizeMes('abc')).toBe(0);
    expect(sanitizeMes(null)).toBe(0);
    expect(sanitizeMes(undefined)).toBe(0);
  });
});

describe('sanitizeEnum', () => {
  const allowed = ['efectivo', 'debito', 'credito'];

  it('keeps an allowed value', () => {
    expect(sanitizeEnum('debito', allowed)).toBe('debito');
  });

  it('falls back to the first allowed value', () => {
    expect(sanitizeEnum('bitcoin', allowed)).toBe('efectivo');
    expect(sanitizeEnum(undefined, allowed)).toBe('efectivo');
  });
});

describe('validateBudgetUpdate', () => {
  it('accepts a valid map of positive amounts', () => {
    const r = validateBudgetUpdate({ vivienda: '1000', servicios: 250 });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.data).toEqual({ vivienda: 1000, servicios: 250 });
  });

  it('accepts 0 as a valid budget', () => {
    const r = validateBudgetUpdate({ vivienda: 0 });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ vivienda: 0 });
  });

  it('accepts a decimal amount', () => {
    expect(validateBudgetUpdate({ vivienda: '10.5' }).data).toEqual({ vivienda: 10.5 });
  });

  it('rejects negative amounts', () => {
    const r = validateBudgetUpdate({ vivienda: -1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('positivo');
  });

  it('rejects non-numeric amounts', () => {
    const r = validateBudgetUpdate({ vivienda: 'abc' });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
  });

  it('rejects amounts above MAX_BUDGET_AMOUNT', () => {
    const r = validateBudgetUpdate({ vivienda: MAX_BUDGET_AMOUNT + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('demasiado alto');
  });

  it('accepts exactly MAX_BUDGET_AMOUNT', () => {
    expect(validateBudgetUpdate({ vivienda: MAX_BUDGET_AMOUNT }).ok).toBe(true);
  });

  it('is all-or-nothing: one bad key rejects the whole payload', () => {
    const r = validateBudgetUpdate({ vivienda: 100, servicios: 'abc' });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
  });

  it('reports every invalid key', () => {
    const r = validateBudgetUpdate({ a: -1, b: 'x' });
    expect(r.errors).toHaveLength(2);
  });

  it('accepts an empty payload', () => {
    expect(validateBudgetUpdate({})).toEqual({ ok: true, errors: [], data: {} });
  });
});

describe('validateMetaAhorro', () => {
  it('accepts a percentage goal', () => {
    const r = validateMetaAhorro({ tipo: 'porcentaje', valor: '20' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.data).toEqual({ tipo: 'porcentaje', valor: 20 });
  });

  it('accepts a fixed amount goal', () => {
    const r = validateMetaAhorro({ tipo: 'monto', valor: 250000 });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ tipo: 'monto', valor: 250000 });
  });

  it('accepts 0 as a valid goal (no goal set)', () => {
    expect(validateMetaAhorro({ tipo: 'porcentaje', valor: 0 }).ok).toBe(true);
  });

  it('accepts the boundary percentages 0 and 100', () => {
    expect(validateMetaAhorro({ tipo: 'porcentaje', valor: 0 }).ok).toBe(true);
    expect(validateMetaAhorro({ tipo: 'porcentaje', valor: 100 }).ok).toBe(true);
  });

  it('accepts a decimal percentage', () => {
    expect(validateMetaAhorro({ tipo: 'porcentaje', valor: '12.5' }).data.valor).toBe(12.5);
  });

  it('rejects a percentage above 100', () => {
    const r = validateMetaAhorro({ tipo: 'porcentaje', valor: 101 });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
    expect(r.errors[0]).toContain('no puede superar 100');
  });

  it('rejects a negative goal', () => {
    const r = validateMetaAhorro({ tipo: 'porcentaje', valor: -1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('mayor o igual a cero');
  });

  it('rejects a non-numeric goal', () => {
    const r = validateMetaAhorro({ tipo: 'monto', valor: 'abc' });
    expect(r.ok).toBe(false);
    expect(r.data).toBeUndefined();
  });

  it('rejects a missing goal', () => {
    expect(validateMetaAhorro(undefined).ok).toBe(false);
    expect(validateMetaAhorro({}).ok).toBe(false);
  });

  it('rejects the ambiguous "250.000" format with a hint on how to write it', () => {
    const r = validateMetaAhorro({ tipo: 'monto', valor: '250.000' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('es ambigua');
  });

  it('falls back to porcentaje for an unknown tipo', () => {
    expect(validateMetaAhorro({ tipo: 'porcentoje', valor: 30 }).data)
      .toEqual({ tipo: 'porcentaje', valor: 30 });
    expect(validateMetaAhorro({ valor: 30 }).data)
      .toEqual({ tipo: 'porcentaje', valor: 30 });
  });

  it('rejects a monto above MAX_BUDGET_AMOUNT', () => {
    const r = validateMetaAhorro({ tipo: 'monto', valor: MAX_BUDGET_AMOUNT + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('demasiado alta');
  });

  it('accepts exactly MAX_BUDGET_AMOUNT as a monto', () => {
    expect(validateMetaAhorro({ tipo: 'monto', valor: MAX_BUDGET_AMOUNT }).ok).toBe(true);
  });

  it('does not apply the percentage cap to a monto', () => {
    expect(validateMetaAhorro({ tipo: 'monto', valor: 500 }).ok).toBe(true);
  });

  it('accepts every declared tipo', () => {
    for (const tipo of META_TIPOS) {
      expect(validateMetaAhorro({ tipo, valor: 10 }).ok).toBe(true);
    }
  });
});

describe('validateGasto', () => {
  const valid = {
    detalle: 'Supermercado', importe: '1500.50', mes: '4',
    categoria: 'alimentacion', medio: 'debito',
  };

  it('accepts a well-formed gasto and normalises the fields', () => {
    const r = validateGasto(valid);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      detalle: 'Supermercado',
      importe: 1500.5,
      mes: 4,
      categoria: 'alimentacion',
      medio: 'debito',
    });
  });

  it('trims the detalle', () => {
    expect(validateGasto({ ...valid, detalle: '  Almuerzo  ' }).data.detalle).toBe('Almuerzo');
  });

  it('clamps an out-of-range month', () => {
    expect(validateGasto({ ...valid, mes: '42' }).data.mes).toBe(11);
  });

  it('falls back to the first medio for an unknown payment method', () => {
    expect(validateGasto({ ...valid, medio: 'bitcoin' }).data.medio).toBe('efectivo');
  });

  it('rejects an empty detalle', () => {
    const r = validateGasto({ ...valid, detalle: '   ' });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('El detalle no puede estar vacío.');
  });

  it('rejects a detalle longer than 120 chars', () => {
    const r = validateGasto({ ...valid, detalle: 'a'.repeat(121) });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('El detalle no puede superar los 120 caracteres.');
  });

  it('accepts a detalle of exactly 120 chars', () => {
    expect(validateGasto({ ...valid, detalle: 'a'.repeat(120) }).ok).toBe(true);
  });

  it('rejects a non-numeric importe', () => {
    const r = validateGasto({ ...valid, importe: 'abc' });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('El importe debe ser un número mayor que cero.');
  });

  it('rejects an importe with trailing garbage', () => {
    expect(validateGasto({ ...valid, importe: '1500abc' }).ok).toBe(false);
    expect(validateGasto({ ...valid, importe: '1500abc' }).errors)
      .toContain('El importe debe ser un número mayor que cero.');
  });

  it('accepts an importe written in es-AR format', () => {
    expect(validateGasto({ ...valid, importe: '1.500,50' }).data.importe).toBe(1500.5);
  });

  it('explains how to write an ambiguous importe instead of saying it is invalid', () => {
    const r = validateGasto({ ...valid, importe: '250.000' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('es ambiguo');
    expect(r.errors[0]).toContain('250000');
    expect(r.errors[0]).toContain('250.000,00');
  });

  it('names the ambiguous budget and how to write it', () => {
    const r = validateBudgetUpdate({ vivienda: '250.000' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('vivienda');
    expect(r.errors[0]).toContain('es ambiguo');
  });

  it('still reports a non-ambiguous bad importe as out of range', () => {
    expect(validateBudgetUpdate({ vivienda: 'abc' }).errors[0])
      .toBe('El budget para "vivienda" debe ser un número positivo.');
  });

  it('rejects a zero importe', () => {
    expect(validateGasto({ ...valid, importe: 0 }).ok).toBe(false);
    expect(validateGasto({ ...valid, importe: 0 }).errors)
      .toContain('El importe debe ser un número mayor que cero.');
  });

  it('reports an ambiguous ingreso importe', () => {
    const r = validateIngreso({ descripcion: 'Sueldo', importe: '250.000', mes: 0, tipo: 'sueldo' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('es ambiguo');
  });

  it('rejects a negative importe', () => {
    expect(validateGasto({ ...valid, importe: -10 }).ok).toBe(false);
  });

  it('rejects an excessively large importe', () => {
    const r = validateGasto({ ...valid, importe: 1_000_000_000 });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('El importe es demasiado alto.');
  });

  it('rejects a missing categoria', () => {
    const r = validateGasto({ ...valid, categoria: '' });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Seleccioná una categoría.');
  });

  it('collects all errors at once', () => {
    const r = validateGasto({ detalle: '', importe: 'x', mes: 0, categoria: '', medio: 'efectivo' });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(3);
  });

  it('returns no data when invalid', () => {
    expect(validateGasto({}).data).toBeUndefined();
  });
});

describe('validateIngreso', () => {
  const valid = {
    descripcion: 'Sueldo', importe: '800000', mes: '0', tipo: 'sueldo',
  };

  it('accepts a well-formed ingreso and normalises the fields', () => {
    const r = validateIngreso(valid);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      descripcion: 'Sueldo', importe: 800000, mes: 0, tipo: 'sueldo',
    });
  });

  it('rejects an empty descripcion', () => {
    const r = validateIngreso({ ...valid, descripcion: '  ' });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('La descripción no puede estar vacía.');
  });

  it('rejects a descripcion longer than 120 chars', () => {
    const r = validateIngreso({ ...valid, descripcion: 'a'.repeat(121) });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('La descripción no puede superar los 120 caracteres.');
  });

  it('rejects a non-positive importe', () => {
    expect(validateIngreso({ ...valid, importe: 0 }).ok).toBe(false);
    expect(validateIngreso({ ...valid, importe: 'abc' }).ok).toBe(false);
  });

  it('rejects an excessively large importe', () => {
    expect(validateIngreso({ ...valid, importe: 1_000_000_000 }).ok).toBe(false);
  });

  it('falls back to the first tipo for an unknown value', () => {
    expect(validateIngreso({ ...valid, tipo: 'loteria' }).data.tipo).toBe('sueldo');
  });

  it('clamps an out-of-range month', () => {
    expect(validateIngreso({ ...valid, mes: '77' }).data.mes).toBe(11);
  });

  it('does not require a categoria', () => {
    expect(validateIngreso({ descripcion: 'Extra', importe: 10, mes: 1, tipo: 'freelance' }).ok).toBe(true);
  });
});

describe('constants integrity', () => {
  it('defines exactly 12 months', () => {
    expect(MESES).toHaveLength(12);
  });

  it('has no duplicate category keys', () => {
    const keys = ALL_CATS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every category a key, label, icon and color', () => {
    for (const c of ALL_CATS) {
      expect(c.key).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('includes the pay_card category used for card payments', () => {
    expect(ALL_CATS.some(c => c.key === 'pay_card')).toBe(true);
  });
});
