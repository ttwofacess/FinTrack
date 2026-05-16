// ============================================================
// main.js — Orquestador / punto de entrada
// Responsabilidad: inicializar la app, cablear los módulos
// entre sí y gestionar la navegación. No contiene lógica de
// negocio ni de renderizado propio.
// ============================================================

import { getState, setState, defaultState } from './store.js';
import { closeModals, showToast }           from './ui.js';
import { renderDashboard }                  from './dashboard.js';
import { renderGastos, initGastoModal, openNewGasto, openEditGasto } from './gastos.js';
import { renderPresupuesto, initPresupuestoEvents } from './presupuesto.js';
import { renderIngresos, initIngresoModal }          from './ingresos.js';
import { initDataIO }                                from './dataIO.js';
import { validateGasto, validateIngreso }           from './utils.js';

// ── Estado global ──────────────────────────────────────────
let STATE = getState();

// ── Helpers de acceso ────────────────────────────────────
const getS  = () => STATE;
const saveS = () => setState(STATE);

// ── Navegación ────────────────────────────────────────────
function navigate(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
  document.querySelector(`.nav-item[data-screen="${screenId}"]`).classList.add('active');
  document.getElementById('fab').style.display = screenId === 'gastos' ? 'flex' : 'none';

  if (screenId === 'dashboard')   renderDashboard(STATE, onMonthChange, (id) => openEditGasto(id, STATE, onGastoSave, onGastoDelete));
  if (screenId === 'gastos')      renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  if (screenId === 'presupuesto') renderPresupuesto(STATE, onMonthChange, onBudgetSave);
  if (screenId === 'ingresos')    renderIngresos(STATE, onMonthChange);
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.screen));
});

// ── Callbacks de mes ─────────────────────────────────────
function onMonthChange(mi) {
  STATE.selectedMonth = mi;
  saveS();
  // Re-renderiza la pantalla activa
  const active = document.querySelector('.screen.active');
  if (active) navigate(active.id.replace('screen-', ''));
}

// ── Callbacks de gastos ──────────────────────────────────
function onGastoSave(gasto) {
  // Defensive re-validation (data should already be clean from the modal)
  const { _edit, id, ...fields } = gasto;
  const result = validateGasto(fields);
  if (!result.ok) {
    console.warn('[onGastoSave] Invalid gasto rejected:', result.errors, gasto);
    return;
  }
  const clean = { ...result.data, id, _edit };

  if (clean._edit) {
    const idx = STATE.gastos.findIndex(g => g.id === clean.id);
    if (idx >= 0) {
      const { _edit: _, ...toSave } = clean;
      STATE.gastos[idx] = { ...STATE.gastos[idx], ...toSave };
    }
  } else {
    const { _edit: _, ...toSave } = clean;
    STATE.gastos.push(toSave);
  }
  saveS();
  renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  renderDashboard(STATE, onMonthChange, (id) => openEditGasto(id, STATE, onGastoSave, onGastoDelete));
}

function onGastoDelete(id) {
  STATE.gastos = STATE.gastos.filter(g => g.id !== id);
  saveS();
  renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  renderDashboard(STATE, onMonthChange, (id) => openEditGasto(id, STATE, onGastoSave, onGastoDelete));
}

// ── Callbacks de ingresos ────────────────────────────────
function onIngresoSave(ingreso) {
  const { id, ...fields } = ingreso;
  const result = validateIngreso(fields);
  if (!result.ok) {
    console.warn('[onIngresoSave] Invalid ingreso rejected:', result.errors, ingreso);
    return;
  }
  STATE.ingresos.push({ id, ...result.data });
  saveS();
  renderIngresos(STATE, onMonthChange);
}

// ── Callbacks de presupuesto ─────────────────────────────
function onBudgetSave(mi, updates) {
  if (!STATE.budgets[mi]) STATE.budgets[mi] = {};
  Object.assign(STATE.budgets[mi], updates);
  saveS();
  renderPresupuesto(STATE, onMonthChange, onBudgetSave);
}

// ── Import / export / reset ──────────────────────────────
initDataIO(getS, (importedState) => {
  STATE = importedState;
  saveS();
  navigate('dashboard');
});

document.getElementById('btn-reset-data').addEventListener('click', () => {
  if (confirm('¿Estás seguro de que querés eliminar TODOS los datos? Esta acción es permanente.')) {
    STATE = defaultState();
    saveS();
    navigate('dashboard');
    showToast('🗑️ Datos eliminados');
  }
});

// ── Modales ──────────────────────────────────────────────
closeModals; // asegurar que está importado
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModals(); });
});

// ── FAB ──────────────────────────────────────────────────
document.getElementById('fab').addEventListener('click', () => openNewGasto(STATE));

// ── Init de listeners de una sola vez ────────────────────
initGastoModal(getS, onGastoSave, onGastoDelete);
initIngresoModal(getS, onIngresoSave);
initPresupuestoEvents(getS, onMonthChange, onBudgetSave);

// ── Arranque ─────────────────────────────────────────────
navigate('dashboard');
