// ============================================================
// recurrentes.js — Lógica de los gastos recurrentes
// Responsabilidad: decidir qué gastos se autogeneran al entrar a
// un mes y mantener el importe base del recurrente al día. Todas
// las funciones son puras sobre `state`: no tocan el DOM ni
// guardan en localStorage (eso es responsabilidad de main.js).
// ============================================================

import { uid, normalizeText } from './utils.js';

/**
 * Crea los gastos recurrentes que faltan en el mes `mi`.
 *
 * @param {object} state           — el estado de la app; se muta `state.gastos`
 * @param {number} mi              — mes destino, 0-11
 * @param {number} [mesActual]     — tope: no se generan meses futuros, para no
 *                                   llenar la proyección anual de gastos estimados
 * @returns {number} cuántos gastos se crearon (0 si no había nada que hacer)
 *
 * Es idempotente: volver a llamarla para el mismo mes no duplica nada, así que
 * se puede llamar en cada `navigate()` sin worry.
 *
 * Se saltea un recurrente si está pausado, si el mes es anterior a su
 * `desdeMes`, si el usuario borró antes el gasto de ese mes (`salteados`), si ya
 * hay un gasto con su `recurrenteId`, o si hay un gasto manual con el mismo
 * detalle y categoría — esa última comprobación evita generar un duplicado de
 * algo que el usuario ya cargó a mano (y no puede tener `recurrenteId`).
 */
export function ensureMonthRecurrentes(state, mi, mesActual = new Date().getMonth()) {
  if (!state || mi > mesActual) return 0;
  if (!Array.isArray(state.gastos) || !Array.isArray(state.recurrentes)) return 0;

  const delMes = state.gastos.filter(g => g.mes === mi);
  let creados = 0;

  for (const r of state.recurrentes) {
    if (!r.activo) continue;
    if (mi < r.desdeMes) continue;
    if (Array.isArray(r.salteados) && r.salteados.includes(mi)) continue;
    if (delMes.some(g => g.recurrenteId === r.id)) continue;

    // Un detalle vacío no sirve para comparar: sin este chequeo, cualquier gasto
    // sin detalle del mismo mes taparía al recurrente.
    const detalle = normalizeText(r.detalle);
    if (detalle && delMes.some(g => g.categoria === r.categoria && normalizeText(g.detalle) === detalle)) continue;

    const gasto = {
      id: uid(),
      detalle: r.detalle,
      importe: r.importe,
      mes: mi,
      categoria: r.categoria,
      medio: r.medio,
      recurrenteId: r.id,
    };
    state.gastos.push(gasto);
    delMes.push(gasto);
    creados++;
  }

  return creados;
}

/**
 * Si el gasto editado es el más reciente de su recurrente, actualiza el importe
 * base para que el mes siguiente se genere con ese valor.
 *
 * La regla del "mes más reciente" evita que corregir un gasto viejo pise el
 * valor vigente: editar marzo no debe cambiar lo que se cobra en octubre.
 *
 * @returns {object|null} el recurrente actualizado, o null si no hubo nada que
 *   sincronizar (gasto manual, recurrente inexistente, mes viejo o importe igual)
 */
export function sincronizarImporteBase(state, gasto) {
  if (!state || !gasto?.recurrenteId) return null;

  const r = state.recurrentes?.find(x => x.id === gasto.recurrenteId);
  if (!r || r.importe === gasto.importe) return null;

  const mesMasReciente = state.gastos
    .filter(g => g.recurrenteId === r.id)
    .reduce((max, g) => (Number.isInteger(g.mes) && g.mes > max ? g.mes : max), -1);

  if (gasto.mes < mesMasReciente) return null;

  r.importe = gasto.importe;
  return r;
}

/**
 * Registra que el usuario borró el gasto generado de un mes, para que no se
 * vuelva a crear al navegar a él de nuevo.
 *
 * @returns {object|null} el recurrente actualizado, o null si el gasto era manual
 */
export function registrarSalteo(state, gasto) {
  if (!state || !gasto?.recurrenteId) return null;

  const r = state.recurrentes?.find(x => x.id === gasto.recurrenteId);
  if (!r) return null;

  if (!Array.isArray(r.salteados)) r.salteados = [];
  if (!r.salteados.includes(gasto.mes)) {
    r.salteados.push(gasto.mes);
    r.salteados.sort((a, b) => a - b);
  }
  return r;
}