import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderDashboard } from '../dashboard.js';
import { mountDashboardDom } from './helpers/dom.js';
import { defaultState } from '../store.js';
import { CUR_YEAR } from '../constants.js';

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const ingreso = (over = {}) => ({
  id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo', ...over,
});

const build = (gastos = [], ingresos = [], selectedMonth = 0, budgets = {}, metaAhorro = null) => {
  const s = defaultState();
  s.gastos = gastos;
  s.ingresos = ingresos;
  s.selectedMonth = selectedMonth;
  Object.assign(s.budgets, budgets);
  if (metaAhorro) s.metaAhorro = metaAhorro;
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

  it('skips a category whose only entry has a malformed importe', () => {
    renderDashboard(build([gasto({ categoria: 'salidas', importe: undefined })]), noop, noop);
    expect(document.querySelectorAll('#dash-barchart .bar-row')).toHaveLength(0);
    expect(document.querySelector('#dash-barchart .empty-state')).not.toBeNull();
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

describe('renderDashboard — delta del balance', () => {
  const deltaEl = () => document.getElementById('dash-balance-delta');

  /** Enero con X de balance y febrero con Y, sobre el mes 1. */
  const dosMeses = (balanceEnero, balanceFebrero) => build([
    gasto({ id: 'g0', mes: 0, importe: 1000 - balanceEnero }),
    gasto({ id: 'g1', mes: 1, importe: 1000 - balanceFebrero }),
  ], [ingreso({ mes: 0 }), ingreso({ id: 'i2', mes: 1 })], 1);

  it('marks an improvement with an arrow and the good class', () => {
    renderDashboard(dosMeses(200, 500), noop, noop);
    expect(deltaEl().hidden).toBe(false);
    expect(deltaEl().textContent).toBe('↑ 150% vs mes anterior');
    expect(deltaEl().className).toContain('good');
  });

  it('marks a drop with a down arrow and the bad class', () => {
    renderDashboard(dosMeses(500, 200), noop, noop);
    expect(deltaEl().textContent).toBe('↓ 60% vs mes anterior');
    expect(deltaEl().className).toContain('bad');
  });

  it('reports an unchanged balance as flat', () => {
    renderDashboard(dosMeses(400, 400), noop, noop);
    expect(deltaEl().textContent).toBe('= igual que el mes anterior');
    expect(deltaEl().className).toContain('flat');
  });

  it('hides the delta in January: there is no previous month in the year', () => {
    renderDashboard(build([gasto({ mes: 0 })]), noop, noop);
    expect(deltaEl().hidden).toBe(true);
    expect(deltaEl().textContent).toBe('');
  });

  it('hides the delta when the previous month has no movements', () => {
    renderDashboard(build([gasto({ mes: 4, importe: 300 })], [ingreso({ mes: 4 })], 4), noop, noop);
    expect(deltaEl().hidden).toBe(true);
  });


  it('shows the amount in pesos when the previous month closed at 0', () => {
    renderDashboard(build([
      gasto({ id: 'g0', mes: 0, importe: 1000 }),
      gasto({ id: 'g1', mes: 1, importe: 200 }),
    ], [ingreso({ mes: 0 }), ingreso({ id: 'i2', mes: 1 })], 1), noop, noop);

    expect(deltaEl().textContent).toBe('↑ $800 vs mes anterior');
  });

  it('counts a recovery from a negative previous balance as an improvement', () => {
    renderDashboard(build([
      gasto({ id: 'g0', mes: 0, importe: 1500 }),   // balance enero: -500
      gasto({ id: 'g1', mes: 1, importe: 500 }),    // balance febrero: 500
    ], [ingreso({ mes: 0 }), ingreso({ id: 'i2', mes: 1 })], 1), noop, noop);

    expect(deltaEl().textContent).toContain('↑ 200%');
    expect(deltaEl().className).toContain('good');
  });

  it('caps an absurd variation instead of printing it whole', () => {
    renderDashboard(dosMeses(1, 900), noop, noop);
    expect(deltaEl().textContent).toBe('↑ >999% vs mes anterior');
  });

  it('clears a previously visible delta when the month becomes incomparable', () => {
    renderDashboard(dosMeses(200, 500), noop, noop);
    expect(deltaEl().hidden).toBe(false);

    renderDashboard(build([gasto({ mes: 1, importe: 100 })], [ingreso({ mes: 1 })], 1), noop, noop);
    expect(deltaEl().hidden).toBe(true);
    expect(deltaEl().textContent).toBe('');
  });
});

describe('renderDashboard — deltas por categoría', () => {
  const deltaDe = (label) => {
    const row = [...document.querySelectorAll('#dash-barchart .bar-row')]
      .find(r => r.querySelector('.bar-label').textContent.includes(label));
    return row?.querySelector('.bar-delta');
  };

  /** Mismo gasto por categoría en dos meses: prev < act = sube, prev > act = baja. */
  const dosMeses = (gastosEnero, gastosFebrero) => build(
    [...gastosEnero.map((g, i) => gasto({ ...g, id: `j${i}`, mes: 0 })),
     ...gastosFebrero.map((g, i) => gasto({ ...g, id: `f${i}`, mes: 1 }))],
    [ingreso({ mes: 0 }), ingreso({ id: 'i2', mes: 1 })],
    1,
  );

  it('marks a category that spends more as bad', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'salidas', importe: 100 }],
      [{ categoria: 'salidas', importe: 300 }],
    ), noop, noop);

    expect(deltaDe('Salidas').textContent).toBe('↑200%');
    expect(deltaDe('Salidas').className).toContain('bad');
  });

  it('marks a category that spends less as good', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'salidas', importe: 300 }],
      [{ categoria: 'salidas', importe: 100 }],
    ), noop, noop);

    expect(deltaDe('Salidas').textContent).toBe('↓67%');
    expect(deltaDe('Salidas').className).toContain('good');
  });

  it('inverts the meaning for the ahorro category', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'ahorro', importe: 300 }],
      [{ categoria: 'ahorro', importe: 100 }],
    ), noop, noop);

    expect(deltaDe('Ahorro').textContent).toBe('↓67%');
    expect(deltaDe('Ahorro').className).toContain('bad');
  });

  it('shows a bigger ahorro deposit as good', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'ahorro', importe: 100 }],
      [{ categoria: 'ahorro', importe: 300 }],
    ), noop, noop);

    expect(deltaDe('Ahorro').className).toContain('good');
  });

  it('keeps the card payment neutral', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'pay_card', importe: 100 }],
      [{ categoria: 'pay_card', importe: 300 }],
    ), noop, noop);

    expect(deltaDe('Pago Tarjeta').className).toContain('flat');
  });

  it('says "nuevo" instead of a percentage when the category had no spending', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'salidas', importe: 100 }],
      [{ categoria: 'salidas', importe: 100 }, { categoria: 'mascotas', importe: 250 }],
    ), noop, noop);

    expect(deltaDe('Mascotas').textContent).toBe('nuevo');
  });

  it('adds no delta when the category did not change', () => {
    renderDashboard(dosMeses(
      [{ categoria: 'salidas', importe: 100 }],
      [{ categoria: 'salidas', importe: 100 }],
    ), noop, noop);

    expect(deltaDe('Salidas')).toBeNull();
  });

  it('adds no delta in January', () => {
    renderDashboard(build([gasto({ mes: 0, categoria: 'salidas', importe: 100 })]), noop, noop);
    expect(document.querySelectorAll('#dash-barchart .bar-delta')).toHaveLength(0);
  });

  it('adds no delta when the previous month is empty', () => {
    renderDashboard(build([gasto({ mes: 5, categoria: 'salidas', importe: 100 })], [], 5), noop, noop);
    expect(document.querySelectorAll('#dash-barchart .bar-delta')).toHaveLength(0);
  });
});

