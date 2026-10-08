import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  byId, $, $$, navTo, clickMonth, toastText, clearToast,
  getStoredState, stateWith, restartApp, submitGasto,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

/**
 * Enero con ingresos de $1.000 y gastos de $600 (balance $400) y febrero con
 * ingresos de $1.000 y gastos de $500 (balance $500): en febrero el balance
 * mejora, así que el delta es visible, y la meta del 20% ($200) se cumple.
 */
const dosMeses = (extra = {}) => stateWith(s => {
  s.selectedMonth = 1;
  s.metaAhorro = { tipo: 'porcentaje', valor: 20 };
  s.ingresos = [
    { id: 'i0', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo' },
    { id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 1, tipo: 'sueldo' },
  ];
  s.gastos = [
    { id: 'g0', detalle: 'Alquiler', importe: 600, mes: 0, categoria: 'vivienda', medio: 'debito' },
    { id: 'g1', detalle: 'Alquiler', importe: 500, mes: 1, categoria: 'vivienda', medio: 'debito' },
  ];
  Object.assign(s, extra);
});

const modalAbierto = () => byId('modal-meta').classList.contains('open');

const abrirModal = () => byId('btn-edit-meta').click();

const guardar = ({ tipo, valor }) => {
  byId('fm-tipo').value = tipo;
  if (tipo === 'monto') byId('fm-tipo').dispatchEvent(new Event('change'));
  byId('fm-valor').value = valor;
  byId('btn-save-meta').click();
};

describe('modal de meta de ahorro', () => {
  it('abre precargado con la meta guardada', async () => {
    await bootApp(dosMeses());
    abrirModal();

    expect(modalAbierto()).toBe(true);
    expect(byId('fm-tipo').value).toBe('porcentaje');
    expect(byId('fm-valor').value).toBe('20');
    expect(byId('fm-valor-label').textContent).toBe('Porcentaje (%)');
    expect(byId('fm-valor').max).toBe('100');
  });

  it('guarda, cierra y actualiza la card del dashboard', async () => {
    await bootApp(dosMeses());
    abrirModal();
    byId('fm-valor').value = '50';
    byId('btn-save-meta').click();

    expect(modalAbierto()).toBe(false);
    expect(toastText()).toContain('✓ Meta guardada');
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 50 });
    expect(byId('dash-meta').textContent).toContain('50% de tus ingresos');
  });

  it('cambia la etiqueta y el techo al pasar a monto fijo', async () => {
    await bootApp(dosMeses());
    abrirModal();

    byId('fm-tipo').value = 'monto';
    byId('fm-tipo').dispatchEvent(new Event('change'));

    expect(byId('fm-valor-label').textContent).toBe('Monto ($)');
    expect(byId('fm-valor').max).toBe('');

    byId('fm-valor').value = '250000';
    byId('btn-save-meta').click();

    expect(getStoredState().metaAhorro).toEqual({ tipo: 'monto', valor: 250000 });
    expect(byId('dash-meta').textContent).toContain('monto fijo');
  });

  it('rechaza un porcentaje fuera de rango sin cerrar el modal ni tocar el estado', async () => {
    await bootApp(dosMeses());
    abrirModal();
    byId('fm-valor').value = '150';
    byId('btn-save-meta').click();

    expect(modalAbierto()).toBe(true);
    expect(toastText()).toContain('❌');
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 20 });
  });

  it.each([
    ['un valor vacío', ''],
    ['un valor negativo', '-5'],
    ['texto sin sentido', 'mucho'],
    ['el formato ambiguo "250.000"', '250.000'],
  ])('rechaza %s', async (_caso, valor) => {
    await bootApp(dosMeses());
    abrirModal();
    byId('fm-valor').value = valor;
    byId('btn-save-meta').click();

    expect(modalAbierto()).toBe(true);
    expect(toastText()).not.toContain('✓ Meta guardada');
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 20 });
  });

  it('avisa que no se guardó cuando localStorage falla', async () => {
    await bootApp(dosMeses());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    abrirModal();
    byId('fm-valor').value = '40';
    byId('btn-save-meta').click();

    expect(toastText()).toContain('Meta de ahorro sin guardar');
    expect(toastText()).not.toContain('✓ Meta guardada');
    // El cambio sí queda en memoria: la app sigue mostrando la meta nueva.
    expect(byId('dash-meta').textContent).toContain('40% de tus ingresos');
  });

  it('Escape cierra el modal sin guardar y al reabrir muestra el valor viejo', async () => {
    await bootApp(dosMeses());
    abrirModal();
    byId('fm-valor').value = '99';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(modalAbierto()).toBe(false);
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 20 });

    abrirModal();
    expect(byId('fm-valor').value).toBe('20');
  });

  it('cerrar con click en el overlay no guarda nada', async () => {
    await bootApp(dosMeses());
    abrirModal();
    byId('fm-valor').value = '99';
    byId('modal-meta').click();

    expect(modalAbierto()).toBe(false);
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 20 });
  });
});

