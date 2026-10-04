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

// ── Escapado de HTML ───────────────────────────────────────
//
// Los campos de texto que el usuario carga (detalle, descripcion) llegan
// desde el formulario o desde un JSON importado, así que no son confiables.
// Assigned a innerHTML deben escaparse SIEMPRE en el momento del render, no
// al guardar: escapar al guardar alteraría el dato persistido y complicaría
// las comparaciones. Usá el tag `html` en vez de interpolar a mano.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const UNSAFE_CHARS = /[&<>"']/g;

/** Escapa los caracteres con significado en HTML y en atributos. */
export function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(UNSAFE_CHARS, ch => ESCAPE_MAP[ch]);
}

/** Marca un string como HTML ya confiable para que `html` no lo escape dos veces. */
class SafeHtml {
  constructor(value) {
    this.value = String(value);
  }
  toString() {
    return this.value;
  }
}

/** Envuelve markup confiable que ya se quiere insertar literal. */
export function raw(value) {
  return new SafeHtml(value);
}

/**
 * Tagged template que escapa cada valor interpolado.
 * Pensado para armar markup que después se asigna a innerHTML:
 *
 *   el.innerHTML = html`<div class="x">${userInput}</div>`;
 *
 * Lo que quede como texto estático en el template NO se escapa, así que
 * `html` también sirve para composing markup. Para interpolar markup
 * confiable usá `raw(...)`.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    out += (value instanceof SafeHtml ? value.value : escapeHtml(value)) + strings[i + 1];
  }
  return out;
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

// ── Credit Card & Cash Logic ───────────────────────────────

/** Gastos que impactan en el efectivo/débito del mes actual */
export function cashGastosByMonth(state, mi) {
  // Incluye todo excepto lo pagado con crédito
  return gastosByMonth(state, mi).filter(g => g.medio !== 'credito');
}

/** Gastos realizados con tarjeta de crédito en el mes */
export function creditGastosByMonth(state, mi) {
  return gastosByMonth(state, mi).filter(g => g.medio === 'credito');
}

/** Pagos realizados a la tarjeta (categoría pay_card) */
export function cardPaymentsByMonth(state, mi) {
  return gastosByMonth(state, mi).filter(g => g.categoria === 'pay_card');
}

export function totalCashGastosMonth(state, mi) {
  return cashGastosByMonth(state, mi).reduce((s, g) => s + (g.importe || 0), 0);
}

export function totalCreditGastosMonth(state, mi) {
  return creditGastosByMonth(state, mi).reduce((s, g) => s + (g.importe || 0), 0);
}

export function totalCardPaymentsMonth(state, mi) {
  return cardPaymentsByMonth(state, mi).reduce((s, g) => s + (g.importe || 0), 0);
}

/**
 * Saldo con signo de la tarjeta al FINAL de un mes.
 * Positivo = deuda pendiente. Negativo = saldo a favor (crédito).
 *
 * Los pagos que superan la deuda NO se descartan: quedan como crédito y
 * compensan las compras de los meses siguientes, que es como se comporta
 * una tarjeta real. Por eso el acumulador no se clampea a 0 mes a mes;
 * clampear en cada paso hacía que un sobrepago se perdiera.
 */
export function getCardBalanceAtEnd(state, mi) {
  let balance = 0;
  for (let i = 0; i <= mi; i++) {
    balance += totalCreditGastosMonth(state, i) - totalCardPaymentsMonth(state, i);
  }
  return balance;
}

/**
 * Deuda de tarjeta acumulada al FINAL de un mes.
 * Siempre >= 0: el saldo a favor se consulta con getCardBalanceAtEnd.
 */
export function getCardDebtAtEnd(state, mi) {
  return Math.max(0, getCardBalanceAtEnd(state, mi));
}

/** Deuda que viene del mes anterior */
export function getCardDebtAtStart(state, mi) {
  if (mi === 0) return 0;
  return getCardDebtAtEnd(state, mi - 1);
}

export function totalBudgetMonth(state, mi) {
  const b = state.budgets[mi] || {};
  return Object.values(b).reduce((s, v) => s + (v || 0), 0);
}

export function gastoByCat(state, mi, catKey) {
  return gastosByMonth(state, mi)
    .filter(g => g.categoria === catKey)
    .reduce((s, g) => s + (g.importe || 0), 0);
}

// ── Sanitization helpers ────────────────────────────────────

/** Strips leading/trailing whitespace and collapses internal runs of spaces */
export function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

