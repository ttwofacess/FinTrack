// ============================================================
// utils.js — Funciones utilitarias puras
// Responsabilidad: helpers de formato, IDs y consultas de datos
// derivados del estado. No tocan el DOM ni localStorage.
// ============================================================

import { ALL_CATS } from './constants.js';

/** Formatea un número como pesos argentinos */
export function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

/** Genera un ID único */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Devuelve metadata de una categoría por clave */
export function catInfo(key) {
  return ALL_CATS.find(c => c.key === key) || { label: key, icon: '📦', color: '#888' };
}

// ── Consultas de datos ─────────────────────────────────────

export function gastosByMonth(state, mi) {
  return state.gastos.filter(g => g.mes === mi);
}

export function ingresosByMonth(state, mi) {
  return state.ingresos.filter(g => g.mes === mi);
}

export function totalGastosMonth(state, mi) {
  return gastosByMonth(state, mi).reduce((s, g) => s + (g.importe || 0), 0);
}

export function totalIngresosMonth(state, mi) {
  return ingresosByMonth(state, mi).reduce((s, g) => s + (g.importe || 0), 0);
}

export function totalBudgetMonth(state, mi) {
  const b = state.budgets[mi] || {};
  return Object.values(b).reduce((s, v) => s + (v || 0), 0);
}

export function gastoByCat(state, mi, catKey) {
  return gastosByMonth(state, mi)
    .filter(g => g.categoria === catKey)
    .reduce((s, g) => s + g.importe, 0);
}
