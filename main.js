// ============================================================
// main.js — Orquestador / punto de entrada
// Responsabilidad: inicializar la app, cablear los módulos
// entre sí y gestionar la navegación. No contiene lógica de
// negocio ni de renderizado propio.
// ============================================================

import { getState, setState, defaultState } from './store.js';
import { closeModals, showToast, syncAllMonthSelectors, toastSinPersistencia } from './ui.js';
import { renderDashboard }                  from './dashboard.js';
import { renderGastos, initGastoModal, openNewGasto, openEditGasto } from './gastos.js';
import { renderPresupuesto, initPresupuestoEvents } from './presupuesto.js';
import { renderIngresos, initIngresoModal }          from './ingresos.js';
import { initDataIO }                                from './dataIO.js';
import { initDonateModal }                           from './donate.js';
import { validateGasto, validateIngreso, validateBudgetUpdate } from './utils.js';

// ── Estado global ──────────────────────────────────────────
let STATE = getState();
let deferredInstallPrompt = null;

// ── Helpers de acceso ────────────────────────────────────
const getS  = () => STATE;

// saveS devuelve false si el estado no llegó a localStorage. Los callbacks de
// guardado usan ese valor para no mostrar un "✓ guardado" cuando en realidad el
// cambio se quedó sólo en memoria.
const saveS = () => setState(STATE);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Nueva versión disponible', {
                actionLabel: 'Actualizar',
                onAction: () => newWorker.postMessage({ type: 'SKIP_WAITING' })
              });
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[FinTrack] Service worker registration failed:', error);
      });
  });
}

let refreshing = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

function initInstallButton() {
  const installButton = document.getElementById('btn-install-app');
  const innerButton = installButton?.querySelector('button');
  if (!installButton || !innerButton) return;

  innerButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') showToast('FinTrack instalado');
      else showToast('Instalación cancelada');
      deferredInstallPrompt = null;
      installButton.setAttribute('hidden', '');
    } else {
      showToast('Instala FinTrack desde el menú del navegador');
    }
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById('btn-install-app')?.removeAttribute('hidden');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('btn-install-app')?.setAttribute('hidden', '');
  deferredInstallPrompt = null;
});

// ── Navegación ────────────────────────────────────────────
//
// El dashboard muestra datos de todas las colecciones, así que cualquier
// cambio en gastos, ingresos o budgets tiene que refrescarlo. navigate() lo
// re-renderiza al entrar a la pantalla, pero mientras el usuario está en otra
// pantalla el DOM queda desactualizado si sólo se repinta la pantalla activa.
function renderDashboardActual() {
  renderDashboard(STATE, onMonthChange, (id) => openEditGasto(id, STATE, onGastoSave, onGastoDelete));
}

function navigate(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
  document.querySelector(`.nav-item[data-screen="${screenId}"]`).classList.add('active');
  document.getElementById('fab').style.display = screenId === 'gastos' ? 'flex' : 'none';

  if (screenId === 'dashboard')   renderDashboardActual();
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
  if (!saveS()) toastSinPersistencia('Cambio de mes');
  // El selector de la pantalla activa se re-renderiza con navigate(), pero las
  // otras ya tienen botones construidos: hay que sincronizarlos o queda
  // resaltado el mes viejo en las pantallas que el usuario tiene ocultas.
  syncAllMonthSelectors(mi);
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
  const persisted = saveS();
  renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  renderDashboardActual();
  return persisted;
}

function onGastoDelete(id) {
  STATE.gastos = STATE.gastos.filter(g => g.id !== id);
  const persisted = saveS();
  renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  renderDashboardActual();
  return persisted;
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
  const persisted = saveS();
  renderIngresos(STATE, onMonthChange);
  renderDashboardActual();
  return persisted;
}

// ── Callbacks de presupuesto ─────────────────────────────
function onBudgetSave(mi, updates) {
  const result = validateBudgetUpdate(updates);
  if (!result.ok) {
    console.warn('[onBudgetSave] Invalid budget rejected:', result.errors, updates);
    return;
  }

  if (!STATE.budgets[mi]) STATE.budgets[mi] = {};
  Object.assign(STATE.budgets[mi], result.data);
  const persisted = saveS();
  renderPresupuesto(STATE, onMonthChange, onBudgetSave);
  renderDashboardActual();
  return persisted;
}

// ── Import / export / reset ──────────────────────────────
initDataIO(getS, (importedState) => {
  STATE = importedState;
  const persisted = saveS();
  navigate('dashboard');
  return persisted;
});

document.getElementById('btn-reset-data').addEventListener('click', () => {
  if (confirm('¿Estás seguro de que querés eliminar TODOS los datos? Esta acción es permanente.')) {
    STATE = defaultState();
    const persisted = saveS();
    navigate('dashboard');
    if (persisted) showToast('🗑️ Datos eliminados');
    // Si no se pudo escribir, los datos siguen intactos en el almacenamiento:
    // decir "eliminados" sería falso.
    else toastSinPersistencia('Borrado');
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
initDonateModal();
initInstallButton();

// ── Arranque ─────────────────────────────────────────────
registerServiceWorker();
navigate('dashboard');
