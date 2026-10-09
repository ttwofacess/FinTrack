// ============================================================
// main.js — Orquestador / punto de entrada
// Responsabilidad: inicializar la app, cablear los módulos
// entre sí y gestionar la navegación. No contiene lógica de
// negocio ni de renderizado propio.
// ============================================================

import { getState, setState, defaultState } from './store.js';
import { closeModals, showToast, syncAllMonthSelectors, toastSinPersistencia } from './ui.js';
import { MESES } from './constants.js';
import { renderDashboard }                  from './dashboard.js';
import { renderGastos, initGastoModal, initGastosControls, openNewGasto, openEditGasto } from './gastos.js';
import { renderPresupuesto, initPresupuestoEvents, initMetaModal } from './presupuesto.js';
import { renderIngresos, initIngresoModal, initIngresosControls } from './ingresos.js';
import { initDataIO }                                from './dataIO.js';
import { initDonateModal }                           from './donate.js';
import { ensureMonthRecurrentes, sincronizarImporteBase, registrarSalteo,
         initRecurrentesModal, initRecurrentesEvents } from './recurrentes.js';
import { validateGasto, validateIngreso, validateBudgetUpdate, validateMetaAhorro, validateRecurrente, uid } from './utils.js';

// ── Estado global ──────────────────────────────────────────
let STATE = getState();
let deferredInstallPrompt = null;

// ── Helpers de acceso ────────────────────────────────────
const getS  = () => STATE;

// saveS devuelve false si el estado no llegó a localStorage. Los callbacks de
// guardado usan ese valor para no mostrar un "✓ guardado" cuando en realidad el
// cambio se quedó sólo en memoria.
const saveS = () => setState(STATE);

let refreshing = false;

function registerServiceWorker() {
  // Todo lo del service worker cuelga de esteAPI: el listener de
  // controllerchange va acá también porque registrarlo a nivel de módulo
  // reventaba la app entera en un browser sin soporte.
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

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

// ── Recurrentes ───────────────────────────────────────────
//
// Los gastos recurrentes se crean solos al entrar a un mes, así que el disparo
// va dentro de navigate(): es el único camino por el que la app cambia de mes o
// de pantalla, y ya lo usan el arranque, onMonthChange, el import y el reset.
// La función es idempotente, así que llamarla de más no genera duplicados.
function aplicarRecurrentes() {
  const creados = ensureMonthRecurrentes(STATE, STATE.selectedMonth);
  if (creados === 0) return 0;

  if (!saveS()) toastSinPersistencia('Gastos recurrentes');
  else {
    const plural = creados > 1;
    showToast(`↻ ${creados} gasto${plural ? 's' : ''} recurrente${plural ? 's' : ''} cargado${plural ? 's' : ''}`);
  }
  return creados;
}

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

  // Antes de los renders: el gasto del mes tiene que existir para que el
  // dashboard y la lista sumen el dato nuevo.
  aplicarRecurrentes();

  if (screenId === 'dashboard')   renderDashboardActual();
  if (screenId === 'gastos')      renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  if (screenId === 'presupuesto') renderPresupuesto(STATE, onMonthChange, onBudgetSave, onRecurrenteToggle);
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
  const { _edit, id, _actualizarBase, ...fields } = gasto;
  const result = validateGasto(fields);
  if (!result.ok) {
    console.warn('[onGastoSave] Invalid gasto rejected:', result.errors, gasto);
    return;
  }
  const clean = { ...result.data, id, _edit };
  let guardado = null;

  if (clean._edit) {
    const idx = STATE.gastos.findIndex(g => g.id === clean.id);
    if (idx >= 0) {
      const { _edit: _, ...toSave } = clean;
      STATE.gastos[idx] = { ...STATE.gastos[idx], ...toSave };
      guardado = STATE.gastos[idx];
    }
  } else {
    const { _edit: _, ...toSave } = clean;
    STATE.gastos.push(toSave);
  }

  // El importe de un recurrente sólo cambia para ese mes. Actualizar el valor
  // desde el que se generan los meses siguientes es una decisión explícita del
  // usuario (el checkbox del modal), no un efecto secundario de editar: con
  // inflación, cada mes tiene el importe que realmente se pagó.
  const recurrente = (guardado && _actualizarBase) ? sincronizarImporteBase(STATE, guardado) : null;
  const persisted = saveS();
  renderGastos(STATE, onMonthChange, onGastoSave, onGastoDelete);
  renderDashboardActual();

  // El modal de gasto muestra su propio toast apenas onGastoSave devuelve y
  // showToast reemplaza el contenido, así que el aviso de la base espera un
  // microtask para quedar en pantalla. Si no persistió, manda el aviso de que
  // los datos no se guardaron.
  if (recurrente && persisted) {
    queueMicrotask(() => showToast(`↻ Importe base de ${recurrente.detalle} actualizado`));
  }
  return persisted;
}

