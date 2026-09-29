import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escapeHtml, html, raw } from '../utils.js';
import { renderIngresos } from '../ingresos.js';
import { renderGastos, openNewGasto } from '../gastos.js';
import { renderDashboard } from '../dashboard.js';
import { initPresupuestoEvents } from '../presupuesto.js';
import { defaultState } from '../store.js';
import { mountGastosDom, mountDashboardDom, mountIngresosDom, mountPresupuestoDom } from './helpers/dom.js';

const XSS = '<img src=x onerror="window.__pwned=1">';

const ingreso = (over = {}) => ({
  id: 'x', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo', ...over,
});

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const build = (over = {}) => Object.assign(defaultState(), { selectedMonth: 0, ...over });

/** Asserts that no element from the injected payload was ever created. */
const expectNoInjectedElement = (root) => {
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('script')).toBeNull();
};

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes ampersands before the other entities to avoid double-escaping', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Supermercado Ltd.')).toBe('Supermercado Ltd.');
  });

  it('preserves accents and emoji', () => {
    expect(escapeHtml('Alimentación 🛒 —等特点')).toBe('Alimentación 🛒 —等特点');
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
  });
});

describe('html tag', () => {
  it('escapes interpolated values', () => {
    expect(html`<p>${'<b>x</b>'}</p>`).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
  });

  it('does not escape the static parts of the template', () => {
    expect(html`<div class="a">${'x'}</div>`).toBe('<div class="a">x</div>');
  });

  it('escapes every interpolated value, not just the first', () => {
    expect(html`${'<a>'}${'<b>'}`).toBe('&lt;a&gt;&lt;b&gt;');
  });

  it('escapes array values by coercion', () => {
    expect(html`${['<a>', '<b>']}`).toBe('&lt;a&gt;,&lt;b&gt;');
  });

  it('inserts raw() markup without escaping it', () => {
    expect(html`<ul>${raw('<li>ok</li>')}</ul>`).toBe('<ul><li>ok</li></ul>');
  });

  it('does not double-escape raw() content', () => {
    expect(html`${raw('&amp;')}`).toBe('&amp;');
  });

  it('handles a template with no interpolations', () => {
    expect(html`<p>static</p>`).toBe('<p>static</p>');
  });

  it('handles undefined interpolations as empty', () => {
    expect(html`<p>${undefined}</p>`).toBe('<p></p>');
  });
});

describe('XSS regression — ingresos', () => {
  beforeEach(() => {
    mountIngresosDom();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('does not execute markup injected via descripcion', () => {
    renderIngresos(build({ ingresos: [ingreso({ descripcion: XSS })] }), () => {});
    const list = document.getElementById('ing-list');
    expectNoInjectedElement(list);
    expect(list.querySelector('.ili-name').textContent).toBe(XSS);
  });

  it('does not execute markup injected via tipo', () => {
    renderIngresos(build({ ingresos: [ingreso({ tipo: XSS })] }), () => {});
    const list = document.getElementById('ing-list');
    expectNoInjectedElement(list);
    expect(list.querySelector('.ili-type').textContent).toBe(XSS);
  });
});

describe('XSS regression — gastos', () => {
  beforeEach(() => {
    mountGastosDom();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('does not execute markup injected via detalle in the list', () => {
    renderGastos(build({ gastos: [gasto({ detalle: XSS })] }), () => {}, () => {}, () => {});
    const list = document.getElementById('gastos-list');
    expectNoInjectedElement(list);
    expect(list.querySelector('.gasto-name').textContent).toBe(XSS);
  });

  it('does not execute markup injected via a malicious categoria key', () => {
    renderGastos(build({ gastos: [gasto({ categoria: XSS })] }), () => {}, () => {}, () => {});
    const filters = document.getElementById('gastos-filters');
    expectNoInjectedElement(filters);
  });

  it('keeps the malicious categoria usable as a filter value', () => {
    renderGastos(build({ gastos: [gasto({ categoria: '"><b>x</b>' })] }), () => {}, () => {}, () => {});
    const chip = document.querySelector('#gastos-filters .filter-chip:not([data-cat="all"]):not([data-cat="credito"])');
    expect(chip.dataset.cat).toBe('"><b>x</b>');
  });
});

describe('XSS regression — dashboard', () => {
  beforeEach(() => {
    mountDashboardDom();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('does not execute markup injected via detalle in recent transactions', () => {
    renderDashboard(build({ gastos: [gasto({ detalle: XSS })] }), () => {}, () => {});
    const rec = document.getElementById('dash-recientes');
    expectNoInjectedElement(rec);
  });

  it('does not execute markup injected via a malicious categoria in the bar chart', () => {
    renderDashboard(build({ gastos: [gasto({ categoria: XSS, importe: 100 })] }), () => {}, () => {});
    const chart = document.getElementById('dash-barchart');
    expectNoInjectedElement(chart);
  });
});

describe('XSS regression — presupuesto', () => {
  beforeEach(() => {
    mountPresupuestoDom();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('does not execute markup injected via descripcion', () => {
    const state = build({ ingresos: [ingreso({ descripcion: XSS })] });
    initPresupuestoEvents(() => state, () => {}, () => {});
    document.querySelector('.tab-btn[data-tab="ingresos"]').click();

    const content = document.getElementById('presup-content');
    expectNoInjectedElement(content);
    expect(content.querySelector('.ili-name').textContent).toBe(XSS);
  });

  it('does not execute markup injected via tipo', () => {
    const state = build({ ingresos: [ingreso({ tipo: XSS })] });
    initPresupuestoEvents(() => state, () => {}, () => {});
    document.querySelector('.tab-btn[data-tab="ingresos"]').click();

    const content = document.getElementById('presup-content');
    expectNoInjectedElement(content);
    expect(content.querySelector('.ili-type').textContent).toBe(XSS);
  });
});

describe('XSS regression — form selects', () => {
  it('keeps category options well-formed', () => {
    mountGastosDom();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    openNewGasto(build());

    const select = document.getElementById('f-categoria');
    expectNoInjectedElement(select);
    expect(select.querySelectorAll('option')).toHaveLength(18);
    expect(select.querySelectorAll('optgroup')).toHaveLength(2);
  });
});
