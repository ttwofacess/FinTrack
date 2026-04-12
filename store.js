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
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultState();
  } catch {
    return defaultState();
  }
}

export function setState(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
