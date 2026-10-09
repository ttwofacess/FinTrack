import { describe, it, expect } from 'vitest';
import {
  ensureMonthRecurrentes,
  sincronizarImporteBase,
  registrarSalteo,
} from '../recurrentes.js';

const OCTUBRE = 9;

/** Estado mínimo con recurrentes; `gastos` arranca vacío salvo que se pase. */
function estado(recurrentes, gastos = []) {
  return { gastos, ingresos: [], recurrentes, budgets: {} };
}

const recurrente = (over = {}) => ({
  id: 'r1', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones',
  medio: 'credito', activo: true, desdeMes: 0, salteados: [], ...over,
});

describe('ensureMonthRecurrentes', () => {
  it('genera un gasto por recurrente activo con su recurrenteId', () => {
    const s = estado([recurrente()]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(1);
    expect(s.gastos).toHaveLength(1);
    expect(s.gastos[0]).toMatchObject({
      detalle: 'Netflix',
      importe: 8500,
      mes: 3,
      categoria: 'suscripciones',
      medio: 'credito',
      recurrenteId: 'r1',
    });
    expect(s.gastos[0].id).toBeTruthy();
  });

  it('genera un gasto por cada recurrente', () => {
    const s = estado([
      recurrente(),
      recurrente({ id: 'r2', detalle: 'Alquiler', importe: 250000, categoria: 'vivienda' }),
    ]);

    expect(ensureMonthRecurrentes(s, 1, OCTUBRE)).toBe(2);
    expect(s.gastos.map(g => g.detalle)).toEqual(['Netflix', 'Alquiler']);
  });

  it('genera ids distintos para recurrentes distintos', () => {
    const s = estado([recurrente(), recurrente({ id: 'r2', detalle: 'Luz' })]);
    ensureMonthRecurrentes(s, 5, OCTUBRE);
    expect(s.gastos[0].id).not.toBe(s.gastos[1].id);
  });

  it('es idempotente: llamar dos veces no duplica', () => {
    const s = estado([recurrente()]);

    ensureMonthRecurrentes(s, 3, OCTUBRE);
    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(s.gastos).toHaveLength(1);
  });

  it('no genera meses futuros', () => {
    const s = estado([recurrente()]);

    expect(ensureMonthRecurrentes(s, 10, OCTUBRE)).toBe(0);
    expect(ensureMonthRecurrentes(s, 11, OCTUBRE)).toBe(0);
    expect(s.gastos).toEqual([]);
  });

  it('no genera un mes anterior a desdeMes', () => {
    const s = estado([recurrente({ desdeMes: OCTUBRE })]);

    expect(ensureMonthRecurrentes(s, 8, OCTUBRE)).toBe(0);
    expect(s.gastos).toEqual([]);
    expect(ensureMonthRecurrentes(s, OCTUBRE, OCTUBRE)).toBe(1);
  });

  it('no genera los recurrentes pausados', () => {
    const s = estado([recurrente({ activo: false })]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(s.gastos).toEqual([]);
  });

  it('genera los que están activos aunque haya otros pausados', () => {
    const s = estado([
      recurrente({ id: 'r1', activo: false }),
      recurrente({ id: 'r2', detalle: 'Luz', activo: true }),
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(1);
    expect(s.gastos[0].recurrenteId).toBe('r2');
  });

  it('no genera un mes que el usuario salteó', () => {
    const s = estado([recurrente({ salteados: [3] })]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(ensureMonthRecurrentes(s, 4, OCTUBRE)).toBe(1);
  });

  it('no duplica si ya existe un gasto con el mismo recurrenteId', () => {
    const s = estado([recurrente()], [
      { id: 'g1', detalle: 'Netflix', importe: 9000, mes: 3, categoria: 'suscripciones', medio: 'credito', recurrenteId: 'r1' },
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(s.gastos).toHaveLength(1);
  });

  it('no duplica si el importe del gasto ya editado difiere del base', () => {
    const s = estado([recurrente()], [
      { id: 'g1', detalle: 'Netflix', importe: 12000, mes: 3, categoria: 'suscripciones', recurrenteId: 'r1' },
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
  });

  it('no duplica un gasto manual con el mismo detalle y categoría, ignorando tildes y mayúsculas', () => {
    const s = estado([recurrente({ detalle: 'Café con amigos' })], [
      { id: 'g1', detalle: 'CAFE CON AMIGOS', importe: 5000, mes: 3, categoria: 'suscripciones' },
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(s.gastos).toHaveLength(1);
  });

  it('sí genera si el gasto manual es de otra categoría', () => {
    const s = estado([recurrente()], [
      { id: 'g1', detalle: 'Netflix', importe: 5000, mes: 3, categoria: 'salidas' },
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(1);
    expect(s.gastos).toHaveLength(2);
  });

  it('sí genera si el gasto manual está en otro mes', () => {
    const s = estado([recurrente()], [
      { id: 'g1', detalle: 'Netflix', importe: 5000, mes: 4, categoria: 'suscripciones' },
    ]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(1);
  });

  it('usa el importe base actual, no uno viejo', () => {
    const s = estado([recurrente()]);

    ensureMonthRecurrentes(s, 3, OCTUBRE);
    s.recurrentes[0].importe = 12000;
    expect(ensureMonthRecurrentes(s, 4, OCTUBRE)).toBe(1);
    expect(s.gastos[1].importe).toBe(12000);
  });

  it('no toca los gastos ya cargados en el mes', () => {
    const manual = { id: 'g1', detalle: 'Alquiler', importe: 250000, mes: 3, categoria: 'vivienda' };
    const s = estado([recurrente()], [manual]);

    ensureMonthRecurrentes(s, 3, OCTUBRE);
    expect(manual).toEqual({ id: 'g1', detalle: 'Alquiler', importe: 250000, mes: 3, categoria: 'vivienda' });
  });

  it('devuelve 0 y no explota con un estado sin arrays', () => {
    expect(ensureMonthRecurrentes({}, 3, OCTUBRE)).toBe(0);
    expect(ensureMonthRecurrentes({ gastos: [], recurrentes: 'nada' }, 3, OCTUBRE)).toBe(0);
    expect(ensureMonthRecurrentes(null, 3, OCTUBRE)).toBe(0);
  });

  it('tolera un recurrente sin desdeMes ni salteados', () => {
    const s = estado([{ id: 'r1', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones', medio: 'credito', activo: true }]);

    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(1);
  });
});

describe('sincronizarImporteBase', () => {
  const conDosMeses = () => estado([recurrente()], [
    { id: 'g1', detalle: 'Netflix', importe: 8500, mes: 3, categoria: 'suscripciones', recurrenteId: 'r1' },
    { id: 'g2', detalle: 'Netflix', importe: 9500, mes: 8, categoria: 'suscripciones', recurrenteId: 'r1' },
  ]);

  it('actualiza la base con el importe del gasto', () => {
    const s = conDosMeses();

    const r = sincronizarImporteBase(s, { ...s.gastos[1], importe: 10500 });
    expect(r).toBe(s.recurrentes[0]);
    expect(s.recurrentes[0].importe).toBe(10500);
  });

  it('actualiza la base si es el único gasto de su recurrente', () => {
    const s = estado([recurrente()], [
      { id: 'g1', detalle: 'Netflix', importe: 8500, mes: 3, categoria: 'suscripciones', recurrenteId: 'r1' },
    ]);

    expect(sincronizarImporteBase(s, { ...s.gastos[0], importe: 9500 }).importe).toBe(9500);
  });

  it('actualiza la base también desde un mes viejo si se lo piden', () => {
    // La decisión de si el precio nuevo aplica a los meses siguientes la toma el
    // usuario con el checkbox del modal, así que acá no se bloquea el mes viejo.
    const s = conDosMeses();

    expect(sincronizarImporteBase(s, { ...s.gastos[0], importe: 3000 }).importe).toBe(3000);
  });

  it('no toca los gastos ya cargados de otros meses', () => {
    const s = conDosMeses();

    sincronizarImporteBase(s, { ...s.gastos[0], importe: 3000 });

    expect(s.gastos[0].importe).toBe(8500);
    expect(s.gastos[1].importe).toBe(9500);
  });

  it('ignora gastos manuales', () => {
    const s = conDosMeses();

    expect(sincronizarImporteBase(s, { id: 'x', importe: 3000, mes: 8 })).toBeNull();
    expect(s.recurrentes[0].importe).toBe(8500);
  });

  it('ignora un recurrente inexistente o borrado', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 3000, mes: 3, recurrenteId: 'r99' },
    ]);

    expect(sincronizarImporteBase(s, s.gastos[0])).toBeNull();
  });

  it('devuelve null si el importe no cambió', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 8500, mes: 8, categoria: 'suscripciones', recurrenteId: 'r1' },
    ]);

    expect(sincronizarImporteBase(s, s.gastos[0])).toBeNull();
    expect(s.recurrentes[0].importe).toBe(8500);
  });

  it('busca el recurrente por su id y no por otro campo', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' },
      { id: 'g2', importe: 4000, mes: 11, recurrenteId: 'r2' },
    ]);

    expect(sincronizarImporteBase(s, { ...s.gastos[0], importe: 9000 }).importe).toBe(9000);
  });
});

describe('registrarSalteo', () => {
  it('agrega el mes del gasto borrado', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' },
    ]);

    expect(registrarSalteo(s, s.gastos[0])).toBe(s.recurrentes[0]);
    expect(s.recurrentes[0].salteados).toEqual([3]);
  });

  it('no duplica el mismo mes', () => {
    const s = estado([recurrente({ salteados: [3] })], [
      { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' },
    ]);

    registrarSalteo(s, s.gastos[0]);
    expect(s.recurrentes[0].salteados).toEqual([3]);
  });

  it('deja los salteados ordenados', () => {
    const s = estado([recurrente({ salteados: [8] })]);

    registrarSalteo(s, { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' });
    expect(s.recurrentes[0].salteados).toEqual([3, 8]);
  });

  it('ignora gastos manuales y recurrentes inexistentes', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 8500, mes: 3 },
      { id: 'g2', importe: 8500, mes: 3, recurrenteId: 'r99' },
    ]);

    expect(registrarSalteo(s, s.gastos[0])).toBeNull();
    expect(registrarSalteo(s, s.gastos[1])).toBeNull();
    expect(s.recurrentes[0].salteados).toEqual([]);
  });

  it('crea el array si el recurrente no lo tenía', () => {
    const s = estado([{ id: 'r1', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones', activo: true }]);

    registrarSalteo(s, { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' });
    expect(s.recurrentes[0].salteados).toEqual([3]);
  });

  it('evita que el mes salteado se regenere', () => {
    const s = estado([recurrente()], [
      { id: 'g1', importe: 8500, mes: 3, recurrenteId: 'r1' },
    ]);

    registrarSalteo(s, s.gastos[0]);
    s.gastos = s.gastos.filter(g => g.id !== 'g1');
    expect(ensureMonthRecurrentes(s, 3, OCTUBRE)).toBe(0);
    expect(ensureMonthRecurrentes(s, 4, OCTUBRE)).toBe(1);
  });
});