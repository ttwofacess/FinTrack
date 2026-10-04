import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, getStoredState,
  submitGasto, openGastoFromList, listNames, stateWith,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

/** Crea un gasto desde la UI como haría el usuario: FAB → modal → guardar. */
const crearGasto = (campos) => {
  byId('fab').click();
  submitGasto(campos);
};

const nuevoGasto = (over = {}) => ({
  detalle: 'Supermercado', importe: '1500', mes: 0,
  categoria: 'alimentacion', medio: 'debito', ...over,
});

const seeded = (gastos, selectedMonth = 0) =>
  stateWith((s) => { s.gastos = gastos; s.selectedMonth = selectedMonth; });

const gasto = (over = {}) => ({
  id: 'g-1', detalle: 'Alquiler', importe: 800000, mes: 0,
  categoria: 'vivienda', medio: 'transferencia', ...over,
});

describe('alta de gastos', () => {
  it('guarda el gasto, lo lista y lo persiste', async () => {
    await bootApp();
    navTo('gastos');

    crearGasto(nuevoGasto());

    expect(toastText()).toContain('Gasto guardado');
    expect(listNames('gastos-list')).toEqual(['Supermercado']);
    expect(byId('gastos-count').textContent).toBe('1 registros');
    expect(byId('gastos-total-pill').textContent).toBe('$1.500 total');

    const stored = getStoredState();
    expect(stored.gastos).toHaveLength(1);
    expect(stored.gastos[0]).toMatchObject({
      detalle: 'Supermercado', importe: 1500, mes: 0,
      categoria: 'alimentacion', medio: 'debito',
    });
    // El estado interno nunca guarda el flag de edición.
    expect(stored.gastos[0]).not.toHaveProperty('_edit');
  });

  it('cierra el modal y lo limpia para el siguiente gasto', async () => {
    await bootApp();
    navTo('gastos');

    crearGasto(nuevoGasto());
    expect(byId('modal-gasto').classList.contains('open')).toBe(false);

    byId('fab').click();
    expect(byId('modal-title').textContent).toBe('Nuevo Gasto');
    expect(byId('f-detalle').value).toBe('');
    expect(byId('f-importe').value).toBe('');
    expect(byId('btn-delete-gasto').style.display).toBe('none');
    expect(byId('f-mes').value).toBe(String(getStoredState().selectedMonth));
  });

  it('refleja el gasto nuevo en el dashboard al volver', async () => {
    await bootApp();

    crearGasto(nuevoGasto({ importe: '250000' }));

    navTo('dashboard');
    expect(byId('dash-gastos').textContent).toBe('$250.000');
    expect(byId('dash-balance').className).toContain('negative');
    expect($$('#dash-recientes .gasto-item')).toHaveLength(1);
  });

  it('rechaza un formulario inválido sin persistir nada', async () => {
    await bootApp();
    navTo('gastos');

    crearGasto(nuevoGasto({ detalle: '   ' }));
    expect(toastText()).toContain('detalle no puede estar vacío');
    expect(getStoredState().gastos).toHaveLength(0);
    expect(byId('modal-gasto').classList.contains('open')).toBe(true);

    crearGasto(nuevoGasto({ detalle: 'Alquiler', importe: '0', mes: 0 }));
    expect(toastText()).toContain('importe debe ser un número mayor que cero');
    expect(getStoredState().gastos).toHaveLength(0);

    crearGasto(nuevoGasto({ importe: '100abc' }));
    expect(toastText()).toContain('importe debe ser un número mayor que cero');
    expect(getStoredState().gastos).toHaveLength(0);
  });

  it('rechaza en el formulario un importe ambiguo y explica cómo escribirlo', async () => {
    await bootApp();
    navTo('gastos');

    // <input type="number"> acepta "250.000" como número válido (250 con tres
    // decimales), así que el caso ambiguo también entra desde el formulario.
    crearGasto(nuevoGasto({ importe: '250.000' }));

    expect(toastText()).toContain('es ambiguo');
    expect(toastText()).toContain('250.000,00');
    expect(getStoredState().gastos).toHaveLength(0);

    // Sin ambiguüedad, el mismo importe se guarda.
    crearGasto(nuevoGasto({ importe: '250000' }));
    expect(getStoredState().gastos[0].importe).toBe(250000);
  });

  it('normaliza el importe del formulario a número', async () => {
    await bootApp();
    navTo('gastos');

    // <input type="number"> entrega strings; el estado debe guardar un número.
    crearGasto(nuevoGasto({ importe: '1500.50' }));
    expect(getStoredState().gastos[0].importe).toBe(1500.5);
    expect(byId('gastos-total-pill').textContent).toBe('$1.501 total');
  });
});

