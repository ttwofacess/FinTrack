// ============================================================
// utils.js — Funciones utilitarias puras
// Responsabilidad: helpers de formato, IDs y consultas de datos
// derivados del estado. No tocan el DOM ni localStorage.
// ============================================================

import { ALL_CATS, DEFAULT_META_AHORRO } from './constants.js';

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

// ── Comparativa mensual y meta de ahorro ────────────────────
//
// Helpers puros que cruzan el mes seleccionado con el anterior. Viven acá y no
// en el render porque la UI sólo los interpola: testeables sin fixtures de DOM.

/**
 * Balance del mes: exactamente lo que muestra el hero del dashboard
 * (ingresos − gastos que no son de crédito). Es la base de las comparativas y
 * de la meta, para que los números de la pantalla cierren entre sí.
 */
export function getBalanceMes(state, mi) {
  return totalIngresosMonth(state, mi) - totalCashGastosMonth(state, mi);
}

/**
 * Ahorro del mes. Decisión D1: hoy es el balance, la misma definición que usa
 * el badge de "tasa ahorro". Si alguna vez se quiere contar además los depósitos
 * de la categoría 'ahorro' (opción B), se cambia sólo esta función:
 *
 *   const depositos = cashGastosByMonth(state, mi)
 *     .filter(g => g.categoria === 'ahorro')
 *     .reduce((s, g) => s + (g.importe || 0), 0);
 *   return getBalanceMes(state, mi) + depositos;
 */
export function getAhorroMes(state, mi) {
  return getBalanceMes(state, mi);
}

/** ¿El mes tiene algún movimiento? Un mes vacío no es un balance 0: no se compara. */
export function hayDatosMes(state, mi) {
  return gastosByMonth(state, mi).length > 0 || ingresosByMonth(state, mi).length > 0;
}

/**
 * Variación porcentual entre dos montos, o null si no hay base de comparación
 * (previo 0 o ausente). Devolver null en vez de Infinity es lo que permite al
 * render mostrar el monto en pesos cuando el mes anterior cerró en 0.
 *
 * El denominador va con abs() a propósito: con previo negativo, pasar de −100 a
 * +50 es una mejora, y sin el abs la fórmula daría −150%.
 */
export function variacionPct(actual, previo) {
  if (!previo) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}

/**
 * Comparativa del balance contra el mes anterior, o null si no es comparable.
 * Enero no tiene mes anterior dentro del año (los registros no guardan año) y un
 * mes previo sin movimientos tampoco sirve de base.
 */
export function getComparativaBalance(state, mi) {
  if (mi <= 0 || !hayDatosMes(state, mi - 1)) return null;
  const actual = getBalanceMes(state, mi);
  const previo = getBalanceMes(state, mi - 1);
  return { actual, previo, diff: actual - previo, pct: variacionPct(actual, previo) };
}

/**
 * Delta de gasto por categoría contra el mes anterior.
 * @returns {Object} { [catKey]: { actual, previo, diff, pct } } — en enero o
 *                    con el mes previo vacío, previo/diff/pct vienen en null.
 *
 * Usa gastoByCat (incluye el crédito) para ser consistente con las barras del
 * bar chart, que no distinguen el medio de pago.
 */
export function deltasCategorias(state, mi) {
  const comparable = mi > 0 && hayDatosMes(state, mi - 1);
  const out = {};
  for (const c of ALL_CATS) {
    const actual = gastoByCat(state, mi, c.key);
    const previo = comparable ? gastoByCat(state, mi - 1, c.key) : null;
    out[c.key] = {
      actual,
      previo,
      diff: previo === null ? null : actual - previo,
      pct:  previo === null ? null : variacionPct(actual, previo),
    };
  }
  return out;
}

/**
 * Los 12 balances del año para el sparkline, uno por mes.
 * Los meses sin movimientos vienen en null, no en 0: un mes vacío no es un
 * balance cero y dibujarlo así armaría una caída falsa en la línea.
 */
export function getBalancesAnuales(state) {
  return Array.from({ length: 12 }, (_, i) =>
    hayDatosMes(state, i) ? getBalanceMes(state, i) : null);
}

/**
 * Monto objetivo de la meta para el mes. Con tipo 'porcentaje' depende de los
 * ingresos del mes, así que devuelve 0 si el mes no tuvo ingresos.
 */
export function metaAhorroMonto(state, mi) {
  const { tipo, valor } = state.metaAhorro || DEFAULT_META_AHORRO;
  return tipo === 'porcentaje' ? (totalIngresosMonth(state, mi) * valor) / 100 : valor;
}

