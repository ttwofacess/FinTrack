// ============================================================
// ui.js — Componentes de UI reutilizables
// Responsabilidad: construir fragmentos HTML y controlar
// elementos de interfaz genéricos (toast, modales, month
// selector). No contiene lógica de negocio.
// ============================================================

import { MESES } from './constants.js';
import { html, raw } from './utils.js';

/** Muestra un toast temporario */
export function showToast(msg, options = {}) {
  const t = document.getElementById('toast');
  t.textContent = '';
  
  const text = document.createElement('span');
  text.textContent = msg;
  t.appendChild(text);
  
  if (options.actionLabel && options.onAction) {
    const btn = document.createElement('button');
    btn.textContent = options.actionLabel;
    btn.className = 'toast-action';
    btn.addEventListener('click', () => {
      options.onAction();
      t.classList.remove('show');
    });
    t.appendChild(btn);
  }
  
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), options.duration || 5000);
}

/** Cierra todos los modales */
export function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

/**
 * Toast para un cambio que se aplicó en memoria pero no llegó a persistirse.
 * @param {string} que — qué se intentó guardar, para que el mensaje sea accionable
 *
 * store.setState() devuelve false cuando localStorage falla (cuota llena, modo
 * privado, permisos). La app sigue andando con el estado en memoria, así que sin
 * este aviso el usuario cierra la pestaña creyendo que guardó y lo pierde todo.
 */
export function toastSinPersistencia(que) {
  showToast(`⚠️ ${que} sin guardar: el almacenamiento del navegador está lleno o bloqueado`, {
    duration: 8000,
  });
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
  const medioLabel = g.medio === 'credito' ? '💳 crédito' : (g.medio || 'efectivo');

  return html`<div class="gasto-item" data-id="${g.id}">
    <div class="gasto-icon" style="background:${ci.color}22">${ci.icon}</div>
    <div class="gasto-info">
      <div class="gasto-name">${g.detalle}</div>
      <div class="gasto-meta">${ci.label} · ${medioLabel}</div>
    </div>
    <div class="gasto-amount" style="color:${ci.color}">${fmtFn(g.importe)}</div>
  </div>`;
}

/** Un valor sin datos corta la línea en vez de dibujar un balance 0. */
const esHueco = (v) => v === null || v === undefined;

/**
 * Sparkline en SVG puro (sin librerías): un <path> con los valores y un punto
 * opcional en el mes activo.
 *
 * @param {(number|null)[]} values   — un valor por mes; null = sin datos
 * @param {object}  [opts]
 * @param {number}  [opts.activeIndex] — mes a resaltar (o -1)
 * @param {string}  [opts.label]       — texto alternativo del SVG
 * @param {number}  [opts.width]
 * @param {number}  [opts.height]
 * @returns {string} markup, o '' si no hay ningún valor
 *
 * Devuelve markup y no un nodo: el caller lo asigna a un contenedor, igual que
 * el resto de los helpers de este módulo.
 */
export function sparklineSVG(values, { activeIndex = -1, label = '', width = 120, height = 32 } = {}) {
  const conDatos = values.filter(v => !esHueco(v));
  if (conDatos.length === 0) return '';

  // Escala lineal sobre el rango real. Cuando min === max la línea queda
  // centrada: dividir por cero produciría NaN en todos los puntos del path.
  const pad = 3;
  const min = Math.min(...conDatos);
  const max = Math.max(...conDatos);
  const x = (i) => pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v) => (max === min
    ? height / 2
    : pad + (1 - (v - min) / (max - min)) * (height - 2 * pad));

  // Un hueco levanta el lápiz: el siguiente tramo arranca con 'M' y la línea no
  // se une a través del mes sin datos.
  let d = '';
  let baja = false;
  values.forEach((v, i) => {
    if (esHueco(v)) { baja = false; return; }
    d += `${baja ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    baja = true;
  });

  // Un mes con datos totalmente aislado no dibuja nada con un 'M' suelto (un
  // path necesita dos puntos), así que se marca con un punto chico.
  let sueltos = '';
  for (let i = 0; i < values.length; i++) {
    const isolated = !esHueco(values[i]) && esHueco(values[i - 1]) && esHueco(values[i + 1]);
    if (isolated && i !== activeIndex) {
      sueltos += `<circle cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="1.5" fill="currentColor"/>`;
    }
  }

  const activo = !esHueco(values[activeIndex])
    ? `<circle cx="${x(activeIndex).toFixed(1)}" cy="${y(values[activeIndex]).toFixed(1)}" r="2.5" fill="currentColor"/>`
    : '';

  return html`<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}" preserveAspectRatio="none">
    <path d="${raw(d.trim())}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${raw(sueltos + activo)}
  </svg>`;
}