describe('edición de gastos', () => {
  it('abre el modal con los datos del gasto y actualiza sin duplicar', async () => {
    await bootApp(seeded([gasto()]));
    navTo('gastos');

    openGastoFromList();
    expect(byId('modal-title').textContent).toBe('Editar Gasto');
    expect(byId('f-detalle').value).toBe('Alquiler');
    expect(byId('f-importe').value).toBe('800000');
    expect(byId('f-categoria').value).toBe('vivienda');
    expect(byId('btn-delete-gasto').style.display).toBe('block');

    byId('f-importe').value = '950000';
    byId('btn-save-gasto').click();

    expect(toastText()).toContain('Gasto actualizado');
    expect(getStoredState().gastos).toHaveLength(1);
    expect(getStoredState().gastos[0]).toMatchObject({ id: 'g-1', importe: 950000 });
    expect(byId('gastos-total-pill').textContent).toBe('$950.000 total');
  });

  it('mueve el gasto a otro mes al editarlo', async () => {
    await bootApp(seeded([gasto()]));
    navTo('gastos');

    openGastoFromList();
    byId('f-mes').value = '5';
    byId('btn-save-gasto').click();

    expect(getStoredState().gastos[0].mes).toBe(5);
    // El mes visible sigue siendo Enero: el gasto ya no cuenta ahí.
    expect(byId('gastos-count').textContent).toBe('0 registros');
  });

  it('rechaza una edición inválida y conserva el dato anterior', async () => {
    await bootApp(seeded([gasto()]));
    navTo('gastos');

    openGastoFromList();
    byId('f-importe').value = '-5';
    byId('btn-save-gasto').click();

    expect(toastText()).toContain('importe debe ser un número mayor que cero');
    expect(getStoredState().gastos[0].importe).toBe(800000);
  });

  it('abre la edición desde los últimos movimientos del dashboard', async () => {
    await bootApp(seeded([gasto({ detalle: 'Luz' })]));
    navTo('dashboard');

    $('#dash-recientes .gasto-item').click();

    expect(byId('modal-gasto').classList.contains('open')).toBe(true);
    expect(byId('f-detalle').value).toBe('Luz');
  });
});

describe('baja de gastos', () => {
  it('elimina el gasto de la lista y del almacenamiento', async () => {
    await bootApp(seeded([gasto(), gasto({ id: 'g-2', detalle: 'Luz', importe: 30000 })]));
    navTo('gastos');
    expect(byId('gastos-count').textContent).toBe('2 registros');

    // La lista se muestra en orden inverso: el último guardado arriba.
    openGastoFromList();
    expect(byId('f-detalle').value).toBe('Luz');
    byId('btn-delete-gasto').click();

    expect(toastText()).toContain('Gasto eliminado');
    expect(getStoredState().gastos.map(g => g.id)).toEqual(['g-1']);
    expect(listNames('gastos-list')).toEqual(['Alquiler']);

    openGastoFromList();
    byId('btn-delete-gasto').click();
    expect(getStoredState().gastos).toHaveLength(0);
    expect(byId('gastos-list').innerHTML).toContain('Sin gastos para este filtro');
  });

  it('no borra nada si el modal está en modo alta', async () => {
    await bootApp(seeded([gasto()]));
    navTo('gastos');

    byId('fab').click();
    byId('btn-delete-gasto').click();

    expect(getStoredState().gastos).toHaveLength(1);
  });
});

