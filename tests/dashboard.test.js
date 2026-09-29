import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderDashboard } from '../dashboard.js';
import { mountDashboardDom } from './helpers/dom.js';
import { defaultState } from '../store.js';
import { CUR_YEAR } from '../constants.js';

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const build = (gastos = [], ingresos = [], selectedMonth = 0, budgets = {}) => {
  const s = defaultState();
  s.gastos = gastos;
  s.ingresos = ingresos;
  s.selectedMonth = selectedMonth;
  Object.assign(s.budgets, budgets);
  return s;
};

const noop = () => {};

beforeEach(() => {
  mountDashboardDom();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('renderDashboard — balance hero', () => {
  it('renders a positive balance with the positive class', () => {
    renderDashboard(build([], [{ id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo' }]), noop, noop);
    const bal = document.getElementById('dash-balance');
    expect(bal.textContent).toBe('$1.000');
    expect(bal.className).toContain('positive');
  });

  it('renders a negative balance with the negative class', () => {
    renderDashboard(build([gasto({ importe: 2000 })]), noop, noop);
    const bal = document.getElementById('dash-balance');
    expect(bal.textContent).toBe('$-2.000');
    expect(bal.className).toContain('negative');
  });

  it('excludes credit purchases from the cash balance', () => {
    renderDashboard(build([
      gasto({ id: 'a', importe: 1000, medio: 'efectivo' }),
      gasto({ id: 'b', importe: 5000, medio: 'credito' }),
    ], [{ id: 'i1', descripcion: 'Sueldo', importe: 2000, mes: 0, tipo: 'sueldo' }]), noop, noop);

    expect(document.getElementById('dash-ingresos').textContent).toBe('$2.000');
    expect(document.getElementById('dash-gastos').textContent).toBe('$1.000');
    expect(document.getElementById('dash-balance').textContent).toBe('$1.000');
  });

  it('shows the card debt separately from the balance', () => {
    renderDashboard(build([gasto({ id: 'a', importe: 800, medio: 'credito' })]), noop, noop);
    expect(document.getElementById('dash-debt').textContent).toBe('$800');
  });

  it('labels the card figure as debt when the balance is positive', () => {
    renderDashboard(build([gasto({ id: 'a', importe: 800, medio: 'credito' })]), noop, noop);
    expect(document.getElementById('dash-debt-label').textContent).toBe('💳 deuda');
  });

  it('labels the card figure as credit when the card was overpaid', () => {
    renderDashboard(build([
      gasto({ id: 'a', importe: 100, medio: 'credito' }),
      gasto({ id: 'b', importe: 500, medio: 'debito', categoria: 'pay_card' }),
    ]), noop, noop);

    expect(document.getElementById('dash-debt').textContent).toBe('$-400');
    expect(document.getElementById('dash-debt-label').textContent).toBe('💳 saldo a favor');
  });

  it('colours the credit in green and the debt in the accent colour', () => {
    renderDashboard(build([gasto({ id: 'a', importe: 800, medio: 'credito' })]), noop, noop);
    expect(document.getElementById('dash-debt').style.color).toBe('var(--accent1)');

    renderDashboard(build([
      gasto({ id: 'a', importe: 100, medio: 'credito' }),
      gasto({ id: 'b', importe: 500, medio: 'debito', categoria: 'pay_card' }),
    ]), noop, noop);
    expect(document.getElementById('dash-debt').style.color).toBe('var(--green)');
  });

  it('lets a credit from a previous month offset this month debt', () => {
    renderDashboard(build([
      gasto({ id: 'a', mes: 0, importe: 500, medio: 'debito', categoria: 'pay_card' }),
      gasto({ id: 'b', mes: 1, importe: 200, medio: 'credito' }),
    ], [], 1), noop, noop);

    expect(document.getElementById('dash-debt').textContent).toBe('$-300');
    expect(document.getElementById('dash-debt-label').textContent).toBe('💳 saldo a favor');
  });

  it('labels the month and year', () => {
    renderDashboard(build([], [], 4), noop, noop);
    expect(document.getElementById('dash-month-name').textContent).toBe(`Mayo ${CUR_YEAR}`);
  });

  it('shows the total budget of the month', () => {
    renderDashboard(build([], [], 2, { 2: { vivienda: 300000, servicios: 50000 } }), noop, noop);
    expect(document.getElementById('dash-presup').textContent).toBe('$350.000');
  });
});

describe('renderDashboard — badges', () => {
  it('counts every transaction of the month, credit included', () => {
    renderDashboard(build([
      gasto({ id: 'a', medio: 'efectivo' }),
      gasto({ id: 'b', medio: 'credito' }),
    ]), noop, noop);
    expect(document.getElementById('dash-badges').textContent).toContain('2');
  });

  it('computes the average cash spend per transaction', () => {
    renderDashboard(build([
      gasto({ id: 'a', medio: 'efectivo', importe: 100 }),
      gasto({ id: 'b', medio: 'efectivo', importe: 300 }),
    ]), noop, noop);
    expect(document.getElementById('dash-badges').textContent).toContain('$200');
  });

  it('computes the saving rate as a percentage', () => {
    renderDashboard(build(
      [gasto({ id: 'a', medio: 'efectivo', importe: 250 })],
      [{ id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo' }],
    ), noop, noop);
    expect(document.getElementById('dash-badges').textContent).toContain('75%');
  });

  it('reports a 0% saving rate when there is no income', () => {
    renderDashboard(build([gasto({ id: 'a', importe: 500 })]), noop, noop);
    expect(document.getElementById('dash-badges').textContent).toContain('0%');
  });
});

describe('renderDashboard — bar chart', () => {
  it('shows an empty state when there are no expenses', () => {
    renderDashboard(build([]), noop, noop);
    expect(document.querySelector('#dash-barchart .empty-state')).not.toBeNull();
  });

  it('sorts categories by total, descending', () => {
    renderDashboard(build([
      gasto({ id: 'a', categoria: 'salidas', importe: 100 }),
      gasto({ id: 'b', categoria: 'vivienda', importe: 900 }),
      gasto({ id: 'c', categoria: 'mascotas', importe: 500 }),
    ]), noop, noop);

    const rows = [...document.querySelectorAll('#dash-barchart .bar-label')].map(r => r.textContent);
    expect(rows[0]).toContain('Vivienda');
    expect(rows[1]).toContain('Mascotas');
    expect(rows[2]).toContain('Salidas');
  });

  it('caps the chart at the top 6 categories', () => {
    const gastos = ['salidas', 'mascotas', 'ropa', 'regalos', 'salud', 'extras', 'vacaciones', 'viaticos']
      .map((c, i) => gasto({ id: `g${i}`, categoria: c, importe: (i + 1) * 10 }));
    renderDashboard(build(gastos), noop, noop);
    expect(document.querySelectorAll('#dash-barchart .bar-row')).toHaveLength(6);
  });

  it('scales the largest bar to 100% width', () => {
    renderDashboard(build([
      gasto({ id: 'a', categoria: 'salidas', importe: 100 }),
      gasto({ id: 'b', categoria: 'vivienda', importe: 400 }),
    ]), noop, noop);

    // Read as numbers: the CSSOM normalises "100.0%" to "100%".
    const widths = [...document.querySelectorAll('#dash-barchart .bar-fill')]
      .map(f => parseFloat(f.style.width));
    expect(widths[0]).toBeCloseTo(100);
    expect(widths[1]).toBeCloseTo(25);
  });

  it('omits categories with no spending', () => {
    renderDashboard(build([gasto({ categoria: 'salidas', importe: 100 })]), noop, noop);
    expect(document.querySelectorAll('#dash-barchart .bar-row')).toHaveLength(1);
  });
});

describe('renderDashboard — budget vs real', () => {
  it('shows an empty state when nothing is budgeted or spent', () => {
    renderDashboard(build([]), noop, noop);
    expect(document.querySelector('#dash-bvr .empty-state')).not.toBeNull();
  });

  it('lists a category that has spending but no budget', () => {
    renderDashboard(build([gasto({ categoria: 'salidas', importe: 100 })]), noop, noop);
    expect(document.querySelectorAll('#dash-bvr .bvr-row')).toHaveLength(1);
  });

  it('caps the real bar at 100% when spending exceeds the budget', () => {
    renderDashboard(build(
      [gasto({ categoria: 'salidas', importe: 300 })],
      [], 0, { 0: { salidas: 100 } },
    ), noop, noop);

    const real = document.querySelector('#dash-bvr .bvr-real');
    expect(parseFloat(real.style.width)).toBeCloseTo(100);
    expect(real.classList.contains('over')).toBe(true);
  });

  it('marks the bar ok below 70% and warn between 70% and 100%', () => {
    renderDashboard(build([gasto({ categoria: 'salidas', importe: 50 })], [], 0, { 0: { salidas: 100 } }), noop, noop);
    expect(document.querySelector('#dash-bvr .bvr-real').classList.contains('ok')).toBe(true);

    renderDashboard(build([gasto({ categoria: 'salidas', importe: 80 })], [], 0, { 0: { salidas: 100 } }), noop, noop);
    expect(document.querySelector('#dash-bvr .bvr-real').classList.contains('warn')).toBe(true);
  });

  it('shows at most 5 budget-vs-real rows', () => {
    const cats = ['vivienda', 'servicios', 'impuestos', 'prestamo', 'ahorro', 'suscripciones', 'seguro'];
    const state = build([], [], 0, { 0: Object.fromEntries(cats.map(c => [c, 100])) });
    renderDashboard(state, noop, noop);
    expect(document.querySelectorAll('#dash-bvr .bvr-row')).toHaveLength(5);
  });
});

describe('renderDashboard — recent transactions', () => {
  it('shows an empty state when there is no activity', () => {
    renderDashboard(build([]), noop, noop);
    expect(document.querySelector('#dash-recientes .empty-state')).not.toBeNull();
  });

  it('lists at most 4 transactions, newest first', () => {
    const gastos = Array.from({ length: 6 }, (_, i) => gasto({ id: `g${i}`, detalle: `Gasto ${i}` }));
    renderDashboard(build(gastos), noop, noop);

    const items = [...document.querySelectorAll('#dash-recientes .gasto-item')];
    expect(items).toHaveLength(4);
    expect(items[0].dataset.id).toBe('g5');
  });

  it('wires the click handler to onEditGasto with the gasto id', () => {
    const onEditGasto = vi.fn();
    renderDashboard(build([gasto({ id: 'abc' })]), noop, onEditGasto);

    document.querySelector('#dash-recientes .gasto-item').click();
    expect(onEditGasto).toHaveBeenCalledWith('abc');
  });
});
