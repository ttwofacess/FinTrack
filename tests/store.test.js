import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultState, getState, setState, normalizeState } from '../store.js';
import { ALL_CATS, MESES, DEFAULT_META_AHORRO } from '../constants.js';

const STORAGE_KEY = 'fintrack_v2';

beforeEach(() => {
  localStorage.clear();
});

describe('defaultState', () => {
  it('starts with empty collections', () => {
    const s = defaultState();
    expect(s.gastos).toEqual([]);
    expect(s.ingresos).toEqual([]);
    expect(s.recurrentes).toEqual([]);
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

  it('starts with no savings goal', () => {
    expect(defaultState().metaAhorro).toEqual({ tipo: 'porcentaje', valor: 0 });
    expect(DEFAULT_META_AHORRO).toEqual({ tipo: 'porcentaje', valor: 0 });
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = defaultState();
    const b = defaultState();
    a.gastos.push({ id: 'x' });
    a.recurrentes.push({ id: 'r' });
    a.budgets[0].vivienda = 999;
    a.metaAhorro.valor = 50;
    expect(b.gastos).toEqual([]);
    expect(b.recurrentes).toEqual([]);
    expect(b.budgets[0].vivienda).toBe(0);
    expect(b.metaAhorro.valor).toBe(0);
    // Tampoco se comparte la referencia con la constante de defaults.
    expect(DEFAULT_META_AHORRO.valor).toBe(0);
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

  it('adds a default metaAhorro to a state saved before the feature', () => {
    const s = normalizeState({ gastos: [], ingresos: [], budgets: {} });
    expect(s.metaAhorro).toEqual({ tipo: 'porcentaje', valor: 0 });
  });

  it('preserves a valid metaAhorro', () => {
    const s = normalizeState({ metaAhorro: { tipo: 'monto', valor: 250000 } });
    expect(s.metaAhorro).toEqual({ tipo: 'monto', valor: 250000 });
  });

  it('coerces a string valor to a number', () => {
    const s = normalizeState({ metaAhorro: { tipo: 'porcentaje', valor: '20' } });
    expect(s.metaAhorro).toEqual({ tipo: 'porcentaje', valor: 20 });
  });

  it('replaces an invalid metaAhorro with the default', () => {
    expect(normalizeState({ metaAhorro: { tipo: 'x', valor: -5 } }).metaAhorro)
      .toEqual({ tipo: 'porcentaje', valor: 0 });
    expect(normalizeState({ metaAhorro: { tipo: 'porcentaje', valor: 500 } }).metaAhorro)
      .toEqual({ tipo: 'porcentaje', valor: 0 });
    expect(normalizeState({ metaAhorro: { tipo: 'porcentaje', valor: 'abc' } }).metaAhorro)
      .toEqual({ tipo: 'porcentaje', valor: 0 });
  });

  it('normalises an unknown tipo to porcentaje while keeping a sane valor', () => {
    expect(normalizeState({ metaAhorro: { tipo: 'porcentoje', valor: 30 } }).metaAhorro)
      .toEqual({ tipo: 'porcentaje', valor: 30 });
  });

  it('replaces the default object without sharing the reference', () => {
    const s = normalizeState({ metaAhorro: { tipo: 'x', valor: -5 } });
    s.metaAhorro.valor = 80;
    expect(DEFAULT_META_AHORRO.valor).toBe(0);
    expect(normalizeState({}).metaAhorro.valor).toBe(0);
  });

  // ── recurrentes ────────────────────────────────────────────

  it('adds an empty recurrentes array to a state saved before the feature', () => {
    const s = normalizeState({ gastos: [], ingresos: [], budgets: {} });
    expect(s.recurrentes).toEqual([]);
  });

  it('replaces a non-array recurrentes with an empty array', () => {
    expect(normalizeState({ recurrentes: null }).recurrentes).toEqual([]);
    expect(normalizeState({ recurrentes: 'nada' }).recurrentes).toEqual([]);
    expect(normalizeState({ recurrentes: 42 }).recurrentes).toEqual([]);
    expect(normalizeState({ recurrentes: {} }).recurrentes).toEqual([]);
  });

  it('drops entries that are not objects', () => {
    const s = normalizeState({ recurrentes: [null, 'Netflix', 3, ['a'], { id: 'r1' }] });
    expect(s.recurrentes).toHaveLength(1);
    expect(s.recurrentes[0].id).toBe('r1');
  });

  it('preserves a valid recurrente untouched', () => {
    const r = {
      id: 'abc123', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones',
      medio: 'credito', activo: true, desdeMes: 9, salteados: [3],
    };
    expect(normalizeState({ recurrentes: [r] }).recurrentes[0]).toEqual(r);
  });

  it('fills the defaults of an incomplete recurrente', () => {
    const s = normalizeState({ recurrentes: [{ id: 'r1' }] });
    expect(s.recurrentes[0]).toEqual({
      id: 'r1',
      detalle: '',
      importe: 0,
      categoria: '',
      medio: 'efectivo',
      activo: true,
      desdeMes: 0,
      salteados: [],
    });
  });

  it('generates a deterministic id when missing', () => {
    const s = normalizeState({ recurrentes: [{ detalle: 'Alquiler' }, { detalle: 'Luz' }] });
    expect(s.recurrentes[0].id).toBe('rec-0');
    expect(s.recurrentes[1].id).toBe('rec-1');
  });

  it('sanitises the detalle text', () => {
    const s = normalizeState({ recurrentes: [{ id: 'r1', detalle: '  Gimnasio  会所 ' }] });
    expect(s.recurrentes[0].detalle).toBe('Gimnasio 会所');
    expect(normalizeState({ recurrentes: [{ id: 'r1', detalle: 42 }] }).recurrentes[0].detalle).toBe('');
  });

  it('coerces the importe to a non-negative number', () => {
    const expect0 = (importe) =>
      expect(normalizeState({ recurrentes: [{ id: 'r1', importe }] }).recurrentes[0].importe).toBe(0);

    expect(normalizeState({ recurrentes: [{ id: 'r1', importe: '8.500,00' }] }).recurrentes[0].importe).toBe(8500);
    expect(normalizeState({ recurrentes: [{ id: 'r1', importe: '8500,50' }] }).recurrentes[0].importe).toBe(8500.5);
    expect0(-100);
    expect0('abc');
    expect0(undefined);
    expect0(Infinity);
    // El formato ambiguo "250.000" se rechaza en utils: acá cae al 0.
    expect0('8.500');
  });

  it('coerces activo to a boolean, defaulting to true', () => {
    const activo = (v) => normalizeState({ recurrentes: [{ id: 'r1', activo: v }] }).recurrentes[0].activo;
    expect(activo(undefined)).toBe(true);
    expect(activo(null)).toBe(true);
    expect(activo(false)).toBe(false);
    expect(activo(true)).toBe(true);
    expect(activo(0)).toBe(false);
    expect(activo(1)).toBe(true);
  });

  it('clamps desdeMes to a valid month index', () => {
    const desde = (v) => normalizeState({ recurrentes: [{ id: 'r1', desdeMes: v }] }).recurrentes[0].desdeMes;
    expect(desde(undefined)).toBe(0);
    expect(desde(9)).toBe(9);
    expect(desde('9')).toBe(9);
    expect(desde(-3)).toBe(0);
    expect(desde(15)).toBe(11);
  });

  it('keeps only valid, unique salteados', () => {
    const s = normalizeState({ recurrentes: [{ id: 'r1', salteados: [3, 3, 0, 11, -1, 12, 'x', null, 2.5] }] });
    expect(s.recurrentes[0].salteados).toEqual([0, 3, 11]);
  });

  it('replaces a non-array salteados with an empty array', () => {
    expect(normalizeState({ recurrentes: [{ id: 'r1', salteados: 'nada' }] }).recurrentes[0].salteados).toEqual([]);
    expect(normalizeState({ recurrentes: [{ id: 'r1', salteados: null }] }).recurrentes[0].salteados).toEqual([]);
  });

  it('is idempotent over recurrentes', () => {
    const once = normalizeState({ recurrentes: [{ detalle: '  Alquiler ' }, null, 'x', { id: 'r1', importe: -1 }] });
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
    expect(s.recurrentes).toEqual([]);
  });

  it('round-trips recurrentes through storage', () => {
    const s = defaultState();
    s.recurrentes.push({ id: 'r1', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones', medio: 'credito', activo: true, desdeMes: 9, salteados: [3] });
    setState(s);

    const loaded = getState();
    expect(loaded.recurrentes).toEqual(s.recurrentes);
  });

  it('normalises corrupt recurrentes read back from storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gastos: [], ingresos: [], recurrentes: 'basura' }));
    expect(getState().recurrentes).toEqual([]);
  });
});
