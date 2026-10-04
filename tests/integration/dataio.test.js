import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, toastText, getStoredState, activeScreen, stateWith,
  readBlob, submitGasto, clearToast,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

const jsonFile = (contenido) =>
  new File([contenido], 'fintrack.json', { type: 'application/json' });

/** jsdom no permite asignar input.files, así que se inyecta un FileList falso. */
function pickFile(file) {
  const input = byId('input-import');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
}

const estadoPropio = () => stateWith((s) => {
  s.gastos = [{
    id: 'import-1', detalle: 'Alquiler importado', importe: 950000,
    mes: 0, categoria: 'vivienda', medio: 'debito',
  }];
  s.ingresos = [{
    id: 'ing-1', descripcion: 'Sueldo importado', importe: 2000000, mes: 0, tipo: 'sueldo',
  }];
  s.budgets[0].vivienda = 1000000;
  s.selectedMonth = 0;
});

const waitForToast = (texto) => vi.waitFor(() => expect(toastText()).toContain(texto));

describe('exportación', () => {
  it('descarga el estado actual como JSON al pulsar exportar', async () => {
    await bootApp(estadoPropio());
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    byId('btn-export').click();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(toastText()).toContain('Datos exportados');

    // El blob serializa el estado vivo, no lo que quedó escrito al último guardado.
    const blob = URL.createObjectURL.mock.calls[0][0];
    const contenido = await readBlob(blob);
    const parsed = JSON.parse(contenido);
    expect(parsed.gastos[0].detalle).toBe('Alquiler importado');
    expect(parsed.ingresos).toHaveLength(1);
    expect(parsed.budgets[0].vivienda).toBe(1000000);
  });

  it('exporta un estado vacío sin fallar', async () => {
    await bootApp();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    byId('btn-export').click();

    expect(click).toHaveBeenCalled();
    const parsed = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]));
    expect(parsed.gastos).toEqual([]);
  });
});

describe('importación', () => {
  it('reemplaza el estado, persiste y vuelve al dashboard', async () => {
    await bootApp();
    navTo('gastos');

    pickFile(jsonFile(JSON.stringify(estadoPropio())));
    await waitForToast('Datos importados');

    expect(activeScreen()).toBe('dashboard');
    expect(getStoredState().gastos).toHaveLength(1);
    expect(byId('dash-ingresos').textContent).toBe('$2.000.000');
    expect(byId('dash-gastos').textContent).toBe('$950.000');
    expect(byId('dash-presup').textContent).toBe('$1.000.000');
    expect($('#dash-recientes .gasto-name').textContent).toBe('Alquiler importado');
  });

  it('el input se limpia para poder reimportar el mismo archivo', async () => {
    await bootApp();

    pickFile(jsonFile(JSON.stringify(estadoPropio())));
    await waitForToast('Datos importados');

    expect(byId('input-import').value).toBe('');
    // Segunda importación del mismo archivo: el listener sigue registrado.
    clearToast();
    pickFile(jsonFile(JSON.stringify(estadoPropio())));
    await vi.waitFor(() => expect(toastText()).toContain('Datos importados'));
  });

  it('normaliza importes en formato es-AR al importar', async () => {
    await bootApp();
    const estado = estadoPropio();
    estado.gastos[0].importe = '1.500,50';
    estado.budgets[0].servicios = '250.000,00';

    pickFile(jsonFile(JSON.stringify(estado)));
    await waitForToast('Datos importados');

    expect(getStoredState().gastos[0].importe).toBe(1500.5);
    expect(getStoredState().budgets[0].servicios).toBe(250000);
    expect($('#dash-recientes .gasto-amount').textContent).toBe('$1.501');
  });

  it('rechaza un importe ambiguo en vez de guardarlo como 250', async () => {
    await bootApp(estadoPropio());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const estado = estadoPropio();
    estado.gastos[0].importe = '250.000';

    pickFile(jsonFile(JSON.stringify(estado)));
    await waitForToast('gasto(s) con datos inválidos');

    // "250.000" puede ser 250 o 250000: se rechaza en lugar de corrupto.
    expect(getStoredState().gastos[0].importe).toBe(950000);
  });

  it('rechaza un JSON inválido y conserva el estado actual', async () => {
    await bootApp(estadoPropio());
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    pickFile(jsonFile('esto no es json'));
    await waitForToast('Error al leer el archivo');

    expect(getStoredState().gastos[0].detalle).toBe('Alquiler importado');
    expect(byId('dash-ingresos').textContent).toBe('$2.000.000');
  });

  it('rechaza gastos con datos inválidos sin tocar el estado', async () => {
    await bootApp(estadoPropio());
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    pickFile(jsonFile(JSON.stringify({
      gastos: [{ id: 'x', detalle: '', importe: -5, mes: 99, categoria: '', medio: 'bitcoin' }],
      ingresos: [],
      budgets: { 0: { vivienda: -1 } },
    })));
    await waitForToast('gasto(s) con datos inválidos');

    expect(getStoredState().gastos[0].detalle).toBe('Alquiler importado');
  });

  it('rechaza un mes de budget fuera de rango', async () => {
    await bootApp(estadoPropio());
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    pickFile(jsonFile(JSON.stringify({
      gastos: [], ingresos: [], budgets: { 13: { vivienda: 100 } },
    })));
    await waitForToast('Mes inválido en budgets: 13');

    expect(getStoredState().budgets[0].vivienda).toBe(1000000);
  });

  it('el botón importar abre el selector de archivos', async () => {
    await bootApp();
    const click = vi.spyOn(byId('input-import'), 'click').mockImplementation(() => {});

    byId('btn-import').click();

    expect(click).toHaveBeenCalled();
  });

  it('ignora el import si no hay archivo', async () => {
    await bootApp();
    pickFile(undefined);

    expect(getStoredState().gastos).toEqual([]);
  });
});

describe('ida y vuelta exportar → importar', () => {
  it('un estado exportado se puede volver a importar sin perder datos', async () => {
    await bootApp();
    navTo('gastos');
    byId('fab').click();
    submitGasto({ detalle: 'Supermercado', importe: '25000', mes: 0, categoria: 'alimentacion', medio: 'efectivo' });

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    byId('btn-export').click();
    const exportado = await readBlob(URL.createObjectURL.mock.calls[0][0]);
    click.mockRestore();

    // Se pisa el estado y se restaura desde el archivo.
    byId('btn-reset-data').click();
    expect(getStoredState().gastos).toEqual([]);

    pickFile(jsonFile(exportado));
    await waitForToast('Datos importados');

    expect($$('#dash-recientes .gasto-name').map(n => n.textContent)).toEqual(['Supermercado']);
    expect(getStoredState().gastos[0]).toMatchObject({ detalle: 'Supermercado', importe: 25000 });
  });
});
