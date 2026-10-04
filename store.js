// ============================================================
// store.js — Persistencia y acceso al estado global
// Responsabilidad: leer, escribir y construir el estado de la
// app en localStorage. No renderiza ni manipula el DOM.
// ============================================================

import { MESES, ALL_CATS } from './constants.js';

const STORAGE_KEY = 'fintrack_v2';
const now = new Date();

export function defaultState() {
  const budgets = {};
  MESES.forEach((_, i) => {
    budgets[i] = {};
    ALL_CATS.forEach(c => { budgets[i][c.key] = 0; });
  });
  return { gastos: [], ingresos: [], budgets, selectedMonth: now.getMonth() };
}

export function getState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return raw ? normalizeState(raw) : defaultState();
  } catch {
    return defaultState();
  }
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