describe('renderDashboard — meta de ahorro', () => {
  const metaEl = () => document.getElementById('dash-meta');
  const barEl  = () => metaEl().querySelector('.bvr-real');
  const fill   = () => parseFloat(barEl().style.width);

  it('invites the user to set a goal when there is none', () => {
    renderDashboard(build([gasto({ importe: 100 })], [ingreso()]), noop, noop);
    expect(metaEl().textContent).toContain('Definí una meta de ahorro');
    expect(metaEl().querySelector('.bvr-track')).toBeNull();
  });

  it('asks for income when the goal is a percentage and the month has none', () => {
    renderDashboard(build([gasto({ mes: 3, importe: 100 })], [], 3, {}, { tipo: 'porcentaje', valor: 20 }), noop, noop);
    expect(metaEl().textContent).toContain('Cargá ingresos este mes');
    expect(metaEl().querySelector('.bvr-track')).toBeNull();
  });

  it('renders a percentage goal against the month income', () => {
    renderDashboard(build(
      [gasto({ importe: 200 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'porcentaje', valor: 20 },
    ), noop, noop);

    expect(metaEl().textContent).toContain('$800 / $200');
    expect(metaEl().textContent).toContain('20% de tus ingresos');
    expect(fill()).toBeCloseTo(100);
  });

  it('shows the missing amount while the goal is pending', () => {
    renderDashboard(build(
      [gasto({ importe: 800 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'monto', valor: 500 },
    ), noop, noop);

    expect(metaEl().textContent).toContain('$200 / $500');
    expect(metaEl().textContent).toContain('Te faltan $300');
    expect(barEl().className).toContain('warn');
    expect(fill()).toBeCloseTo(40);
  });

  it('celebrates a fulfilled goal and caps the bar at 100%', () => {
    renderDashboard(build(
      [gasto({ importe: 100 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'monto', valor: 500 },
    ), noop, noop);

    expect(metaEl().textContent).toContain('¡Meta cumplida!');
    // El porcentaje real sigue visible aunque la barra no pase de 100.
    expect(metaEl().textContent).toContain('180%');
    expect(fill()).toBeCloseTo(100);
    expect(barEl().className).toContain('ok');
  });

  it('keeps the bar at 0 and paints it red when the month ended in the red', () => {
    renderDashboard(build(
      [gasto({ importe: 1200 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'monto', valor: 400 },
    ), noop, noop);

    expect(metaEl().textContent).toContain('-50%');
    expect(fill()).toBe(0);
    expect(barEl().className).toContain('over');
  });

  it('labels a fixed amount goal as such', () => {
    renderDashboard(build(
      [gasto({ importe: 100 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'monto', valor: 900 },
    ), noop, noop);

    expect(metaEl().textContent).toContain('monto fijo');
    expect(metaEl().textContent).not.toContain('de tus ingresos');
  });

  it('exposes the progress as a progressbar for assistive tech', () => {
    renderDashboard(build(
      [gasto({ importe: 500 })], [ingreso({ importe: 1000 })], 0, {}, { tipo: 'monto', valor: 500 },
    ), noop, noop);

    const track = metaEl().querySelector('.bvr-track');
    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBe('100');
    expect(track.getAttribute('aria-label')).toBe('Avance de la meta de ahorro');
  });

  it('recalculates when the selected month changes', () => {
    const state = build(
      [gasto({ id: 'a', mes: 0, importe: 800 }), gasto({ id: 'b', mes: 1, importe: 100 })],
      [ingreso({ id: 'i0', mes: 0 }), ingreso({ id: 'i1', mes: 1 })],
      0, {}, { tipo: 'monto', valor: 500 },
    );
    renderDashboard(state, noop, noop);
    expect(metaEl().textContent).toContain('$200 / $500');

    state.selectedMonth = 1;
    renderDashboard(state, noop, noop);
    expect(metaEl().textContent).toContain('$900 / $500');
  });
});

describe('renderDashboard — sparkline', () => {
  const spark = () => document.getElementById('dash-spark');

  it('renders nothing when the year has no data at all', () => {
    renderDashboard(build([]), noop, noop);
    expect(spark().querySelector('svg')).toBeNull();
  });

  it('renders an svg with a point on the selected month', () => {
    renderDashboard(build(
      [gasto({ id: 'a', mes: 2 }), gasto({ id: 'b', mes: 3 })],
      [ingreso({ id: 'i2', mes: 2 }), ingreso({ id: 'i3', mes: 3 })],
      3,
    ), noop, noop);

    const svg = spark().querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-label')).toContain(String(CUR_YEAR));
    expect(spark().querySelectorAll('circle')).toHaveLength(1);
  });

  it('draws no active dot when the selected month has no data', () => {
    renderDashboard(build(
      [gasto({ id: 'a', mes: 2 })], [ingreso({ id: 'i2', mes: 2 })], 6,
    ), noop, noop);

    const circles = [...spark().querySelectorAll('circle')];
    // Marzo es el único mes con datos: queda como punto suelto (r 1.5), no
    // como punto activo (r 2.5) que sería el de julio.
    expect(circles.map(c => c.getAttribute('r'))).toEqual(['1.5']);
    expect(spark().querySelector('svg')).not.toBeNull();
  });

  it('leaves a gap instead of a zero for months with no movements', () => {
    renderDashboard(build(
      [gasto({ id: 'a', mes: 1 }), gasto({ id: 'b', mes: 5 })],
      [ingreso({ id: 'i1', mes: 1 }), ingreso({ id: 'i5', mes: 5 })],
      1,
    ), noop, noop);

    // EneroFebrero y Junio son tramos separados: dos 'M'.
    expect(spark().querySelector('path').getAttribute('d').match(/M/g)).toHaveLength(2);
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
