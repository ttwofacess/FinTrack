// ============================================================
// presupuesto.js — Pantalla Presupuesto
// Responsabilidad: renderizar tabs de budget (fijos, variables,
// ingresos) y gestionar el flujo de edición inline.
// ============================================================

import { MESES, CAT_FIJOS, CAT_VARIABLES } from './constants.js';
import {
  fmt, ingresosByMonth, totalIngresosMonth, gastoByCat,
  validateBudgetUpdate, validateMetaAhorro, html
} from './utils.js';
import { buildMonthSelector, showToast, toastSinPersistencia, closeModals } from './ui.js';
import { renderRecurrentes, openEditRecurrente } from './recurrentes.js';

let presupTab = 'fijos';

/**
 * @param {object}   state
 * @param {Function} onMonthChange
 * @param {Function} onBudgetSave  — (mi, budgetsParciales) => void
 * @param {Function} [onRecurrenteToggle] — (id) => void, switch de la pestaña
 *   Recurrentes. Es opcional para que los tests de la pantalla puedan montar el
 *   render sin la lista de recurrentes.
 */
export function renderPresupuesto(state, onMonthChange, onBudgetSave, onRecurrenteToggle) {
  const mi = state.selectedMonth;
  buildMonthSelector('presup-months', mi, onMonthChange);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === presupTab);
  });

  // El tab de ingresos es sólo lectura: los ingresos se cargan desde su propia
  // pantalla. Dejar el botón "editar" a la vista era un control que no hacía
  // nada, porque openEditPresup() no tiene categorías que editar en ese tab.
  // En Recurrentes tampoco hay budgets que editar: los recurrentes se crean con
  // su propio botón del header.
  const editBtn = document.getElementById('btn-edit-presup');
  if (editBtn) editBtn.hidden = presupTab === 'ingresos' || presupTab === 'recurrentes';

  const newBtn = document.getElementById('btn-new-recurrente');
  if (newBtn) newBtn.hidden = presupTab !== 'recurrentes';

  const budgets = state.budgets[mi] || {};
  const cats    = presupTab === 'fijos' ? CAT_FIJOS : presupTab === 'variables' ? CAT_VARIABLES : null;
  const el      = document.getElementById('presup-content');

  if (presupTab === 'ingresos') {
    _renderIngresosTab(mi, state, el);
    return;
  }
  if (presupTab === 'recurrentes') {
    renderRecurrentes(state, onRecurrenteToggle || (() => {}), (id) => openEditRecurrente(id, state));
    return;
  }
  _renderBudgetTab(cats, budgets, mi, state, el);
}

function _renderIngresosTab(mi, state, el) {
  const ings     = ingresosByMonth(state, mi);
  const totalIng = totalIngresosMonth(state, mi);
  el.innerHTML =
    html`<div class="card-title">Total: ${fmt(totalIng)}</div>` +
    (ings.length === 0
      ? '<div class="empty-state" style="padding:16px"><div class="empty-icon">💰</div>Sin ingresos este mes<br>Agregalos desde la pantalla Ingresos</div>'
      : ings.map(g => html`
          <div class="ingreso-list-item">
            <div class="ili-left">
              <div class="ili-name">${g.descripcion}</div>
              <div class="ili-type">${g.tipo}</div>
            </div>
            <div><div class="ili-amount">${fmt(g.importe)}</div></div>
          </div>`).join(''));
}

function _renderBudgetTab(cats, budgets, mi, state, el) {
  el.innerHTML = cats.map(c => {
    const budget = budgets[c.key] || 0;
    const real   = gastoByCat(state, mi, c.key);
    const pct    = budget > 0 ? (real / budget * 100).toFixed(0) : 0;
    const statusColor = pct > 100 ? 'var(--red)' : pct > 70 ? 'var(--accent4)' : 'var(--accent3)';
    return html`<div class="presup-item">
      <div class="presup-icon" style="background:${c.color}22">${c.icon}</div>
      <div class="presup-info">
        <div class="presup-name">${c.label}</div>
        <div class="presup-sub">${pct}% ejecutado</div>
      </div>
      <div class="presup-right">
        <div class="presup-budget">budget: ${fmt(budget)}</div>
        <div class="presup-real" style="color:${statusColor}">${fmt(real)}</div>
      </div>
    </div>`;
  }).join('');
}

/**
 * Activa el modo edición inline del presupuesto.
 * @param {object}   state
 * @param {Function} onBudgetSave — (mi, { catKey: value }) => boolean|undefined;
 *   false = el budget no llegó a persistirse
 */
