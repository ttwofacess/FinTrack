// ============================================================
// ui.js — Componentes de UI reutilizables
// Responsabilidad: construir fragmentos HTML y controlar
// elementos de interfaz genéricos (toast, modales, month
// selector). No contiene lógica de negocio.
// ============================================================

import { MESES } from './constants.js';

/** Muestra un toast temporario */
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/** Cierra todos los modales */
export function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

/**
 * Construye un selector de meses en el elemento indicado.
 * @param {string} containerId  — id del contenedor
 * @param {number} selectedMonth — mes activo
 * @param {(mi: number) => void} onChange — callback al seleccionar
 */
export function buildMonthSelector(containerId, selectedMonth, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  MESES.forEach((m, i) => {
    const btn = document.createElement('div');
    btn.className = 'month-btn' + (i === selectedMonth ? ' active' : '');
    btn.textContent = m.slice(0, 3);
    btn.addEventListener('click', () => {
      el.querySelectorAll('.month-btn').forEach((b, j) => b.classList.toggle('active', j === i));
      onChange(i);
    });
    el.appendChild(btn);
  });
  setTimeout(() => {
    const active = el.querySelector('.active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 50);
}

/** Sincroniza todos los selectores de mes al mes activo del estado */
export function syncAllMonthSelectors(selectedMonth) {
  ['dash-months', 'gastos-months', 'presup-months', 'ing-months'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('.month-btn').forEach((b, i) => {
      b.classList.toggle('active', i === selectedMonth);
    });
  });
}

/** HTML de un ítem de gasto (usado en lista y dashboard) */
export function gastoItemHTML(g, catInfoFn, fmtFn) {
  const ci = catInfoFn(g.categoria);
  return `<div class="gasto-item" data-id="${g.id}">
    <div class="gasto-icon" style="background:${ci.color}22">${ci.icon}</div>
    <div class="gasto-info">
      <div class="gasto-name">${g.detalle}</div>
      <div class="gasto-meta">${ci.label} · ${g.medio || 'efectivo'}</div>
    </div>
    <div class="gasto-amount" style="color:${ci.color}">${fmtFn(g.importe)}</div>
  </div>`;
}
