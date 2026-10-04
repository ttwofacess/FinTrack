import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, restartApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, getStoredState, setStoredState,
  submitGasto, submitIngreso, stateWith, clearToast, openGastoFromList,
} from '../helpers/app.js';
import { defaultState } from '../../store.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

const gasto = (over = {}) => ({
  id: 'g1', detalle: 'Alquiler', importe: 800000, mes: 0,
  categoria: 'vivienda', medio: 'transferencia', ...over,
});

const ingreso = (over = {}) => ({
  id: 'i1', descripcion: 'Sueldo', importe: 1500000, mes: 0, tipo: 'sueldo', ...over,
});

const estadoCompleto = () => stateWith((s) => {
  s.gastos = [gasto(), gasto({ id: 'g2', detalle: 'Luz', importe: 45000, categoria: 'servicios' })];
  s.ingresos = [ingreso()];
  s.budgets[0].vivienda = 900000;
  s.selectedMonth = 0;
});

const itemPresupuesto = (nombre) =>
  $$('#presup-content .presup-item').find(el => el.querySelector('.presup-name').textContent === nombre);

const crearGasto = (campos) => {
  navTo('gastos');
  byId('fab').click();
  submitGasto(campos);
};

describe('persistencia entre recargas', () => {
  it('restaura gastos, ingresos y budgets al reiniciar la app', async () => {
    await bootApp(estadoCompleto());
    await restartApp();

    expect(byId('dash-ingresos').textContent).toBe('$1.500.000');
    expect(byId('dash-gastos').textContent).toBe('$845.000');
    expect(byId('dash-presup').textContent).toBe('$900.000');
    expect(byId('dash-balance').textContent).toBe('$655.000');
    expect($$('#dash-recientes .gasto-item')).toHaveLength(2);

    navTo('ingresos');
    expect($('#ing-list .ili-name').textContent).toBe('Sueldo');
  });

  it('recupera el mes seleccionado tras reiniciar', async () => {
    await bootApp();
    clickMonth('dash-months', 5);
    expect(getStoredState().selectedMonth).toBe(5);

    await restartApp();

    expect(byId('dash-month-name').textContent).toMatch(/^Junio/);
    expect($$('#dash-months .month-btn')[5].classList.contains('active')).toBe(true);
  });

  it('un gasto creado en la sesión sobrevive al reinicio', async () => {
    await bootApp();
    crearGasto({ detalle: 'Supermercado', importe: '25000', mes: 0, categoria: 'alimentacion', medio: 'efectivo' });

    await restartApp();

    navTo('gastos');
    expect($$('#gastos-list .gasto-name').map(n => n.textContent)).toEqual(['Supermercado']);
    expect(byId('gastos-total-pill').textContent).toBe('$25.000 total');
  });

  it('un ingreso creado en la sesión sobrevive al reinicio', async () => {
    await bootApp();
    navTo('ingresos');
    byId('btn-add-ingreso').click();
    submitIngreso({ descripcion: 'Freelance', importe: '300000', mes: 0, tipo: 'freelance' });

    await restartApp();

    expect(byId('dash-ingresos').textContent).toBe('$300.000');
  });

  it('normaliza medios de pago con acentos al arrancar', async () => {
    const legacy = stateWith((s) => {
      s.gastos = [gasto({ medio: 'débito' }), gasto({ id: 'g2', medio: undefined })];
      s.selectedMonth = 0;
    });
    await bootApp(legacy);
    await restartApp();

    navTo('gastos');
    // La lista se muestra invertida (el último gasto primero).
    expect($$('#gastos-list .gasto-meta').map(n => n.textContent)).toEqual([
      'Vivienda · efectivo', 'Vivienda · debito',
    ]);
    // El storage sigue crudo hasta el próximo guardado: normalizeState no persiste.
    expect(getStoredState().gastos.map(g => g.medio)).toEqual(['débito', undefined]);
    clickMonth('gastos-months', 1);
    expect(getStoredState().gastos.map(g => g.medio)).toEqual(['debito', 'efectivo']);
  });

  it('rellena los budgets que falten en datos viejos', async () => {
    const partial = { gastos: [], ingresos: [], budgets: { 0: { vivienda: 500000 } }, selectedMonth: 0 };
    await bootApp(partial);
    await restartApp();

    // La normalización vive en memoria: la UI ya ve todos los budgets.
    navTo('presupuesto');
    expect($$('#presup-content .presup-item')).toHaveLength(8);
    expect(itemPresupuesto('Vivienda').querySelector('.presup-budget').textContent).toBe('budget: $500.000');

    // Persisten recién cuando algo vuelve a guardar el estado.
    clickMonth('presup-months', 1);
    expect(getStoredState().budgets[0].servicios).toBe(0);
    expect(getStoredState().budgets[11].ahorro).toBe(0);
  });
});

describe('reinicio de datos', () => {
  it('borra todo al confirmar y deja la app en default', async () => {
    await bootApp(estadoCompleto());

    byId('btn-reset-data').click();

    expect(window.confirm).toHaveBeenCalled();
    expect(toastText()).toContain('Datos eliminados');
    expect(getStoredState()).toMatchObject({ gastos: [], ingresos: [] });
    expect(getStoredState().budgets[0].vivienda).toBe(0);
    expect(byId('dash-balance').textContent).toBe('$0');
    expect($$('#dash-recientes .gasto-item')).toHaveLength(0);

    await restartApp();
    expect(byId('dash-balance').textContent).toBe('$0');
  });

  it('no borra nada si el usuario cancela la confirmación', async () => {
    await bootApp(estadoCompleto());
    window.confirm.mockReturnValue(false);

    byId('btn-reset-data').click();

    expect(getStoredState().gastos).toHaveLength(2);
    expect(toastText()).not.toContain('Datos eliminados');
    expect(byId('dash-ingresos').textContent).toBe('$1.500.000');
  });
});

