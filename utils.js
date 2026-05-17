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

// ── Sanitization helpers ────────────────────────────────────

/** Strips leading/trailing whitespace and collapses internal runs of spaces */
export function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

/** Parses a float; returns NaN if the result is not finite */
export function sanitizeImporte(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Clamps a month index to the valid range [0, 11] */
export function sanitizeMes(value) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return 0;
  return Math.min(11, Math.max(0, n));
}

/** Returns the value only if it exists in the provided allowlist, otherwise returns the first item */
export function sanitizeEnum(value, allowedValues) {
  return allowedValues.includes(value) ? value : allowedValues[0];
}

export const MAX_BUDGET_AMOUNT = 999_999_999;

/**
 * Validates a budget update object.
 * @param {object} updates — { catKey: rawValue }
 * @returns {{ ok: boolean, errors: string[], data?: object }}
 */
export function validateBudgetUpdate(updates) {
  const errors = [];
  const cleanData = {};

  for (const [catKey, value] of Object.entries(updates)) {
    const amount = sanitizeImporte(value);
    if (isNaN(amount) || amount < 0) {
      errors.push(`El budget para "${catKey}" debe ser un número positivo.`);
    } else if (amount > MAX_BUDGET_AMOUNT) {
      errors.push(`El budget para "${catKey}" es demasiado alto.`);
    } else {
      cleanData[catKey] = amount;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], data: cleanData };
}

// ── Validation ──────────────────────────────────────────────

const VALID_MEDIOS     = ['efectivo', 'débito', 'crédito', 'transferencia', 'otro'];
const VALID_TIPOS_ING  = ['sueldo', 'freelance', 'inversión', 'regalo', 'otro'];

/**
 * Validates a gasto object.
 * @param {object} g — raw form data (detalle, importe, mes, categoria, medio)
 * @returns {{ ok: boolean, errors: string[], data?: object }}
 */
export function validateGasto(g) {
  const errors = [];

  const detalle   = sanitizeText(g.detalle);
  const importe   = sanitizeImporte(g.importe);
  const mes       = sanitizeMes(g.mes);
  const categoria = sanitizeText(g.categoria);
  const medio     = sanitizeEnum(g.medio, VALID_MEDIOS);

  if (!detalle)                       errors.push('El detalle no puede estar vacío.');
  if (detalle.length > 120)           errors.push('El detalle no puede superar los 120 caracteres.');
  if (isNaN(importe) || importe <= 0) errors.push('El importe debe ser un número mayor que cero.');
  if (importe > 999_999_999)          errors.push('El importe es demasiado alto.');
  if (!categoria)                     errors.push('Seleccioná una categoría.');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], data: { detalle, importe, mes, categoria, medio } };
}

/**
 * Validates an ingreso object.
 * @param {object} ing — raw form data (descripcion, importe, mes, tipo)
 * @returns {{ ok: boolean, errors: string[], data?: object }}
 */
export function validateIngreso(ing) {
  const errors = [];

  const descripcion = sanitizeText(ing.descripcion);
  const importe     = sanitizeImporte(ing.importe);
  const mes         = sanitizeMes(ing.mes);
  const tipo        = sanitizeEnum(ing.tipo, VALID_TIPOS_ING);

  if (!descripcion)                   errors.push('La descripción no puede estar vacía.');
  if (descripcion.length > 120)       errors.push('La descripción no puede superar los 120 caracteres.');
  if (isNaN(importe) || importe <= 0) errors.push('El importe debe ser un número mayor que cero.');
  if (importe > 999_999_999)          errors.push('El importe es demasiado alto.');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], data: { descripcion, importe, mes, tipo } };
}
