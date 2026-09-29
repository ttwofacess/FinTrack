import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderIngresos, openNewIngreso, initIngresoModal } from '../ingresos.js';
import { mountIngresosDom } from './helpers/dom.js';
import { defaultState } from '../store.js';
import { MESES, CUR_YEAR } from '../constants.js';

const ingreso = (over = {}) => ({
  id: 'x', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo', ...over,
});

const build = (ingresos = [], selectedMonth = 0) => {
  const s = defaultState();
  s.ingresos = ingresos;
  s.selectedMonth = selectedMonth;
  return s;
};

const noop = () => {};

const cards = () => [...document.querySelectorAll('#ing-summary-cards .ingreso-card')];

beforeEach(() => {
  mountIngresosDom();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('renderIngresos — summary cards', () => {
  it('shows the total for the selected month', () => {
    renderIngresos(build([ingreso({ id: 'a', importe: 1000 })]), noop);
    expect(cards()[0].querySelector('.ingreso-value').textContent).toBe('$1.000');
    expect(cards()[0].querySelector('.ingreso-month-label').textContent).toBe('Enero');
  });

  it('shows the previous month total', () => {
    renderIngresos(build([
      ingreso({ id: 'a', mes: 0, importe: 1000 }),
      ingreso({ id: 'b', mes: 1, importe: 2500 }),
    ], 1), noop);
    expect(cards()[1].querySelector('.ingreso-value').textContent).toBe('$1.000');
    expect(cards()[1].querySelector('.ingreso-month-label').textContent).toBe('Enero');
  });

  it('shows a dash for the previous month when in January', () => {
    renderIngresos(build([ingreso({ mes: 0, importe: 1000 })], 0), noop);
    expect(cards()[1].querySelector('.ingreso-value').textContent).toBe('$0');
    expect(cards()[1].querySelector('.ingreso-month-label').textContent).toBe('—');
  });

  it('computes the annual average across all 12 months', () => {
    renderIngresos(build([ingreso({ mes: 0, importe: 1200 })]), noop);
    // 1200 spread over 12 months
    expect(cards()[2].querySelector('.ingreso-value').textContent).toBe('$100');
    expect(cards()[2].querySelector('.ingreso-month-label').textContent).toBe(String(CUR_YEAR));
  });

  it('projects the yearly total as 12x the average', () => {
    renderIngresos(build([ingreso({ mes: 0, importe: 1200 })]), noop);
    expect(cards()[3].querySelector('.ingreso-value').textContent).toBe('$1.200');
    expect(cards()[3].querySelector('.ingreso-month-label').textContent).toBe('proyectado');
  });

  it('reports zeros when there are no ingresos at all', () => {
    renderIngresos(build([]), noop);
    for (const card of cards()) {
      expect(card.querySelector('.ingreso-value').textContent).toBe('$0');
    }
  });

  it('does not divide by zero when there is no data', () => {
    expect(() => renderIngresos(build([]), noop)).not.toThrow();
  });
});

describe('renderIngresos — list', () => {
  it('lists the ingresos of the selected month', () => {
    renderIngresos(build([
      ingreso({ id: 'a', descripcion: 'Sueldo' }),
      ingreso({ id: 'b', descripcion: 'Freelance', tipo: 'freelance' }),
    ]), noop);
    expect(document.querySelectorAll('#ing-list .ingreso-list-item')).toHaveLength(2);
  });

  it('excludes ingresos from other months', () => {
    renderIngresos(build([
      ingreso({ id: 'a', mes: 0 }),
      ingreso({ id: 'b', mes: 5 }),
    ], 0), noop);
    expect(document.querySelectorAll('#ing-list .ingreso-list-item')).toHaveLength(1);
  });

  it('renders the description, type and amount', () => {
    renderIngresos(build([ingreso({ descripcion: 'Sueldo', tipo: 'sueldo', importe: 900000 })]), noop);
    const item = document.querySelector('#ing-list .ingreso-list-item');
    expect(item.querySelector('.ili-name').textContent).toBe('Sueldo');
    expect(item.querySelector('.ili-type').textContent).toBe('sueldo');
    expect(item.querySelector('.ili-amount').textContent).toBe('$900.000');
  });

  it('shows an empty state when the month has no ingresos', () => {
    renderIngresos(build([]), noop);
    expect(document.querySelector('#ing-list .empty-state')).not.toBeNull();
  });

  it('builds the month selector for the active month', () => {
    renderIngresos(build([], 9), noop);
    expect(document.querySelector('#ing-months .month-btn.active').textContent).toBe('Oct');
  });
});

describe('openNewIngreso', () => {
  it('clears the form and opens the modal', () => {
    openNewIngreso(2);
    expect(document.getElementById('fi-desc').value).toBe('');
    expect(document.getElementById('fi-importe').value).toBe('');
    expect(document.getElementById('modal-ingreso').classList.contains('open')).toBe(true);
  });

  it('populates the month select and preselects the given month', () => {
    openNewIngreso(6);
    expect(document.querySelectorAll('#fi-mes option')).toHaveLength(MESES.length);
    expect(document.getElementById('fi-mes').value).toBe('6');
  });
});

describe('initIngresoModal', () => {
  it('opens the modal from the add button using the state month', () => {
    initIngresoModal(() => build([], 4), noop);
    document.getElementById('btn-add-ingreso').click();
    expect(document.getElementById('modal-ingreso').classList.contains('open')).toBe(true);
    expect(document.getElementById('fi-mes').value).toBe('4');
  });

  it('saves a valid ingreso with a generated id and closes the modal', () => {
    const onSave = vi.fn();
    initIngresoModal(() => build([]), onSave);

    openNewIngreso(0);
    document.getElementById('fi-desc').value = 'Sueldo';
    document.getElementById('fi-importe').value = '500000';
    document.getElementById('btn-save-ingreso').click();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.descripcion).toBe('Sueldo');
    expect(payload.importe).toBe(500000);
    expect(payload.tipo).toBe('sueldo');
    expect(payload.id).toBeTruthy();
    expect(document.getElementById('modal-ingreso').classList.contains('open')).toBe(false);
  });

  it('rejects an invalid ingreso, keeps the modal open and does not save', () => {
    const onSave = vi.fn();
    initIngresoModal(() => build([]), onSave);

    openNewIngreso(0);
    document.getElementById('fi-desc').value = '';
    document.getElementById('fi-importe').value = 'abc';
    document.getElementById('btn-save-ingreso').click();

    expect(onSave).not.toHaveBeenCalled();
    expect(document.getElementById('modal-ingreso').classList.contains('open')).toBe(true);
  });
});
