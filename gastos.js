// ============================================================
// gastos.js — Pantalla Gastos + Modal de gasto
// Responsabilidad: renderizar la lista de gastos con filtros
// y gestionar el ciclo de vida del modal (nuevo / editar /
// eliminar). No persiste datos directamente; delega en el
// callback onSave / onDelete.
// ============================================================

import { MESES, CAT_FIJOS, CAT_VARIABLES } from './constants.js';
import { fmt, catInfo, gastosByMonth, uid, validateGasto, html, raw } from './utils.js';
import { buildMonthSelector, closeModals, showToast, toastSinPersistencia, gastoItemHTML } from './ui.js';

let gastoFilter   = 'all';
let editingGastoId = null;

/**
 * @param {object}   state
 * @param {Function} onMonthChange
 * @param {Function} onSave    — (gastoActualizado) => void
 * @param {Function} onDelete  — (id) => void
 */
export function renderGastos(state, onMonthChange, onSave, onDelete) {
  const mi    = state.selectedMonth;
  buildMonthSelector('gastos-months', mi, (i) => { gastoFilter = 'all'; onMonthChange(i); });

  const gastos = gastosByMonth(state, mi);
  
  _renderFilters(gastos, state, onMonthChange, onSave, onDelete);
  _renderList(gastos, state, onSave, onDelete);
}

function _renderFilters(gastos, state, onMonthChange, onSave, onDelete) {
  const filterEl = document.getElementById('gastos-filters');
  const cats     = [...new Set(gastos.map(g => g.categoria))];

  filterEl.innerHTML =
    html`<div class="filter-chip ${gastoFilter === 'all' ? 'active' : ''}" data-cat="all">Todos</div>` +
    html`<div class="filter-chip ${gastoFilter === 'credito' ? 'active' : ''}" data-cat="credito">💳 Crédito</div>` +
    cats.map(c => {
      const ci = catInfo(c);
      return html`<div class="filter-chip ${gastoFilter === c ? 'active' : ''}" data-cat="${c}">${ci.icon} ${ci.label}</div>`;
    }).join('');

  filterEl.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      gastoFilter = el.dataset.cat;
      renderGastos(state, onMonthChange, onSave, onDelete);
    });
  });
}

function _renderList(gastos, state, onSave, onDelete) {
  let filtered = gastos;
  if (gastoFilter === 'credito') {
    filtered = gastos.filter(g => g.medio === 'credito');
  } else if (gastoFilter !== 'all') {
    filtered = gastos.filter(g => g.categoria === gastoFilter);
  }
  
  const total = filtered.reduce((s, g) => s + (g.importe || 0), 0);
  document.getElementById('gastos-count').textContent      = filtered.length + ' registros';
  document.getElementById('gastos-total-pill').textContent = fmt(total) + ' total';

  const listEl   = document.getElementById('gastos-list');

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Sin gastos para este filtro</div>';
    return;
  }
  listEl.innerHTML = [...filtered].reverse().map(g => gastoItemHTML(g, catInfo, fmt)).join('');
  listEl.querySelectorAll('.gasto-item').forEach(el => {
    el.addEventListener('click', () => openEditGasto(el.dataset.id, state, onSave, onDelete));
  });
}

// ── Modal ──────────────────────────────────────────────────

export function openNewGasto(state) {
  editingGastoId = null;
  document.getElementById('modal-title').textContent = 'Nuevo Gasto';
  document.getElementById('f-detalle').value         = '';
  document.getElementById('f-importe').value         = '';
  document.getElementById('btn-delete-gasto').style.display = 'none';
  _populateGastoForm(state.selectedMonth);
  document.getElementById('modal-gasto').classList.add('open');
}

export function openEditGasto(id, state, onSave, onDelete) {
  const g = state.gastos.find(x => x.id === id);
  if (!g) return;
  editingGastoId = id;
  document.getElementById('modal-title').textContent = 'Editar Gasto';
  document.getElementById('f-detalle').value         = g.detalle;
  document.getElementById('f-importe').value         = g.importe;
  document.getElementById('btn-delete-gasto').style.display = 'block';
  _populateGastoForm(state.selectedMonth);
  document.getElementById('f-mes').value      = g.mes;
  document.getElementById('f-categoria').value = g.categoria;
  document.getElementById('f-medio').value    = g.medio || 'efectivo';
  document.getElementById('modal-gasto').classList.add('open');
}

function _populateGastoForm(selectedMonth) {
  document.getElementById('f-mes').innerHTML =
    MESES.map((m, i) => html`<option value="${i}" ${i === selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
  document.getElementById('f-categoria').innerHTML = html`<optgroup label="Gastos Fijos">${raw(CAT_FIJOS.map(c => html`<option value="${c.key}">${c.icon} ${c.label}</option>`).join(''))}</optgroup>
     <optgroup label="Gastos Variables">${raw(CAT_VARIABLES.map(c => html`<option value="${c.key}">${c.icon} ${c.label}</option>`).join(''))}</optgroup>`;
}

/**
 * Registra los listeners del modal (llamar una sola vez en init).
 * @param {Function} onSave   — (gasto) => boolean|undefined; false = no persistido
 * @param {Function} onDelete — (id) => boolean|undefined; false = no persistido
 */
export function initGastoModal(getState, onSave, onDelete) {
  document.getElementById('btn-save-gasto').addEventListener('click', () => {
    const raw = {
      detalle   : document.getElementById('f-detalle').value,
      importe   : document.getElementById('f-importe').value,
      mes       : document.getElementById('f-mes').value,
      categoria : document.getElementById('f-categoria').value,
      medio     : document.getElementById('f-medio').value,
    };

    const result = validateGasto(raw);
    if (!result.ok) {
      showToast(result.errors[0]);   // show the first error; expand to show all if desired
      return;
    }

    const gasto = result.data;
    const wasEdit = Boolean(editingGastoId);
    const persisted = wasEdit
      ? onSave({ ...gasto, id: editingGastoId, _edit: true })
      : onSave({ ...gasto, id: uid(), _edit: false });
    closeModals();
    // Un "✓ guardado" cuando localStorage falló sería una mentira: el cambio
    // se queda sólo en memoria y se pierde al cerrar.
    if (persisted === false) toastSinPersistencia(wasEdit ? 'Gasto' : 'Gasto nuevo');
    else showToast(wasEdit ? '✓ Gasto actualizado' : '✓ Gasto guardado');
  });

  document.getElementById('btn-delete-gasto').addEventListener('click', () => {
    if (!editingGastoId) return;
    const persisted = onDelete(editingGastoId);
    closeModals();
    if (persisted === false) toastSinPersistencia('Baja de gasto');
    else showToast('Gasto eliminado');
  });
}
