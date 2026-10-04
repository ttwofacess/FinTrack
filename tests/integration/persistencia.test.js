import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, restartApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, getStoredState, setStoredState,
  submitGasto, submitIngreso, stateWith,
} from '../helpers/app.js';

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

describe('persistencia sin localStorage', () => {
  // setState (store.js:58) no está protegido con try/catch, a diferencia de
  // getState. Si localStorage falla (modo privado, cuota llena) la excepción
  // corta el callback de guardado: no se avisa, no se renderiza y el gasto
  // queda sólo en memoria. Comportamiento actual, documentado como bug.
  it('un setItem que lanza corta el guardado sin avisar al usuario', async () => {
    await bootApp(estadoCompleto());
    const onError = (e) => e.preventDefault();
    window.addEventListener('error', onError);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError');
    });

    crearGasto({ detalle: 'Café', importe: '3000', mes: 0, categoria: 'salidas', medio: 'efectivo' });

    expect(toastText()).not.toContain('Gasto guardado');
    expect($$('#gastos-list .gasto-name').map(n => n.textContent)).not.toContain('Café');

    // La app sigue viva: al recuperar el storage, guardar funciona de nuevo.
    setItem.mockRestore();
    window.removeEventListener('error', onError);
    crearGasto({ detalle: 'Café', importe: '3000', mes: 0, categoria: 'salidas', medio: 'efectivo' });
    expect(toastText()).toContain('Gasto guardado');
    // El primer intento igual dejó el gasto en memoria: se persiste al guardar bien.
    expect(getStoredState().gastos).toHaveLength(4);
  });

  it('un getItem corrupto no rompe el arranque', async () => {
    await bootApp();
    setStoredState('{{{');

    await restartApp();

    expect(byId('dash-balance').textContent).toBe('$0');
    expect($$('#dash-months .month-btn')).toHaveLength(12);
  });
});