describe('persistencia de la meta', () => {
  it('la meta sigue ahí después de recargar la app', async () => {
    await bootApp(dosMeses());
    abrirModal();
    guardar({ tipo: 'porcentaje', valor: 30 });
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 30 });

    await restartApp();

    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 30 });
    // $1.000 de ingresos y $500 de gastos → meta de $300 contra $500 ahorrados.
    expect(byId('dash-meta').textContent).toContain('$500 / $300');
    expect(byId('dash-meta').textContent).toContain('¡Meta cumplida!');
  });

  it('eliminar todos los datos devuelve la meta al estado inicial', async () => {
    await bootApp(dosMeses());
    guardar({ tipo: 'monto', valor: 300000 });
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'monto', valor: 300000 });

    byId('btn-reset-data').click();

    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 0 });
    expect(byId('dash-meta').textContent).toContain('Definí una meta de ahorro');
  });

  it('un estado guardado antes de la feature carga con la meta por defecto', async () => {
    await bootApp();
    const viejo = getStoredState();
    delete viejo.metaAhorro;
    localStorage.setItem('fintrack_v2', JSON.stringify(viejo));

    await restartApp();

    // normalizeState cura el estado al cargar, aunque todavía no se haya escrito
    // de vuelta a localStorage: lo que importa es que la pantalla funcione.
    expect(byId('dash-meta').textContent).toContain('Definí una meta de ahorro');
    abrirModal();
    expect(byId('fm-tipo').value).toBe('porcentaje');
    expect(byId('fm-valor').value).toBe('');

    // Y al primer guardado, el metaAhorro queda persistido.
    byId('fm-valor').value = '10';
    byId('btn-save-meta').click();
    expect(getStoredState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 10 });
  });
});

describe('la meta y el delta se recalculan con los datos', () => {
  it('cargar un gasto desde la pantalla Gastos actualiza el dashboard', async () => {
    await bootApp(dosMeses());
    expect(byId('dash-meta').textContent).toContain('$500 / $200');
    expect(byId('dash-balance-delta').textContent).toContain('↑');

    navTo('gastos');
    byId('fab').click();
    submitGasto({ detalle: 'Supermercado', importe: '400', mes: 1, categoria: 'alimentacion', medio: 'efectivo' });
    navTo('dashboard');

    // El balance cae a $100: la meta pasa a estar pendiente y el delta, a rojo.
    expect(byId('dash-meta').textContent).toContain('$100 / $200');
    expect(byId('dash-meta').textContent).toContain('Te faltan $100');
    expect(byId('dash-balance').textContent).toBe('$100');
    expect(byId('dash-balance-delta').textContent).toContain('↓');
    expect(byId('dash-balance-delta').className).toContain('bad');
  });

  it('borrar un gasto vuelve a levantar el balance y la meta', async () => {
    await bootApp(dosMeses({ gastos: [] }));
    expect(byId('dash-meta').textContent).toContain('$1.000 / $200');

    navTo('gastos');
    byId('fab').click();
    submitGasto({ detalle: 'Supermercado', importe: '900', mes: 1, categoria: 'alimentacion', medio: 'efectivo' });
    expect(byId('dash-meta').textContent).toContain('$100 / $200');

    byId('gastos-list').querySelector('.gasto-item').click();
    byId('btn-delete-gasto').click();
    navTo('dashboard');

    expect(byId('dash-meta').textContent).toContain('$1.000 / $200');
    expect(getStoredState().gastos).toEqual([]);
  });

  it('cambiar de mes recalcula el delta y la meta, y en enero no hay delta', async () => {
    await bootApp(dosMeses());
    expect(byId('dash-balance-delta').hidden).toBe(false);

    clickMonth('dash-months', 0);

    expect(byId('dash-balance-delta').hidden).toBe(true);
    // Enero: ingresos $1.000 y gastos $600 → $400 ahorrados contra una meta de $200.
    expect(byId('dash-meta').textContent).toContain('$400 / $200');
    expect($('#dash-month-name').textContent).toContain('Enero');

    clickMonth('dash-months', 4);

    // Junio no tiene movimientos: la meta en % no se puede calcular.
    expect(byId('dash-balance-delta').hidden).toBe(true);
    expect(byId('dash-meta').textContent).toContain('Cargá ingresos este mes');
  });

  it('el delta del balance y los deltas de categoría salen del mismo estado', async () => {
    await bootApp(dosMeses());
    expect(byId('dash-balance').textContent).toBe('$500');
    expect(byId('dash-balance-delta').textContent).toBe('↑ 25% vs mes anterior');
    expect(byId('dash-balance-delta').className).toContain('good');

    // Vivienda: de $600 en enero a $500 en febrero → gastar menos es good.
    const vivienda = $$('#dash-barchart .bar-row')
      .find(r => r.querySelector('.bar-label').textContent.includes('Vivienda'));
    expect(vivienda.querySelector('.bar-delta').textContent).toBe('↓17%');
    expect(vivienda.querySelector('.bar-delta').className).toContain('good');
  });

  it('el sparkline del dashboard muestra el balance de los meses con datos', async () => {
    await bootApp(dosMeses());
    expect($('#dash-spark svg')).not.toBeNull();
    expect($('#dash-spark path').getAttribute('d')).toMatch(/^M/);
  });
});