describe('filtros y listas', () => {
  it('filtra por medio de pago y por categoría', async () => {
    await bootApp(seeded([
      gasto({ id: 'a', detalle: 'Alquiler', categoria: 'vivienda', medio: 'transferencia', importe: 100000 }),
      gasto({ id: 'b', detalle: 'Supermercado', categoria: 'alimentacion', medio: 'credito', importe: 50000 }),
      gasto({ id: 'c', detalle: 'Café', categoria: 'alimentacion', medio: 'efectivo', importe: 2000 }),
    ]));
    navTo('gastos');
    expect(byId('gastos-count').textContent).toBe('3 registros');

    $('.filter-chip[data-cat="credito"]').click();
    expect(listNames('gastos-list')).toEqual(['Supermercado']);
    expect(byId('gastos-total-pill').textContent).toBe('$50.000 total');

    $('.filter-chip[data-cat="alimentacion"]').click();
    expect(listNames('gastos-list').sort()).toEqual(['Café', 'Supermercado']);
    expect(byId('gastos-total-pill').textContent).toBe('$52.000 total');

    $('.filter-chip[data-cat="all"]').click();
    expect(byId('gastos-count').textContent).toBe('3 registros');
  });

  it('lista sólo los gastos del mes visible', async () => {
    await bootApp(seeded([
      gasto({ id: 'a', detalle: 'Enero' }),
      gasto({ id: 'b', detalle: 'Febrero', mes: 1 }),
    ]));
    navTo('gastos');
    expect(listNames('gastos-list')).toEqual(['Enero']);

    clickMonth('gastos-months', 1);
    expect(listNames('gastos-list')).toEqual(['Febrero']);
  });
});

describe('escapado en la UI', () => {
  it('renderiza el detalle de un gasto como texto, no como markup', async () => {
    const payload = '<img src=x onerror="window.__xss=true">';
    await bootApp();
    navTo('gastos');

    crearGasto(nuevoGasto({ detalle: payload }));

    const item = $('#gastos-list .gasto-item');
    expect(item.querySelector('img')).toBeNull();
    expect(item.querySelector('.gasto-name').textContent).toBe(payload);
    expect(getStoredState().gastos[0].detalle).toBe(payload);
    expect(window.__xss).toBeUndefined();
  });

  it('no rompe el data-id con comillas en el detalle', async () => {
    await bootApp();
    navTo('gastos');

    crearGasto(nuevoGasto({ detalle: 'Cafe "grande"' }));

    expect($('#gastos-list .gasto-item')).not.toBeNull();
    expect(listNames('gastos-list')).toEqual(['Cafe "grande"']);
  });
});

describe('reactividad entre pantallas', () => {
  it('un nuevo gasto actualiza el dashboard sin recargar', async () => {
    await bootApp(stateWith((s) => { s.selectedMonth = 0; s.budgets[0].alimentacion = 200000; }));
    navTo('gastos');

    crearGasto(nuevoGasto({ importe: '50000', mes: 0 }));

    navTo('dashboard');
    expect(byId('dash-gastos').textContent).toBe('$50.000');
    expect($$('#dash-bvr .bvr-row')).toHaveLength(1);
    expect($('#dash-bvr .bvr-real').className).toContain('ok');

    navTo('presupuesto');
    $('.tab-btn[data-tab="variables"]').click();
    const alimentacion = $$('#presup-content .presup-item')
      .find(el => el.textContent.includes('Alimentación'));
    expect(alimentacion.querySelector('.presup-sub').textContent).toBe('25% ejecutado');
  });
});