/**
 * Avance contra la meta de ahorro del mes.
 * @returns {{ meta: number, ahorro: number, pct: number|null,
 *             cumplida: boolean, faltante: number }}
 * pct es null cuando no hay meta calculable (valor 0, o porcentaje sin ingresos):
 * sin objetivo no hay porcentaje que mostrar.
 */
export function progresoMetaAhorro(state, mi) {
  const meta   = metaAhorroMonto(state, mi);
  const ahorro = getAhorroMes(state, mi);
  if (!(meta > 0)) return { meta, ahorro, pct: null, cumplida: false, faltante: 0 };
  return {
    meta,
    ahorro,
    pct: (ahorro / meta) * 100,
    cumplida: ahorro >= meta,
    faltante: Math.max(0, meta - ahorro),
  };
}

// ── Búsqueda y orden ───────────────────────────────────────
//
// Helpers puros para filtrar y ordenar listas de registros (gastos, ingresos)
// que comparten los campos `importe` y `categoria`. El estado del store está en
// orden de carga, así que "lo último agregado" es el array invertido: eso es lo
// que hace `sortRecords` como base.

const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Minúsculas + sin tildes/diacríticos y sin espacios extremos. "Café" → "cafe".
 * Ojo: la NFD también descompone la eñe, así que "Añejo" queda "anejo". Sirve
 * para comparar, no para mostrar: el texto original nunca se reescribe.
 */
export function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim();
}

/**
 * ¿Aparecen TODAS las palabras de `query` en alguno de los `fields`?
 * Cada palabra puede estar en un field distinto: "coto super" matchea
 * "Super Coto" sin importar el orden. Query vacía = todo matchea.
 * Ignora mayúsculas y tildes.
 */
export function matchesQuery(query, ...fields) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.map(normalizeText).join(' ');
  return tokens.every(t => haystack.includes(t));
}

// 'carga' es el orden de carga tal cual (sin invertir), para las pantallas que
// hoy muestran el más viejo primero y no deben cambiar de comportamiento.
export const SORT_MODES = ['recientes', 'monto-desc', 'monto-asc', 'categoria', 'carga'];

/**
 * Devuelve una copia ordenada; no muta la entrada.
 *
 * La base es "más recientes primero" (el array de entrada está en orden de
 * carga, así que se invierte). Como Array.prototype.sort es estable, en
 * 'monto-*' los empates conservan ese criterio, y 'carga' lo descarta a
 * propósito devolviendo el orden original.
 *
 * @param {Array}     records
 * @param {string}    mode         — uno de SORT_MODES; un valor desconocido
 *                                   cae en 'recientes' en vez de romper
 * @param {Function} [categoryLabel] — (record) => string; necesario para 'categoria'
 */
export function sortRecords(records, mode, categoryLabel) {
  const list = [...records].reverse();
  switch (mode) {
    case 'monto-desc':
      return list.sort((a, b) => (b.importe || 0) - (a.importe || 0));
    case 'monto-asc':
      return list.sort((a, b) => (a.importe || 0) - (b.importe || 0));
    case 'categoria':
      if (typeof categoryLabel !== 'function') return list;
      return list.sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'es'));
    case 'carga':
      return [...records];
    default: // 'recientes' o valor desconocido
      return list;
  }
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

export const META_TIPOS = ['porcentaje', 'monto'];

/**
 * Valida la meta de ahorro.
 * Un `tipo` desconocido no es un error: cae a 'porcentaje' (el primer valor de
 * la allowlist), igual que hace sanitizeEnum con el medio de pago. El valor sí
 * tiene que ser un número >= 0, y el techo depende del tipo: 100% para un
 * porcentaje, MAX_BUDGET_AMOUNT para un monto.
 *
 * @param {object} m — { tipo, valor }
 * @returns {{ ok: boolean, errors: string[], data?: { tipo: string, valor: number } }}
 */
export function validateMetaAhorro(m) {
  const tipo  = sanitizeEnum(m?.tipo, META_TIPOS);
  const valor = sanitizeImporte(m?.valor);

  if (isNaN(valor)) {
    return { ok: false, errors: [esImporteAmbiguo(m?.valor)
      ? `La meta "${String(m.valor).trim()}" es ambigua: el punto puede ser decimal o de miles; ${IMPORTE_AMBIGUO_AYUDA}.`
      : 'La meta debe ser un número mayor o igual a cero.'] };
  }
  if (valor < 0) {
    return { ok: false, errors: ['La meta debe ser un número mayor o igual a cero.'] };
  }
  if (tipo === 'porcentaje' && valor > 100) {
    return { ok: false, errors: ['El porcentaje no puede superar 100.'] };
  }
  if (tipo === 'monto' && valor > MAX_BUDGET_AMOUNT) {
    return { ok: false, errors: ['La meta es demasiado alta.'] };
  }

  return { ok: true, errors: [], data: { tipo, valor } };
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
