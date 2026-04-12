// ============================================================
// ingresos.js — Pantalla Ingresos + Modal de ingreso
// Responsabilidad: renderizar la vista de ingresos y gestionar
// el modal para agregar nuevos registros.
// ============================================================

import { MESES, CUR_YEAR } from './constants.js';
import { fmt, uid, ingresosByMonth, totalIngresosMonth } from './utils.js';
import { buildMonthSelector, closeModals, showToast } from './ui.js';

/**
 * @param {object}   state
 * @param {Function} onMonthChange
 */
export function renderIngresos(state, onMonthChange) {
  const mi  = state.selectedMonth;
  buildMonthSelector('ing-months', mi, onMonthChange);

  const ings  = ingresosByMonth(state, mi);
  const total = totalIngresosMonth(state, mi);
  const prev  = mi > 0 ? totalIngresosMonth(state, mi - 1) : 0;
  const avg   = state.ingresos.length > 0
    ? MESES.reduce((s, _, i) => s + totalIngresosMonth(state, i), 0) / 12
    : 0;

  document.getElementById('ing-summary-cards').innerHTML = `
    <div class="ingreso-card">
      <div class="ingreso-label">este mes</div>
      <div class="ingreso-value" style="color:var(--green)">${fmt(total)}</div>
      <div class="ingreso-month-label">${MESES[mi]}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">mes anterior</div>
      <div class="ingreso-value" style="color:var(--text2)">${fmt(prev)}</div>
      <div class="ingreso-month-label">${mi > 0 ? MESES[mi - 1] : '—'}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">promedio anual</div>
      <div class="ingreso-value" style="color:var(--accent)">${fmt(avg)}</div>
      <div class="ingreso-month-label">${CUR_YEAR}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">total año</div>
      <div class="ingreso-value" style="color:var(--accent4)">${fmt(avg * 12)}</div>
      <div class="ingreso-month-label">proyectado</div>
    </div>
  `;

  const listEl = document.getElementById('ing-list');
  if (ings.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>Sin ingresos este mes<br>Tocá + nuevo para agregar</div>';
  } else {
    listEl.innerHTML = ings.map(g => `
      <div class="ingreso-list-item">
        <div class="ili-left">
          <div class="ili-name">${g.descripcion}</div>
          <div class="ili-type">${g.tipo}</div>
        </div>
        <div><div class="ili-amount">${fmt(g.importe)}</div></div>
      </div>`).join('');
  }
}

/** Abre el modal de nuevo ingreso */
export function openNewIngreso(selectedMonth) {
  document.getElementById('fi-desc').value   = '';
  document.getElementById('fi-importe').value = '';
  document.getElementById('fi-mes').innerHTML =
    MESES.map((m, i) => `<option value="${i}" ${i === selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
  document.getElementById('modal-ingreso').classList.add('open');
}

/** Registra listeners del modal de ingresos (llamar una sola vez en init) */
export function initIngresoModal(getState, onSave) {
  document.getElementById('btn-add-ingreso').addEventListener('click', () => {
    openNewIngreso(getState().selectedMonth);
  });

  document.getElementById('btn-save-ingreso').addEventListener('click', () => {
    const desc    = document.getElementById('fi-desc').value.trim();
    const importe = parseFloat(document.getElementById('fi-importe').value);
    const mes     = parseInt(document.getElementById('fi-mes').value);
    const tipo    = document.getElementById('fi-tipo').value;

    if (!desc || isNaN(importe) || importe <= 0) {
      showToast('Completá descripción e importe');
      return;
    }
    onSave({ id: uid(), descripcion: desc, importe, mes, tipo });
    closeModals();
    showToast('✓ Ingreso guardado');
  });
}
