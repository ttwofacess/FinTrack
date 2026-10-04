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

  it('treats a malformed importe as 0 in the total pill instead of NaN', () => {
    renderGastos(stateWith([
      gasto({ id: '1', importe: 1000 }),
      gasto({ id: '2', importe: undefined }),
    ]), noop, noop, noop);

    expect(document.getElementById('gastos-total-pill').textContent).toBe('$1.000 total');
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

// El estado de búsqueda y orden vive en el módulo, así que sobrevive entre
// tests: sin resetear el registry, una query de un test filtra la lista del
// siguiente. Por eso este bloque importa gastos.js de nuevo en cada test.
describe('renderGastos — búsqueda y orden', () => {
  let render, initControls, initModal;

  const DATOS = [
    gasto({ id: 'a', detalle: 'Café con leche', importe: 3000 }),
    gasto({ id: 'b', detalle: 'Super Coto', importe: 12000 }),
    gasto({ id: 'c', detalle: 'Cine', importe: 5000, categoria: 'salidas', medio: 'credito' }),
    gasto({ id: 'd', detalle: 'Farmacia', importe: 8000, categoria: 'salud', mes: 1 }),
  ];

  let mes = 0;
  const state = () => stateWith(DATOS, mes);

  // main.js re-renderiza la pantalla desde onMonthChange (vía navigate), así que
  // el callback de mes del test tiene que hacer lo mismo para que el estado del
  // módulo y el DOM se sincronicen como en la app real.
  const renderApp = () => render(state(), (mi) => { mes = mi; renderApp(); }, onSave, onDelete);

  let onSave, onDelete;
  const ids = () => [...document.querySelectorAll('#gastos-list .gasto-item')].map(e => e.dataset.id);
  const search = () => document.getElementById('gastos-search');
  const sort = () => document.getElementById('gastos-sort');
  const type = (q) => { search().value = q; search().dispatchEvent(new Event('input')); };
  const pick = (mode) => { sort().value = mode; sort().dispatchEvent(new Event('change')); };
  const chip = (cat) => document.querySelector(`#gastos-filters .filter-chip[data-cat="${cat}"]`);

  beforeEach(async () => {
    vi.resetModules();
    ({ renderGastos: render, initGastosControls: initControls, initGastoModal: initModal } =
      await import('../gastos.js'));
    mes = 0;
    onSave = vi.fn();
    onDelete = vi.fn();
    renderApp();
    initModal(() => state(), onSave, onDelete);
    initControls(() => state(), onSave, onDelete);
  });

  describe('búsqueda', () => {
    it('filters by detalle ignoring case and accents', () => {
      type('cafe');
      expect(ids()).toEqual(['a']);
    });

    it('matches all words in any order', () => {
      type('coto super');
      expect(ids()).toEqual(['b']);
    });

    it('also matches the category label', () => {
      type('salidas');
      expect(ids()).toEqual(['c']);
    });

    it('combines with the category chip', () => {
      chip('salidas').click();
      type('Cine');
      expect(ids()).toEqual(['c']);

      type('Café');
      expect(ids()).toEqual([]);
    });

    it('searches only inside the selected month', () => {
      type('farmacia');
      expect(ids()).toEqual([]);
    });

    it('shows "x de y registros" and totals only the matches', () => {
      type('cafe');
      expect(document.getElementById('gastos-count').textContent).toBe('1 de 3 registros');
      expect(document.getElementById('gastos-total-pill').textContent).toBe('$3.000 total');
    });

    it('goes back to a plain count when the query is cleared', () => {
      type('cafe');
      type('');
      expect(document.getElementById('gastos-count').textContent).toBe('3 registros');
    });

    it('treats a whitespace-only query as no query', () => {
      type('   ');
      expect(ids()).toEqual(['c', 'b', 'a']);
      expect(document.getElementById('gastos-count').textContent).toBe('3 registros');
    });

    it('shows an empty state naming the query, without creating elements', () => {
      type('<img src=x onerror=alert(1)>');
      const empty = document.querySelector('#gastos-list .empty-state');
      expect(document.querySelector('#gastos-list img')).toBeNull();
      expect(empty.textContent).toContain('<img src=x');
      expect(document.getElementById('gastos-count').textContent).toBe('0 de 3 registros');
    });

    it('does not rebuild the month selector while typing', () => {
      const btn = document.querySelector('#gastos-months .month-btn');
      type('cafe');
      expect(document.querySelector('#gastos-months .month-btn')).toBe(btn);
    });

    it('keeps the focus in the input while typing', () => {
      search().focus();
      type('cafe');
      expect(document.activeElement).toBe(search());
    });

    it('blurs on Enter so mobile hides the keyboard', () => {
      search().focus();
      search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(document.activeElement).not.toBe(search());
    });

    it('clears the search on month change but keeps the order', () => {
      pick('monto-desc');
      type('cafe');
      document.querySelectorAll('#gastos-months .month-btn')[1].click();

      expect(mes).toBe(1);
      expect(search().value).toBe('');
      expect(sort().value).toBe('monto-desc');
    });

    it('restores both controls when the screen is rendered again', () => {
      type('cafe');
      pick('monto-asc');
      renderApp();

      expect(search().value).toBe('cafe');
      expect(sort().value).toBe('monto-asc');
      expect(ids()).toEqual(['a']);
    });

    it('resynchroniza los controles si el DOM los restauró por su cuenta', () => {
      // Un soft reload o el back-forward cache pueden devolver el input y el
      // select con un valor viejo sin disparar 'input' ni 'change'. El módulo
      // es la fuente de verdad: el DOM tiene que volver a él.
      search().value = 'cafe';
      sort().value = 'monto-asc';
      renderApp();

      expect(search().value).toBe('');
      expect(sort().value).toBe('recientes');
    });
  });

  describe('orden', () => {
    it('recientes is the default and keeps the newest first', () => {
      expect(sort().value).toBe('recientes');
      expect(ids()).toEqual(['c', 'b', 'a']);
    });

    it('monto-desc puts the most expensive first', () => {
      pick('monto-desc');
      expect(ids()).toEqual(['b', 'c', 'a']);
    });

    it('monto-asc puts the cheapest first', () => {
      pick('monto-asc');
      expect(ids()).toEqual(['a', 'c', 'b']);
    });

    it('categoria sorts by the visible label, not by the key', () => {
      pick('categoria');
      // Alimentación (a, b) antes que Salidas (c); a y b empatan.
      expect(ids()).toEqual(['b', 'a', 'c']);
    });

    it('orders the filtered result, not the whole month', () => {
      type('C');
      pick('monto-desc');
      expect(ids()).toEqual(['b', 'c', 'a']);
    });

    it('falls back to recientes when the select has no matching option', () => {
      // El select no tiene opción 'carga': el navegador deja el value vacío y
      // sanitizeEnum lo vuelve a 'recientes' en vez de romper el render.
      pick('carga');
      expect(ids()).toEqual(['c', 'b', 'a']);

      pick('inventado');
      expect(ids()).toEqual(['c', 'b', 'a']);
    });

    it('does not rebuild the month selector when the order changes', () => {
      const btn = document.querySelector('#gastos-months .month-btn');
      pick('monto-asc');
      expect(document.querySelector('#gastos-months .month-btn')).toBe(btn);
    });
  });

  describe('editar y eliminar sobre la lista filtrada', () => {
    it('opens the edit modal for a gasto found by the search', () => {
      type('coto');

      document.querySelector('#gastos-list .gasto-item').click();

      expect(document.getElementById('modal-title').textContent).toBe('Editar Gasto');
      expect(document.getElementById('f-detalle').value).toBe('Super Coto');
    });

    it('saves the edit back through the same callback', () => {
      type('coto');
      document.querySelector('#gastos-list .gasto-item').click();
      document.getElementById('f-importe').value = '9999';
      document.getElementById('btn-save-gasto').click();

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'b', importe: 9999, _edit: true,
      }));
    });

    it('deletes the gasto behind a search result', () => {
      type('coto');

      document.querySelector('#gastos-list .gasto-item').click();
      document.getElementById('btn-delete-gasto').click();

      expect(onDelete).toHaveBeenCalledWith('b');
    });

    it('deletes the right gasto when the list is ordered by importe', () => {
      pick('monto-desc');
      type('C');

      document.querySelector('#gastos-list .gasto-item').click();
      document.getElementById('btn-delete-gasto').click();

      expect(onDelete).toHaveBeenCalledWith('b');
    });
  });
});

describe('renderGastos sin los controles de búsqueda', () => {
  it('lista igual si el HTML no trae el buscador ni el selector de orden', () => {
    document.body.innerHTML = `
      <div id="gastos-months"></div>
      <div id="gastos-filters"></div>
      <span id="gastos-count"></span>
      <span id="gastos-total-pill"></span>
      <div id="gastos-list"></div>`;

    expect(() => renderGastos(stateWith([gasto({ id: 'x' })]), noop, noop, noop)).not.toThrow();
    expect(document.querySelectorAll('#gastos-list .gasto-item')).toHaveLength(1);
    expect(document.getElementById('gastos-count').textContent).toBe('1 registros');
  });
});
