// ============================================================
// gastos.js — Pantalla Gastos + Modal de gasto
// Responsabilidad: renderizar la lista de gastos con filtros
// y gestionar el ciclo de vida del modal (nuevo / editar /
// eliminar). No persiste datos directamente; delega en el
// callback onSave / onDelete.
// ============================================================

import { MESES, CAT_FIJOS, CAT_VARIABLES } from './constants.js';
import { fmt, catInfo, gastosByMonth, uid } from './utils.js';
import { buildMonthSelector, closeModals, showToast, gastoItemHTML } from './ui.js';

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
  const total  = gastos.reduce((s, g) => s + g.importe, 0);

  document.getElementById('gastos-count').textContent      = gastos.length + ' registros';
  document.getElementById('gastos-total-pill').textContent = fmt(total) + ' total';

  _renderFilters(gastos, state, onMonthChange, onSave, onDelete);
  _renderList(gastos, onSave, onDelete);
}

function _renderFilters(gastos, state, onMonthChange, onSave, onDelete) {
  const filterEl = document.getElementById('gastos-filters');
  const cats     = [...new Set(gastos.map(g => g.categoria))];

  filterEl.innerHTML =
    `<div class="filter-chip ${gastoFilter === 'all' ? 'active' : ''}" data-cat="all">Todos</div>` +
    cats.map(c => {
      const ci = catInfo(c);
      return `<div class="filter-chip ${gastoFilter === c ? 'active' : ''}" data-cat="${c}">${ci.icon} ${ci.label}</div>`;
    }).join('');

  filterEl.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      gastoFilter = el.dataset.cat;
      renderGastos(state, onMonthChange, onSave, onDelete);
    });
  });
}

function _renderList(gastos, onSave, onDelete) {
  const filtered = gastoFilter === 'all' ? gastos : gastos.filter(g => g.categoria === gastoFilter);
  const listEl   = document.getElementById('gastos-list');

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Sin gastos este mes<br>Tocá + para agregar uno</div>';
    return;
  }
  listEl.innerHTML = [...filtered].reverse().map(g => gastoItemHTML(g, catInfo, fmt)).join('');
  listEl.querySelectorAll('.gasto-item').forEach(el => {
    el.addEventListener('click', () => openEditGasto(el.dataset.id, onSave, onDelete));
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
    MESES.map((m, i) => `<option value="${i}" ${i === selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
  document.getElementById('f-categoria').innerHTML =
    `<optgroup label="Gastos Fijos">${CAT_FIJOS.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}</optgroup>
     <optgroup label="Gastos Variables">${CAT_VARIABLES.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}</optgroup>`;
}

/** Registra los listeners del modal (llamar una sola vez en init) */
export function initGastoModal(getState, onSave, onDelete) {
  document.getElementById('btn-save-gasto').addEventListener('click', () => {
    const detalle   = document.getElementById('f-detalle').value.trim();
    const importe   = parseFloat(document.getElementById('f-importe').value);
    const mes       = parseInt(document.getElementById('f-mes').value);
    const categoria = document.getElementById('f-categoria').value;
    const medio     = document.getElementById('f-medio').value;

    if (!detalle || isNaN(importe) || importe <= 0) {
      showToast('Completá detalle e importe');
      return;
    }

    const gasto = { detalle, importe, mes, categoria, medio };
    if (editingGastoId) {
      onSave({ ...gasto, id: editingGastoId, _edit: true });
    } else {
      onSave({ ...gasto, id: uid(), _edit: false });
    }
    closeModals();
    showToast(editingGastoId ? '✓ Gasto actualizado' : '✓ Gasto guardado');
  });

  document.getElementById('btn-delete-gasto').addEventListener('click', () => {
    if (!editingGastoId) return;
    onDelete(editingGastoId);
    closeModals();
    showToast('Gasto eliminado');
  });
}