function onGastoDelete(id) {
  // Antes de filtrar: hace falta el gasto para saber si era autogenerado y, si
  // lo era, evitar que se vuelva a crear al volver a entrar al mes.
  const borrado = STATE.gastos.find(g => g.id === id);
  if (borrado) registrarSalteo(STATE, borrado);

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
  renderPresupuestoActual();
  renderDashboardActual();
  return persisted;
}

// ── Callbacks de meta de ahorro ───────────────────────────
function onMetaSave(meta) {
  const result = validateMetaAhorro(meta);
  if (!result.ok) {
    console.warn('[onMetaSave] Meta inválida rechazada:', result.errors, meta);
    return;
  }
  STATE.metaAhorro = result.data;
  const persisted = saveS();
  renderDashboardActual();
  return persisted;
}

// ── Callbacks de recurrentes ──────────────────────────────
//
// Mismo contrato que el resto: revalidan, guardan, re-renderizan y devuelven
// `persisted` para que el llamador pueda avisar si localStorage falló.

function renderPresupuestoActual() {
  renderPresupuesto(STATE, onMonthChange, onBudgetSave, onRecurrenteToggle);
}

/**
 * @param {object} rec — { detalle, importe, categoria, medio, desdeMes, activo,
 *   id?, _edit?, _aplicarMes? }
 */
function onRecurrenteSave(rec) {
  const { _edit, id, _aplicarMes, ...fields } = rec;
  const existente = STATE.recurrentes.find(r => r.id === id);

  // Se valida sobre el existente porque validateRecurrente devuelve la forma
  // completa: los `salteados` acumulados no vienen del formulario y sin esto se
  // perderían en cada edición.
  const result = validateRecurrente({ ...existente, ...fields });
  if (!result.ok) {
    console.warn('[onRecurrenteSave] Recurrente inválido rechazado:', result.errors, rec);
    return;
  }

  const limpio = { ...existente, ...result.data, id: id || uid() };

  if (_edit) {
    const idx = STATE.recurrentes.findIndex(r => r.id === limpio.id);
    if (idx < 0) return;
    STATE.recurrentes[idx] = limpio;
  } else {
    STATE.recurrentes.push(limpio);
  }

  // Los meses ya generados no se modifican retroactivamente al cambiar la base,
  // salvo que el usuario marque explícitamente el checkbox del modal.
  if (_aplicarMes) {
    const delMes = STATE.gastos.find(g => g.recurrenteId === limpio.id && g.mes === STATE.selectedMonth);
    if (delMes) delMes.importe = limpio.importe;
  }

  const persisted = saveS();

  // Crear uno nuevo o reactivar uno pausado carga el mes actual en el momento.
  const generados = (!existente || !existente.activo) ? aplicarRecurrentes() : 0;

  renderPresupuestoActual();
  renderDashboardActual();

  // El modal muestra su propio toast apenas onRecurrenteSave devuelve y
  // showToast reemplaza el contenido: si se generó algo, el aviso se arma acá y
  // espera un microtask, para que el usuario lea las dos cosas juntas.
  if (generados > 0 && persisted) {
    queueMicrotask(() => showToast(`✓ Recurrente guardado · ${MESES[STATE.selectedMonth]} actualizado`));
  }
  return persisted;
}

/** Pausa o reactiva un recurrente desde el switch de la lista. */
function onRecurrenteToggle(id) {
  const r = STATE.recurrentes.find(x => x.id === id);
  if (!r) return;

  r.activo = !r.activo;
  const persisted = saveS();

  if (r.activo) aplicarRecurrentes();
  renderPresupuestoActual();
  return persisted;
}

/**
 * Borra un recurrente. Los gastos que ya generó se quedan: son historial, y el
 * `recurrenteId` que quedó huérfano lo toleran los helpers.
 */
function onRecurrenteDelete(id) {
  STATE.recurrentes = STATE.recurrentes.filter(r => r.id !== id);
  const persisted = saveS();
  renderPresupuestoActual();
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
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModals(); });
});

// Escape es el gesto natural para descartar un modal, pero en mobile el overlay
// comparte zona con el botón de guardar: sin esto, touch fuera es la única
// salida y es fácil cerrarlo por error después de guardar. Se comportan como el
// click en el overlay: se cierran todos los modales abiertos.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeModals();
});

// ── FAB ──────────────────────────────────────────────────
document.getElementById('fab').addEventListener('click', () => openNewGasto(STATE));

// ── Init de listeners de una sola vez ────────────────────
initGastoModal(getS, onGastoSave, onGastoDelete);
initGastosControls(getS, onGastoSave, onGastoDelete);
initIngresoModal(getS, onIngresoSave);
initIngresosControls(getS);
initPresupuestoEvents(getS, onMonthChange, onBudgetSave, onRecurrenteToggle);
initRecurrentesEvents(getS);
initRecurrentesModal(getS, onRecurrenteSave, onRecurrenteDelete);
initMetaModal(getS, onMetaSave);
initDonateModal();
initInstallButton();

// ── Arranque ─────────────────────────────────────────────
registerServiceWorker();
navigate('dashboard');
