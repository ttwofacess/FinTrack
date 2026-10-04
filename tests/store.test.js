import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultState, getState, setState, normalizeState } from '../store.js';
import { ALL_CATS, MESES } from '../constants.js';

const STORAGE_KEY = 'fintrack_v2';

beforeEach(() => {
  localStorage.clear();
});

describe('defaultState', () => {
  it('starts with empty collections', () => {
    const s = defaultState();
    expect(s.gastos).toEqual([]);
    expect(s.ingresos).toEqual([]);
  });

  it('creates a budget entry for all 12 months', () => {
    const s = defaultState();
    expect(Object.keys(s.budgets)).toHaveLength(MESES.length);
    for (let i = 0; i < 12; i++) {
      expect(s.budgets[i]).toBeDefined();
    }
  });

  it('initialises every category of every month to 0', () => {
    const s = defaultState();
    for (let i = 0; i < 12; i++) {
      expect(Object.keys(s.budgets[i])).toHaveLength(ALL_CATS.length);
      for (const c of ALL_CATS) {
        expect(s.budgets[i][c.key]).toBe(0);
      }
    }
  });

  it('selects the current month', () => {
    expect(defaultState().selectedMonth).toBe(new Date().getMonth());
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = defaultState();
    const b = defaultState();
    a.gastos.push({ id: 'x' });
    a.budgets[0].vivienda = 999;
    expect(b.gastos).toEqual([]);
    expect(b.budgets[0].vivienda).toBe(0);
  });
});

describe('normalizeState', () => {
  it('creates missing collections', () => {
    const s = normalizeState({});
    expect(s.gastos).toEqual([]);
    expect(s.ingresos).toEqual([]);
    expect(s.budgets).toBeDefined();
  });

  it('fills missing budget categories with 0', () => {
    const s = normalizeState({ gastos: [], ingresos: [], budgets: { 0: { vivienda: 500 } } });
    expect(s.budgets[0].vivienda).toBe(500);
    expect(s.budgets[0].salidas).toBe(0);
    expect(s.budgets[11].salidas).toBe(0);
  });

  it('creates a budget object for every missing month', () => {
    const s = normalizeState({ budgets: { 3: {} } });
    for (let i = 0; i < 12; i++) {
      expect(s.budgets[i]).toBeDefined();
    }
  });

  it('preserves a non-zero budget value', () => {
    const s = normalizeState({ budgets: { 0: { servicios: 250 } } });
    expect(s.budgets[0].servicios).toBe(250);
  });

  it('migrates legacy accented payment methods', () => {
    const s = normalizeState({
      gastos: [
        { id: '1', medio: 'débito' },
        { id: '2', medio: 'crédito' },
      ],
    });
    expect(s.gastos[0].medio).toBe('debito');
    expect(s.gastos[1].medio).toBe('credito');
  });

  it('defaults a missing medio to efectivo', () => {
    const s = normalizeState({ gastos: [{ id: '1' }, { id: '2', medio: '' }] });
    expect(s.gastos[0].medio).toBe('efectivo');
    expect(s.gastos[1].medio).toBe('efectivo');
  });

  it('leaves already-normalised medios untouched', () => {
    const s = normalizeState({
      gastos: [{ id: '1', medio: 'transferencia' }, { id: '2', medio: 'credito' }],
    });
    expect(s.gastos[0].medio).toBe('transferencia');
    expect(s.gastos[1].medio).toBe('credito');
  });

  it('mutates and returns the same object reference', () => {
    const input = { gastos: [{ id: '1', medio: 'débito' }] };
    const out = normalizeState(input);
    expect(out).toBe(input);
  });

  it('does not throw on a fully empty state', () => {
    expect(() => normalizeState({})).not.toThrow();
  });

  it('is idempotent', () => {
    const once = normalizeState({ gastos: [{ id: '1', medio: 'débito' }] });
    const twice = normalizeState(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});

describe('setState / getState', () => {
  it('persists state to localStorage under the versioned key', () => {
    const s = defaultState();
    s.gastos.push({ id: '1', detalle: 'Test', importe: 100, mes: 0 });
    setState(s);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).gastos).toHaveLength(1);
  });

  it('round-trips a state', () => {
    const s = defaultState();
    s.selectedMonth = 7;
    s.ingresos.push({ id: 'i1', descripcion: 'Sueldo', importe: 500000, mes: 7, tipo: 'sueldo' });
    s.budgets[7].alimentacion = 30000;
    setState(s);

    const loaded = getState();
    expect(loaded.selectedMonth).toBe(7);
    expect(loaded.ingresos).toEqual(s.ingresos);
    expect(loaded.budgets[7].alimentacion).toBe(30000);
  });

  it('reports success when the write goes through', () => {
    expect(setState(defaultState())).toBe(true);
  });

  it('swallows storage failures instead of breaking the caller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(setState(defaultState())).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('returns a default state when nothing is stored', () => {
    const s = getState();
    expect(s.gastos).toEqual([]);
    expect(s.ingresos).toEqual([]);
  });

  it('returns a default state when the stored JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const s = getState();
    expect(s.gastos).toEqual([]);
    expect(s.ingresos).toEqual([]);
  });

  it('returns a default state when the stored value is not an object', () => {
    localStorage.setItem(STORAGE_KEY, '"just a string"');
    const s = getState();
    expect(Array.isArray(s.gastos)).toBe(true);
  });

  it('normalises state read back from storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      gastos: [{ id: '1', detalle: 'Legacy', importe: 10, mes: 0, medio: 'débito' }],
      ingresos: [],
      budgets: { 0: { vivienda: 100 } },
    }));

    const s = getState();
    expect(s.gastos[0].medio).toBe('debito');
    expect(s.budgets[0].vivienda).toBe(100);
    expect(s.budgets[5].vivienda).toBe(0);
  });

  it('recovers a state with a missing selectedMonth field', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gastos: [], ingresos: [], budgets: {} }));
    const s = getState();
    expect(s.selectedMonth).toBeUndefined();
    expect(s.budgets).toBeDefined();
  });
});
