import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPresupuesto, openEditPresup, initPresupuestoEvents } from '../presupuesto.js';
import { mountPresupuestoDom } from './helpers/dom.js';
import { defaultState } from '../store.js';
import { CAT_FIJOS, CAT_VARIABLES, MESES } from '../constants.js';

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const ingreso = (over = {}) => ({
  id: 'x', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo', ...over,
});

const build = (over = {}) => Object.assign(defaultState(), { selectedMonth: 0, ...over });

const noop = () => {};

const content = () => document.getElementById('presup-content').textContent;
const items = () => document.querySelectorAll('#presup-content .presup-item');

const clickTab = (tab) => {
  document.querySelector('.tab-btn[data-tab="' + tab + '"]').click();
};

/**
 * Registers the tab listeners, renders, then switches to `tab`.
 * The active tab is module-level state in presupuesto.js, so every test
 * selects the tab it needs explicitly instead of relying on a default.
 */
const setup = (state, tab, onMonthChange = noop, onBudgetSave = noop) => {
  initPresupuestoEvents(() => state, onMonthChange, onBudgetSave);
  renderPresupuesto(state, onMonthChange, onBudgetSave);
  clickTab(tab);
  return state;
};

beforeEach(() => {
  mountPresupuestoDom();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('renderPresupuesto — budget tabs', () => {
  it('lists the fixed categories', () => {
    setup(build(), 'fijos');
    expect(items()).toHaveLength(CAT_FIJOS.length);
  });

  it('switches to the variable categories', () => {
    setup(build(), 'variables');
    expect(items()).toHaveLength(CAT_VARIABLES.length);
  });

  it('switches to the ingresos tab', () => {
    setup(build({ ingresos: [ingreso()] }), 'ingresos');
    expect(document.querySelectorAll('#presup-content .ingreso-list-item')).toHaveLength(1);
  });

  it('marks exactly one tab as active', () => {
    setup(build(), 'variables');
    expect(document.querySelectorAll('.tab-btn.active')).toHaveLength(1);
    expect(document.querySelector('.tab-btn.active').dataset.tab).toBe('variables');
  });

  it('renders the configured budget per category', () => {
    const s = build();
    s.budgets[0].vivienda = 300000;
    setup(s, 'fijos');
    expect(content()).toContain('$300.000');
  });

  it('shows the percentage executed for a category', () => {
    const s = build({ gastos: [gasto({ categoria: 'servicios', importe: 75 })] });
    s.budgets[0].servicios = 100;
    setup(s, 'fijos');
    expect(content()).toContain('75% ejecutado');
  });

  it('shows 0% when a category has no budget', () => {
    setup(build(), 'fijos');
    expect(content()).toContain('0% ejecutado');
  });

  it('shows more than 100% when spending exceeds the budget', () => {
    const s = build({ gastos: [gasto({ categoria: 'servicios', importe: 250 })] });
    s.budgets[0].servicios = 100;
    setup(s, 'fijos');
    expect(content()).toContain('250% ejecutado');
  });

  it('only counts expenses of the selected month', () => {
    const s = build({ gastos: [gasto({ categoria: 'servicios', importe: 50, mes: 7 })] });
    s.selectedMonth = 0;
    s.budgets[0].servicios = 100;
    setup(s, 'fijos');
    expect(content()).toContain('0% ejecutado');
  });

  it('builds the month selector for the active month', () => {
    setup(build({ selectedMonth: 10 }), 'fijos');
    expect(document.querySelector('#presup-months .month-btn.active').textContent).toBe('Nov');
  });
});

describe('renderPresupuesto — ingresos tab', () => {
  it('shows the month total', () => {
    setup(build({ ingresos: [ingreso({ importe: 500000 })] }), 'ingresos');
    expect(content()).toContain('$500.000');
  });

  it('shows an empty state when there are no ingresos', () => {
    setup(build(), 'ingresos');
    expect(document.querySelector('#presup-content .empty-state')).not.toBeNull();
  });

  it('renders the description and type of each ingreso', () => {
    setup(build({ ingresos: [ingreso({ descripcion: 'Freelance', tipo: 'freelance' })] }), 'ingresos');
    const item = document.querySelector('#presup-content .ingreso-list-item');
    expect(item.querySelector('.ili-name').textContent).toBe('Freelance');
    expect(item.querySelector('.ili-type').textContent).toBe('freelance');
  });
});

describe('openEditPresup', () => {
  it('renders an input per fixed category plus a save button', () => {
    setup(build(), 'fijos');
    openEditPresup(build(), noop);
    expect(document.querySelectorAll('#presup-content input[data-cat]')).toHaveLength(CAT_FIJOS.length);
    expect(document.getElementById('btn-save-presup')).not.toBeNull();
  });

  it('prefills the inputs with the current budget values', () => {
    const s = build();
    s.budgets[0].vivienda = 250000;
    setup(s, 'fijos');
    openEditPresup(s, noop);
    expect(document.querySelector('#presup-content input[data-cat="vivienda"]').value).toBe('250000');
  });

  it('titles the editor with the active month', () => {
    setup(build({ selectedMonth: 4 }), 'fijos');
    openEditPresup(build({ selectedMonth: 4 }), noop);
    expect(content()).toContain('Mayo');
  });

  it('saves the edited values and reports the month', () => {
    const onBudgetSave = vi.fn();
    const s = build();
    setup(s, 'fijos');
    openEditPresup(s, onBudgetSave);

    document.querySelector('#presup-content input[data-cat="vivienda"]').value = '400000';
    document.getElementById('btn-save-presup').click();

    expect(onBudgetSave).toHaveBeenCalledTimes(1);
    const [mi, data] = onBudgetSave.mock.calls[0];
    expect(mi).toBe(0);
    expect(data.vivienda).toBe(400000);
  });

  it('rejects a negative value and does not save', () => {
    const onBudgetSave = vi.fn();
    setup(build(), 'fijos');
    openEditPresup(build(), onBudgetSave);

    document.querySelector('#presup-content input[data-cat="vivienda"]').value = '-5';
    document.getElementById('btn-save-presup').click();

    expect(onBudgetSave).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric value and does not save', () => {
    const onBudgetSave = vi.fn();
    setup(build(), 'fijos');
    openEditPresup(build(), onBudgetSave);

    document.querySelector('#presup-content input[data-cat="vivienda"]').value = 'abc';
    document.getElementById('btn-save-presup').click();

    expect(onBudgetSave).not.toHaveBeenCalled();
  });

  it('renders nothing editable on the ingresos tab', () => {
    setup(build(), 'ingresos');
    openEditPresup(build(), noop);
    expect(document.getElementById('btn-save-presup')).toBeNull();
  });
});

describe('initPresupuestoEvents', () => {
  it('re-renders when a tab is clicked', () => {
    const state = build();
    setup(state, 'fijos');
    clickTab('variables');
    expect(document.querySelector('.tab-btn.active').dataset.tab).toBe('variables');
    expect(items()).toHaveLength(CAT_VARIABLES.length);
  });

  it('opens the budget editor from the edit button', () => {
    setup(build(), 'fijos');
    document.getElementById('btn-edit-presup').click();
    expect(document.getElementById('btn-save-presup')).not.toBeNull();
  });

  it('saves and re-renders after a successful edit', () => {
    const onBudgetSave = vi.fn();
    const state = build();
    setup(state, 'fijos', noop, onBudgetSave);

    document.getElementById('btn-edit-presup').click();
    document.querySelector('#presup-content input[data-cat="vivienda"]').value = '123000';
    document.getElementById('btn-save-presup').click();

    expect(onBudgetSave).toHaveBeenCalledWith(0, expect.objectContaining({ vivienda: 123000 }));
    // The list view is restored after saving.
    expect(document.querySelectorAll('#presup-content .presup-item').length).toBeGreaterThan(0);
  });
});

describe('presupuesto module constants', () => {
  it('exposes 12 months for the editor title', () => {
    expect(MESES).toHaveLength(12);
  });

  it('keeps fijos and variables disjoint', () => {
    const fijos = CAT_FIJOS.map(c => c.key);
    const variables = CAT_VARIABLES.map(c => c.key);
    for (const key of fijos) expect(variables).not.toContain(key);
  });
});