// Formatos numéricos aceptados. Se validan con el string COMPLETO: parseFloat
// acepta cualquier prefijo numérico y descarta el resto, así que "100abc"
// devolvía 100 y "1.500,50" devolvía 1.5 (corrupción silenciosa de un importe
// escrito en formato es-AR). Se prefiere el rechazo explícito a un importe mal
// parseado: los formularios usan <input type="number">, que ya entrega strings
// limpios, así que el parseo laxo solo se aprovechaba en el import.
const IMPORTE_PLAIN         = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
const IMPORTE_GROUP_DOT     = /^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/;  // 1.234.567,89
const IMPORTE_GROUP_COMMA   = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;  // 1,234,567.89
const IMPORTE_DECIMAL_COMMA = /^[+-]?\d+(,\d+)?$/;               // 1234,56

// "250.000" es ambiguo: se puede leer como 250 con tres decimales o como 250000
// en formato es-AR. Los grupos de miles siempre son de a tres, así que un único
// grupo de tres dígitos separado por punto es exactamente el caso imposible de
// desambiguar. Elegir una lectura sin avisar corrompe el dato —un alquiler de
// $250.000 se guardaba como $250—, así que se rechaza y el usuario escribe
// 250000 o 250.000,00. Sólo aplica al import: los formularios ya traen el
// importe como número desde <input type="number">.
const IMPORTE_AMBIGUO = /^[+-]?\d{1,3}\.\d{3}$/;

/** ¿El string tiene la forma ambigua "250.000" (punto de miles o decimal)? */
function esImporteAmbiguo(value) {
  return typeof value === 'string' && IMPORTE_AMBIGUO.test(value.trim());
}

// Cómo escribirlo sin ambigüedad, para el mensaje de error.
const IMPORTE_AMBIGUO_AYUDA = 'escribilo como 250000 o como 250.000,00';

/**
 * Convierte un importe a número; devuelve NaN si no representa uno válido.
 * Acepta números y strings, incluyendo separador de miles y coma decimal
 * (formatos es-AR y en-US). Rechaza cualquier otro carácter en vez de
 * ignorar la basura: "100abc" es NaN, no 100. También rechaza el formato
 * ambiguo "250.000" (ver IMPORTE_AMBIGUO).
 */
export function sanitizeImporte(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;

  const s = value.trim();
  if (s === '') return NaN;
  if (IMPORTE_AMBIGUO.test(s)) return NaN;

  let normalized;
  if (IMPORTE_PLAIN.test(s)) {
    normalized = s;
  } else if (IMPORTE_GROUP_DOT.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (IMPORTE_GROUP_COMMA.test(s)) {
    normalized = s.replace(/,/g, '');
  } else if (IMPORTE_DECIMAL_COMMA.test(s)) {
    normalized = s.replace(',', '.');
  } else {
    return NaN;
  }

  const n = Number(normalized);
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
      errors.push(esImporteAmbiguo(value)
        ? `El budget para "${catKey}" es ambiguo ("${String(value).trim()}"); ${IMPORTE_AMBIGUO_AYUDA}.`
        : `El budget para "${catKey}" debe ser un número positivo.`);
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

const VALID_MEDIOS     = ['efectivo', 'debito', 'credito', 'transferencia', 'otro'];
const VALID_TIPOS_ING  = ['sueldo', 'aguinaldo', 'freelance', 'inversiones', 'otros'];

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
  if (isNaN(importe)) {
    errors.push(esImporteAmbiguo(g.importe)
      ? `El importe "${String(g.importe).trim()}" es ambiguo: el punto puede ser decimal o de miles; ${IMPORTE_AMBIGUO_AYUDA}.`
      : 'El importe debe ser un número mayor que cero.');
  } else if (importe <= 0) {
    errors.push('El importe debe ser un número mayor que cero.');
  }
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
  if (isNaN(importe)) {
    errors.push(esImporteAmbiguo(ing.importe)
      ? `El importe "${String(ing.importe).trim()}" es ambiguo: el punto puede ser decimal o de miles; ${IMPORTE_AMBIGUO_AYUDA}.`
      : 'El importe debe ser un número mayor que cero.');
  } else if (importe <= 0) {
    errors.push('El importe debe ser un número mayor que cero.');
  }
  if (importe > 999_999_999)          errors.push('El importe es demasiado alto.');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], data: { descripcion, importe, mes, tipo } };
}
