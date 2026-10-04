import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importData, exportData, initDataIO } from '../dataIO.js';
import { defaultState } from '../store.js';
import { fmt } from '../utils.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="toast"></div>';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Builds a File whose text content is `content` and returns it. */
const jsonFile = (content) => new File([content], 'data.json', { type: 'application/json' });

/** Runs importData, waits for the FileReader to settle, and reports the outcome. */
const runImport = (file) => new Promise((resolve) => {
  const onSuccess = vi.fn();
  importData(file, onSuccess);
  setTimeout(() => {
    resolve({ called: onSuccess.mock.calls.length > 0, data: onSuccess.mock.calls[0]?.[0] });
  }, 50);
});

const toastText = () => document.getElementById('toast').textContent;

describe('importData', () => {
  it('ignores a null file', () => {
    const onSuccess = vi.fn();
    importData(null, onSuccess);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onSuccess with a valid state', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: 'Cafe', importe: 500, mes: 0, categoria: 'salidas', medio: 'efectivo' });
    state.ingresos.push({ id: 'i1', descripcion: 'Sueldo', importe: 1000, mes: 0, tipo: 'sueldo' });

    const { called, data } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(true);
    expect(data.gastos).toHaveLength(1);
    expect(data.ingresos).toHaveLength(1);
    expect(toastText()).toContain('Datos importados');
  });

  it('rejects malformed JSON and does not call onSuccess', async () => {
    const onSuccess = vi.fn();
    importData(jsonFile('{ esto no es json'), onSuccess);
    await new Promise(r => setTimeout(r, 60));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(toastText()).toContain('Error al leer el archivo');
  });

  it('rejects gastos with invalid data', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: '', importe: -5, mes: 0, categoria: '', medio: 'efectivo' });

    const { called } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(false);
    expect(toastText()).toContain('gasto(s) con datos inválidos');
  });

  it('rejects a gasto whose importe has trailing garbage', async () => {
    const state = defaultState();
    // The old parseFloat('1500abc') === 1500 silently accepted a bad import.
    state.gastos.push({ id: '1', detalle: 'Cafe', importe: '1500abc', mes: 0, categoria: 'salidas', medio: 'efectivo' });

    const { called } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(false);
    expect(toastText()).toContain('gasto(s) con datos inválidos');
  });

  it('accepts a gasto whose importe is in es-AR string format', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: 'Alquiler', importe: '1.500,50', mes: 0, categoria: 'vivienda', medio: 'transferencia' });

    const { called, data } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(true);
    expect(data.gastos[0].importe).toBe(1500.5);
  });

  it('normalises string fields on import so they render, not just validate', async () => {
    const state = defaultState();
    state.gastos.push({ id: 'keep-me', detalle: '  Almuerzo  del  dia ', importe: '1.500,50', mes: '7', categoria: 'alimentacion', medio: 'credito' });
    state.ingresos.push({ id: 'ing-1', descripcion: '  Sueldo ', importe: '1.200.000,75', mes: '7', tipo: 'sueldo' });

    const { called, data } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(true);

    expect(data.gastos[0]).toEqual({
      id: 'keep-me',
      detalle: 'Almuerzo del dia',
      importe: 1500.5,
      mes: 7,
      categoria: 'alimentacion',
      medio: 'credito',
    });
    expect(data.ingresos[0]).toEqual({
      id: 'ing-1',
      descripcion: 'Sueldo',
      importe: 1200000.75,
      mes: 7,
      tipo: 'sueldo',
    });
  });

  it('leaves an imported amount in a form the formatter can render', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: 'Alquiler', importe: '1.500,50', mes: 0, categoria: 'vivienda', medio: 'transferencia' });

    const { data } = await runImport(jsonFile(JSON.stringify(state)));
    // fmt() returns $0 for anything it cannot parse; the import must not leave a string.
    expect(typeof data.gastos[0].importe).toBe('number');
    expect(fmt(data.gastos[0].importe)).toBe('$1.501');
  });

  it('normalises budget amounts on import', async () => {
    const state = defaultState();
    state.budgets[2].vivienda = '1.500,50';

    const { called, data } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(true);
    expect(data.budgets[2].vivienda).toBe(1500.5);
  });

  it('rejects ingresos with invalid data', async () => {
    const state = defaultState();
    state.ingresos.push({ id: 'i1', descripcion: '', importe: 0, mes: 0, tipo: 'sueldo' });

    const { called } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(false);
    expect(toastText()).toContain('ingreso(s) con datos inválidos');
  });

  it('rejects a budget amount out of range and names the month', async () => {
    const state = defaultState();
    state.budgets[4].vivienda = -100;

    const { called } = await runImport(jsonFile(JSON.stringify(state)));
    expect(called).toBe(false);
    expect(toastText()).toContain('Presupuesto inválido para el mes 4');
  });

  it('accepts an empty state and normalises it', async () => {
    const { called, data } = await runImport(jsonFile(JSON.stringify({ gastos: [], ingresos: [] })));
    expect(called).toBe(true);
    expect(data.gastos).toEqual([]);
    expect(Object.keys(data.budgets)).toHaveLength(12);
  });

  it('normalises legacy accented medios on import', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: 'Legacy', importe: 100, mes: 0, categoria: 'salidas', medio: 'débito' });

    const { data } = await runImport(jsonFile(JSON.stringify(state)));
    expect(data.gastos[0].medio).toBe('debito');
  });

  it('warns instead of confirming when the import could not be persisted', async () => {
    const onSuccess = vi.fn(() => false);
    importData(jsonFile(JSON.stringify(defaultState())), onSuccess);
    await vi.waitFor(() => expect(toastText()).toContain('Importación sin guardar'));
    expect(toastText()).not.toContain('Datos importados');
  });

  it('confirms the import when onSuccess does not report a failure', async () => {
    importData(jsonFile(JSON.stringify(defaultState())), vi.fn());
    await vi.waitFor(() => expect(toastText()).toContain('Datos importados'));
  });

  it('logs all validation errors for debugging', async () => {
    const state = defaultState();
    state.gastos.push({ id: '1', detalle: '', importe: 1, mes: 0, categoria: 'salidas', medio: 'efectivo' });
    state.ingresos.push({ id: 'i1', descripcion: '', importe: 1, mes: 0, tipo: 'sueldo' });

    await runImport(jsonFile(JSON.stringify(state)));
    expect(console.warn).toHaveBeenCalled();
    const logged = console.warn.mock.calls.at(-1)[1];
    expect(logged).toHaveLength(2);
  });
});

describe('exportData', () => {
  it('serialises the state to a JSON blob and triggers a download', () => {
    const createObjectURL = vi.fn(() => 'blob:fintrack');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const state = defaultState();
    state.gastos.push({ id: '1', detalle: 'Cafe', importe: 500, mes: 0, categoria: 'salidas', medio: 'efectivo' });

    exportData(state);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(toastText()).toContain('Datos exportados');
  });
});

describe('initDataIO', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="toast"></div>
      <button id="btn-export"></button>
      <button id="btn-import"></button>
      <input type="file" id="input-import">
    `;
  });

  it('exports the current state when the export button is clicked', () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const getState = vi.fn(() => defaultState());
    initDataIO(getState, vi.fn());

    document.getElementById('btn-export').click();
    expect(getState).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('opens the file picker when the import button is clicked', () => {
    const input = document.getElementById('input-import');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    initDataIO(vi.fn(() => defaultState()), vi.fn());
    document.getElementById('btn-import').click();

    expect(clickSpy).toHaveBeenCalled();
  });

  it('resets the file input after an import attempt so the same file can be re-picked', () => {
    initDataIO(vi.fn(() => defaultState()), vi.fn());
    const input = document.getElementById('input-import');
    input.value = '';
    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('');
  });
});