export function openEditPresup(state, onBudgetSave) {
  const mi      = state.selectedMonth;
  const cats    = presupTab === 'ingresos' ? [] : presupTab === 'fijos' ? CAT_FIJOS : CAT_VARIABLES;
  if (!cats.length) return;
  const budgets = state.budgets[mi] || {};
  const el      = document.getElementById('presup-content');

  el.innerHTML =
    html`<div class="card-title" style="margin-bottom:16px">Editar Budget · ${MESES[mi]}</div>` +
    cats.map(c => html`
      <div class="presup-item">
        <div class="presup-icon" style="background:${c.color}22">${c.icon}</div>
        <div class="presup-info"><div class="presup-name">${c.label}</div></div>
        <div>
          <input class="form-input" data-cat="${c.key}" value="${budgets[c.key] || 0}"
                 type="number" min="0" step="0.01" style="width:110px;text-align:right;padding:8px 10px">
        </div>
      </div>`).join('') +
    '<div style="padding:12px 0 4px"><button class="btn-primary" id="btn-save-presup">Guardar Budget</button></div>';

  document.getElementById('btn-save-presup').addEventListener('click', () => {
    const rawUpdates = {};
    el.querySelectorAll('input[data-cat]').forEach(inp => {
      rawUpdates[inp.dataset.cat] = inp.value;
    });

    const result = validateBudgetUpdate(rawUpdates);

    if (!result.ok) {
      showToast('❌ ' + result.errors[0]);
      // Focus the first invalid input (using the key from the first error if possible, but simplest is to find first data-cat)
      // Actually, validateBudgetUpdate returns errors with catKey in the string.
      // We can just find the first input that matches one of the failed keys if we had them.
      // For now, let's just focus the first input that has an error.
      const firstErrorCat = Object.keys(rawUpdates).find(cat => {
          const val = parseFloat(rawUpdates[cat]);
          return isNaN(val) || val < 0 || val > 999999999; // Sync with validateBudgetUpdate logic
      });
      if (firstErrorCat) {
          el.querySelector(`input[data-cat="${firstErrorCat}"]`)?.focus();
      }
      return;
    }

    const persisted = onBudgetSave(mi, result.data);
    if (persisted === false) toastSinPersistencia('Presupuesto');
    else showToast('✓ Budget guardado');
  });
}

/** Registra listeners de tabs y botón editar (llamar una sola vez en init) */
export function initPresupuestoEvents(getState, onMonthChange, onBudgetSave, onRecurrenteToggle) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      presupTab = btn.dataset.tab;
      renderPresupuesto(getState(), onMonthChange, onBudgetSave, onRecurrenteToggle);
    });
  });

  document.getElementById('btn-edit-presup').addEventListener('click', () => {
    // Defensa: el botón está oculto en los tabs de ingresos y recurrentes, pero
    // un click disparado por código lo alcanzaría igual.
    if (presupTab === 'ingresos' || presupTab === 'recurrentes') return;
    openEditPresup(getState(), (mi, updates) => {
      const persisted = onBudgetSave(mi, updates);
      renderPresupuesto(getState(), onMonthChange, onBudgetSave, onRecurrenteToggle);
      return persisted;
    });
  });
}

// ── Modal de meta de ahorro ───────────────────────────────
//
// La card vive en el dashboard pero el modal se maneja desde acá, junto al de
// presupuesto: es el otro caso de "objetivo que el usuario define a mano y se
// guarda con su propia validación", así que comparten el mismo flujo.

/** El tipo elegido cambia la etiqueta del campo y su techo. */
function _syncMetaLabel() {
  const esPct = document.getElementById('fm-tipo').value === 'porcentaje';
  document.getElementById('fm-valor-label').textContent = esPct ? 'Porcentaje (%)' : 'Monto ($)';
  document.getElementById('fm-valor').max = esPct ? '100' : '';
}

/**
 * Abre el modal de la meta precargado con el valor guardado.
 * @param {object} state
 */
export function openMetaModal(state) {
  const { tipo, valor } = state.metaAhorro;

  document.getElementById('fm-tipo').value  = tipo;
  document.getElementById('fm-valor').value = valor || '';
  _syncMetaLabel();
  document.getElementById('modal-meta').classList.add('open');
  document.getElementById('fm-valor').focus();
}

/**
 * Registra los listeners del modal de la meta (llamar una sola vez en init).
 * @param {Function} getState
 * @param {Function} onMetaSave — (meta) => boolean|undefined; false = no persistió
 */
export function initMetaModal(getState, onMetaSave) {
  document.getElementById('btn-edit-meta').addEventListener('click', () => {
    openMetaModal(getState());
  });
  document.getElementById('fm-tipo').addEventListener('change', _syncMetaLabel);

  document.getElementById('btn-save-meta').addEventListener('click', () => {
    const result = validateMetaAhorro({
      tipo:  document.getElementById('fm-tipo').value,
      valor: document.getElementById('fm-valor').value,
    });

    // Un valor inválido deja el modal abierto: el usuario corrigió algo mal y
    // cerrar lo obligaría a reabrirlo y volver a escribir todo.
    if (!result.ok) {
      showToast('❌ ' + result.errors[0]);
      return;
    }

    const persisted = onMetaSave(result.data);
    closeModals();
    if (persisted === false) toastSinPersistencia('Meta de ahorro');
    else showToast('✓ Meta guardada');
  });
}
