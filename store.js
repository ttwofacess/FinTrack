// ============================================================
// store.js — Persistencia y acceso al estado global
// Responsabilidad: leer, escribir y construir el estado de la
// app en localStorage. No renderiza ni manipula el DOM.
// ============================================================

import { MESES, ALL_CATS, DEFAULT_META_AHORRO } from './constants.js';
import { validateMetaAhorro, sanitizeText, sanitizeImporte, sanitizeMes } from './utils.js';

const STORAGE_KEY = 'fintrack_v2';
const now = new Date();

export function defaultState() {
  const budgets = {};
  MESES.forEach((_, i) => {
    budgets[i] = {};
    ALL_CATS.forEach(c => { budgets[i][c.key] = 0; });
  });
  return {
    gastos: [],
    ingresos: [],
    recurrentes: [],
    budgets,
    selectedMonth: now.getMonth(),
    metaAhorro: { ...DEFAULT_META_AHORRO },
  };
}

export function getState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return raw ? normalizeState(raw) : defaultState();
  } catch {
    return defaultState();
  }
}

// Un mes vale solo si es un entero dentro de [0, 11]. No se usa sanitizeMes
// porque convierte lo basura en 0, y un 'salteados' con un "abc" terminaría
// silenciosamente salteando enero.
function esMesValido(m) {
  return Number.isInteger(m) && m >= 0 && m <= 11;
}

/**
 * Completa un recurrente con los defaults de su forma.
 *
 * Es un saneo *suave*: nunca descarta el registro, solo arregla los campos que
 * faltan o son del tipo equivocado. La validación estricta (detalle obligatorio,
 * importe > 0, categoría válida) vive en `validateRecurrente`, que corre cuando
 * el usuario guarda; acá el objetivo es que un estado viejo, importado a mano o
 * manipulado en localStorage nunca rompa el render de la app.
 */
function normalizeRecurrente(r, index) {
  const importe = sanitizeImporte(r.importe);
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `rec-${index}`,
    detalle: sanitizeText(r.detalle),
    importe: isNaN(importe) || importe < 0 ? 0 : importe,
    categoria: typeof r.categoria === 'string' ? r.categoria : '',
    medio: typeof r.medio === 'string' && r.medio ? r.medio : 'efectivo',
    activo: r.activo === undefined || r.activo === null ? true : Boolean(r.activo),
    desdeMes: esMesValido(r.desdeMes) ? r.desdeMes : sanitizeMes(r.desdeMes),
    salteados: Array.isArray(r.salteados)
      ? [...new Set(r.salteados.filter(esMesValido))].sort((a, b) => a - b)
      : [],
  };
}

export function normalizeState(s) {
  // 1. Asegurar que existen las colecciones básicas
  if (!s.gastos) s.gastos = [];
  if (!s.ingresos) s.ingresos = [];
  if (!s.budgets) s.budgets = {};

  // 2. Normalizar medios de pago y categorías en gastos existentes
  s.gastos.forEach(g => {
    // Corregir acentos si existen (Migración Step 10)
    if (g.medio === 'débito') g.medio = 'debito';
    if (g.medio === 'crédito') g.medio = 'credito';
    if (!g.medio) g.medio = 'efectivo';
  });

  // 3. Asegurar que todos los meses tengan todas las categorías en sus budgets
  MESES.forEach((_, i) => {
    if (!s.budgets[i]) s.budgets[i] = {};
    ALL_CATS.forEach(c => {
      if (s.budgets[i][c.key] === undefined) {
        s.budgets[i][c.key] = 0;
      }
    });
  });

  // 4. La meta de ahorro no existe en los estados guardados antes de esta
  // feature: se completa con el default y una corrupta también cae al default,
  // así un estado viejo o manipulado nunca deja la pantalla sin renderizar.
  const meta = validateMetaAhorro(s.metaAhorro);
  s.metaAhorro = meta.ok ? meta.data : { ...DEFAULT_META_AHORRO };

  // 5. Los recurrentes tampoco existen en los estados anteriores a la feature.
  // Cada uno se completa con sus defaults y los elementos que ni siquiera son
  // objetos (null, strings) se descartan: no hay forma de renderizarlos.
  if (!Array.isArray(s.recurrentes)) {
    s.recurrentes = [];
  } else {
    s.recurrentes = s.recurrentes
      .filter(r => r && typeof r === 'object' && !Array.isArray(r))
      .map(normalizeRecurrente);
  }

  return s;
}

/**
 * Escribe el estado en localStorage.
 * @returns {boolean} true si se guardó, false si el almacenamiento falló.
 *
 * Un fallo acá (cuota llena, modo privado, permisos) no puede interrumpir al
 * caller: la app sigue funcionando con el estado en memoria, pero sin
 * persistencia. Por eso el error se captura y se reporta en consola en lugar de
 * propagarse — si se escapara, cortaba el callback de guardado y el usuario
 * perdía el cambio sin ninguna señal.
 */
export function setState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch (error) {
    console.warn('[FinTrack] No se pudo guardar el estado en localStorage:', error);
    return false;
  }
}