describe('aviso cuando no se puede guardar', () => {
  /** Rompe la escritura y devuelve el spy para poder assertionar sobre el toast. */
  const romperStorage = () =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError');
    });

  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));

  it('avisa al crear un gasto', async () => {
    await bootApp();
    romperStorage();

    crearGasto({ detalle: 'Café', importe: '3000', mes: 0, categoria: 'salidas', medio: 'efectivo' });

    expect(toastText()).toContain('Gasto nuevo sin guardar');
  });

  it('avisa al editar un gasto', async () => {
    await bootApp(stateWith((s) => { s.selectedMonth = 0; }));
    navTo('gastos');
    byId('fab').click();
    submitGasto({ detalle: 'Base', importe: '1000', mes: 0, categoria: 'salidas', medio: 'efectivo' });
    romperStorage();
    clearToast();

    openGastoFromList();
    byId('f-importe').value = '2000';
    byId('btn-save-gasto').click();

    expect(toastText()).toContain('Gasto sin guardar');
    expect(toastText()).not.toContain('Gasto actualizado');
  });

  it('avisa al borrar un gasto', async () => {
    await bootApp(estadoCompleto());
    navTo('gastos');
    romperStorage();
    clearToast();

    openGastoFromList();
    byId('btn-delete-gasto').click();

    expect(toastText()).toContain('Baja de gasto sin guardar');
    expect(toastText()).not.toContain('Gasto eliminado');
  });

  it('avisa al agregar un ingreso', async () => {
    await bootApp();
    navTo('ingresos');
    romperStorage();

    byId('btn-add-ingreso').click();
    submitIngreso({ descripcion: 'Sueldo', importe: '500000', mes: 0, tipo: 'sueldo' });

    expect(toastText()).toContain('Ingreso sin guardar');
  });

  it('avisa al guardar un presupuesto', async () => {
    await bootApp();
    navTo('presupuesto');
    romperStorage();

    byId('btn-edit-presup').click();
    $('#presup-content input[data-cat="vivienda"]').value = '800000';
    byId('btn-save-presup').click();

    expect(toastText()).toContain('Presupuesto sin guardar');
    expect(toastText()).not.toContain('Budget guardado');
  });

  it('avisa al cambiar de mes', async () => {
    await bootApp();
    romperStorage();

    clickMonth('dash-months', 2);

    expect(toastText()).toContain('Cambio de mes sin guardar');
    // Igual se aplica en memoria y la pantalla lo refleja.
    expect(getStoredState().selectedMonth).toBe(0);
    expect(byId('dash-month-name').textContent).toMatch(/^Marzo/);
  });

  it('avisa al borrar todos los datos, porque no se borraron', async () => {
    await bootApp(estadoCompleto());
    romperStorage();

    byId('btn-reset-data').click();

    expect(toastText()).toContain('Borrado sin guardar');
    expect(toastText()).not.toContain('Datos eliminados');
    expect(getStoredState().gastos).toHaveLength(2);
  });

  it('avisa al importar, porque el archivo no quedó guardado', async () => {
    await bootApp();
    romperStorage();
    const file = new File([JSON.stringify(estadoCompleto())], 'f.json', { type: 'application/json' });
    const input = byId('input-import');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(toastText()).toContain('Importación sin guardar'));
    expect(toastText()).not.toContain('Datos importados');
  });

  it('el aviso dura más que un toast normal para que se pueda leer', async () => {
    await bootApp();
    romperStorage();
    // Los timers falsos se activan después del boot: el harness drena con un
    // setTimeout y se colgaría.
    vi.useFakeTimers();
    try {
      crearGasto({ detalle: 'Café', importe: '3000', mes: 0, categoria: 'salidas', medio: 'efectivo' });
      expect(toastText()).toContain('sin guardar');

      vi.advanceTimersByTime(5000);   // el toast normal ya se habría ocultado
      expect(byId('toast').classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(3001);
      expect(byId('toast').classList.contains('show')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('persistencia sin localStorage', () => {
  it('sigue operando en memoria cuando localStorage falla al guardar', async () => {
    await bootApp(estadoCompleto());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError');
    });

    crearGasto({ detalle: 'Café', importe: '3000', mes: 0, categoria: 'salidas', medio: 'efectivo' });

    // El guardado falla pero no corta el callback: la UI se actualiza igual y
    // el toast de éxito se reemplaza por el aviso de que no se persistió.
    expect(toastText()).toContain('Gasto nuevo sin guardar');
    expect(toastText()).not.toContain('Gasto guardado');
    expect($$('#gastos-list .gasto-name').map(n => n.textContent)).toContain('Café');
    expect(warn).toHaveBeenCalled();

    // Lo que no se pudo es persistir: el almacenamiento sigue con lo anterior.
    setItem.mockRestore();
    expect(getStoredState().gastos).toHaveLength(2);

    // Al recuperar elstorage, el siguiente guardado persiste todo.
    crearGasto({ detalle: 'Pan', importe: '1500', mes: 0, categoria: 'alimentacion', medio: 'efectivo' });
    expect(getStoredState().gastos).toHaveLength(4);
  });

  it('avisa por consola y devuelve false cuando no se puede guardar', async () => {
    await bootApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError');
    });
    const { setState } = await import('../../store.js');

    expect(setState(defaultState())).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('un getItem corrupto no rompe el arranque', async () => {
    await bootApp();
    setStoredState('{{{');

    await restartApp();

    expect(byId('dash-balance').textContent).toBe('$0');
    expect($$('#dash-months .month-btn')).toHaveLength(12);
  });
});
