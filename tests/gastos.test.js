import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderGastos, openNewGasto, openEditGasto, initGastoModal } from '../gastos.js';
import { mountGastosDom } from './helpers/dom.js';
import { defaultState } from '../store.js';
import { ALL_CATS, MESES } from '../constants.js';

const gasto = (over = {}) => ({
  id: 'x', detalle: 'Compra', importe: 100, mes: 0,
  categoria: 'alimentacion', medio: 'efectivo', ...over,
});

const stateWith = (gastos, selectedMonth = 0) => {
  const s = defaultState();
  s.gastos = gastos;
  s.selectedMonth = selectedMonth;
  return s;
};

const noop = () => {};

beforeEach(() => {
  mountGastosDom();
  // jsdom has no scrollIntoView; ui.js calls it 50ms after building the selector.
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('renderGastos', () => {
  it('renders a chip per category present in the month plus the fixed chips', () => {
    renderGastos(stateWith([
      gasto({ categoria: 'salidas' }),
      gasto({ categoria: 'salidas' }),
      gasto({ categoria: 'mascotas' }),
    ]), noop, noop, noop);

    const cats = [...document.querySelectorAll('#gastos-filters .filter-chip')].map(c => c.dataset.cat);
    expect(cats).toContain('all');
    expect(cats).toContain('credito');
    expect(cats.filter(c => c === 'salidas')).toHaveLength(1);
    expect(cats).toContain('mascotas');
  });

  it('lists all gastos of the selected month', () => {
    renderGastos(stateWith([
      gasto({ id: '1', mes: 0 }),
      gasto({ id: '2', mes: 0 }),
      gasto({ id: '3', mes: 1 }),
    ]), noop, noop, noop);

    expect(document.querySelectorAll('#gastos-list .gasto-item')).toHaveLength(2);
  });

  it('shows the record count and formatted total', () => {
    renderGastos(stateWith([
      gasto({ id: '1', importe: 1000 }),
      gasto({ id: '2', importe: 250.5 }),
    ]), noop, noop, noop);

    expect(document.getElementById('gastos-count').textContent).toBe('2 registros');
    expect(document.getElementById('gastos-total-pill').textContent).toBe('$1.251 total');
  });

  it('renders newest entries first', () => {
    renderGastos(stateWith([
      gasto({ id: 'primero', detalle: 'Uno' }),
      gasto({ id: 'ultimo', detalle: 'Dos' }),
    ]), noop, noop, noop);

    const ids = [...document.querySelectorAll('#gastos-list .gasto-item')].map(e => e.dataset.id);
    expect(ids).toEqual(['ultimo', 'primero']);
  });

  it('shows an empty state when there are no gastos', () => {
    renderGastos(stateWith([]), noop, noop, noop);
    expect(document.querySelector('#gastos-list .empty-state')).not.toBeNull();
    expect(document.getElementById('gastos-count').textContent).toBe('0 registros');
  });

  it('marks the "Todos" chip active by default', () => {
    renderGastos(stateWith([gasto()]), noop, noop, noop);
    const all = document.querySelector('#gastos-filters .filter-chip[data-cat="all"]');
    expect(all.classList.contains('active')).toBe(true);
  });

  it('re-renders filtered to credit when the credit chip is clicked', () => {
    renderGastos(stateWith([
      gasto({ id: 'a', medio: 'efectivo' }),
      gasto({ id: 'b', medio: 'credito' }),
    ]), noop, noop, noop);

    document.querySelector('#gastos-filters .filter-chip[data-cat="credito"]').click();

    const ids = [...document.querySelectorAll('#gastos-list .gasto-item')].map(e => e.dataset.id);
    expect(ids).toEqual(['b']);
    expect(document.getElementById('gastos-count').textContent).toBe('1 registros');
  });

  it('re-renders filtered to a single category', () => {
    renderGastos(stateWith([
      gasto({ id: 'a', categoria: 'salidas' }),
      gasto({ id: 'b', categoria: 'mascotas' }),
    ]), noop, noop, noop);

    document.querySelector('#gastos-filters .filter-chip[data-cat="salidas"]').click();

    const ids = [...document.querySelectorAll('#gastos-list .gasto-item')].map(e => e.dataset.id);
    expect(ids).toEqual(['a']);
  });

  it('resets the filter back to "Todos" when the all chip is clicked', () => {
    renderGastos(stateWith([
      gasto({ id: 'a', categoria: 'salidas' }),
      gasto({ id: 'b', categoria: 'mascotas' }),
    ]), noop, noop, noop);

    document.querySelector('#gastos-filters .filter-chip[data-cat="salidas"]').click();
    document.querySelector('#gastos-filters .filter-chip[data-cat="all"]').click();

    expect(document.querySelectorAll('#gastos-list .gasto-item')).toHaveLength(2);
  });

  it('builds the month selector for the active month', () => {
    renderGastos(stateWith([], 5), noop, noop, noop);
    const active = document.querySelector('#gastos-months .month-btn.active');
    expect(active.textContent).toBe('Jun');
  });
});

describe('openNewGasto', () => {
  it('clears the form and opens the modal', () => {
    openNewGasto(stateWith([]));
    expect(document.getElementById('modal-title').textContent).toBe('Nuevo Gasto');
    expect(document.getElementById('f-detalle').value).toBe('');
    expect(document.getElementById('f-importe').value).toBe('');
    expect(document.getElementById('modal-gasto').classList.contains('open')).toBe(true);
  });

  it('hides the delete button for a new gasto', () => {
    openNewGasto(stateWith([]));
    expect(document.getElementById('btn-delete-gasto').style.display).toBe('none');
  });

  it('populates the month select with 12 options and preselects the active month', () => {
    openNewGasto(stateWith([], 8));
    const options = [...document.querySelectorAll('#f-mes option')];
    expect(options).toHaveLength(MESES.length);
    expect(document.getElementById('f-mes').value).toBe('8');
  });

  it('groups the category select into fijos and variables', () => {
    openNewGasto(stateWith([]));
    const groups = [...document.querySelectorAll('#f-categoria optgroup')].map(g => g.label);
    expect(groups).toEqual(['Gastos Fijos', 'Gastos Variables']);
    expect(document.querySelectorAll('#f-categoria option')).toHaveLength(ALL_CATS.length);
  });
});

describe('openEditGasto', () => {
  it('loads the gasto into the form and opens the modal', () => {
    const s = stateWith([gasto({ id: 'g9', detalle: 'Alquiler', importe: 450000, mes: 3, categoria: 'vivienda', medio: 'transferencia' })]);
    openEditGasto('g9', s, noop, noop);

    expect(document.getElementById('modal-title').textContent).toBe('Editar Gasto');
    expect(document.getElementById('f-detalle').value).toBe('Alquiler');
    expect(document.getElementById('f-importe').value).toBe('450000');
    expect(document.getElementById('f-mes').value).toBe('3');
    expect(document.getElementById('f-categoria').value).toBe('vivienda');
    expect(document.getElementById('f-medio').value).toBe('transferencia');
  });

  it('shows the delete button when editing', () => {
    openEditGasto('g9', stateWith([gasto({ id: 'g9' })]), noop, noop);
    expect(document.getElementById('btn-delete-gasto').style.display).toBe('block');
  });

  it('falls back to efectivo for a gasto without medio', () => {
    const { medio, ...noMedio } = gasto({ id: 'g9' });
    openEditGasto('g9', stateWith([noMedio]), noop, noop);
    expect(document.getElementById('f-medio').value).toBe('efectivo');
  });

  it('does nothing for an unknown id', () => {
    openEditGasto('no-existe', stateWith([gasto({ id: 'g9' })]), noop, noop);
    expect(document.getElementById('modal-gasto').classList.contains('open')).toBe(false);
  });
});

describe('initGastoModal', () => {
  const fill = (values) => {
    for (const [id, value] of Object.entries(values)) {
      document.getElementById(id).value = value;
    }
  };

  it('saves a valid gasto with a generated id and closes the modal', () => {
    const onSave = vi.fn();
    initGastoModal(() => stateWith([]), onSave, noop);

    openNewGasto(stateWith([]));
    fill({ 'f-detalle': 'Cafe', 'f-importe': '450', 'f-categoria': 'salidas', 'f-medio': 'efectivo' });
    document.getElementById('btn-save-gasto').click();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.detalle).toBe('Cafe');
    expect(payload.importe).toBe(450);
    expect(payload.categoria).toBe('salidas');
    expect(payload._edit).toBe(false);
    expect(payload.id).toBeTruthy();
    expect(document.getElementById('modal-gasto').classList.contains('open')).toBe(false);
  });

  it('rejects an invalid form, keeps the modal open and does not save', () => {
    const onSave = vi.fn();
    initGastoModal(() => stateWith([]), onSave, noop);

    openNewGasto(stateWith([]));
    fill({ 'f-detalle': '', 'f-importe': 'abc', 'f-categoria': 'salidas' });
    document.getElementById('btn-save-gasto').click();

    expect(onSave).not.toHaveBeenCalled();
    expect(document.getElementById('toast').textContent).toBeTruthy();
    // The modal deliberately stays open so the user can correct the input.
    expect(document.getElementById('modal-gasto').classList.contains('open')).toBe(true);
  });

  it('keeps the original id and flags the payload as an edit', () => {
    const onSave = vi.fn();
    initGastoModal(() => stateWith([]), onSave, noop);

    openEditGasto('g9', stateWith([gasto({ id: 'g9' })]), noop, noop);
    fill({ 'f-detalle': 'Editado', 'f-importe': '10', 'f-categoria': 'salidas' });
    document.getElementById('btn-save-gasto').click();

    const payload = onSave.mock.calls[0][0];
    expect(payload.id).toBe('g9');
    expect(payload._edit).toBe(true);
  });

  it('deletes the gasto being edited', () => {
    const onDelete = vi.fn();
    initGastoModal(() => stateWith([]), noop, onDelete);

    openEditGasto('g9', stateWith([gasto({ id: 'g9' })]), noop, onDelete);
    document.getElementById('btn-delete-gasto').click();

    expect(onDelete).toHaveBeenCalledWith('g9');
    expect(document.getElementById('modal-gasto').classList.contains('open')).toBe(false);
  });

  it('does not delete when no gasto is being edited', () => {
    const onDelete = vi.fn();
    initGastoModal(() => stateWith([]), noop, onDelete);

    openNewGasto(stateWith([]));
    document.getElementById('btn-delete-gasto').click();

    expect(onDelete).not.toHaveBeenCalled();
  });
});
