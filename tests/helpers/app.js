/**
 * Integration harness: boots the REAL app (index.html markup + main.js
 * orchestrator) inside jsdom.
 *
 * The unit tests mount hand-written fragments and call render* directly,
 * which means they never exercise the wiring in main.js: module-level STATE,
 * setState/getState persistence, onMonthChange re-render loops, and the
 * modals that talk to store.js. These helpers boot that wiring for real so
 * tests can drive the app through the DOM the user actually touches.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { vi } from 'vitest';

import { defaultState } from '../../store.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

const STORAGE_KEY = 'fintrack_v2';

const saved = {
  serviceWorker: undefined,
  clipboard: undefined,
  createObjectURL: undefined,
  revokeObjectURL: undefined,
  confirm: undefined,
};

// ── Browser API stubs ───────────────────────────────────────

// scrollIntoView queda instalado de forma permanente (y no se restaura): los
// selectores de mes lo piden dentro de un setTimeout de 50ms que puede dispararse
// después de que el test terminó y después de restaurar el resto de los stubs.
HTMLElement.prototype.scrollIntoView = vi.fn();

/** jsdom lacks the APIs main.js and donate.js touch on boot. */
export function stubBrowserApis() {
  saved.serviceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  // main.js registers a controllerchange listener at module scope.
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: null,
      register: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }),
      addEventListener: vi.fn(),
    },
  });

  saved.clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  saved.createObjectURL = URL.createObjectURL;
  saved.revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:fintrack');
  URL.revokeObjectURL = vi.fn();

  saved.confirm = window.confirm;
  window.confirm = vi.fn(() => true);
}

export function restoreBrowserApis() {
  const restore = (obj, key, descriptor) => {
    if (descriptor) Object.defineProperty(obj, key, descriptor);
    else delete obj[key];
  };
  restore(navigator, 'serviceWorker', saved.serviceWorker);
  restore(navigator, 'clipboard', saved.clipboard);
  URL.createObjectURL = saved.createObjectURL;
  URL.revokeObjectURL = saved.revokeObjectURL;
  window.confirm = saved.confirm;
}

// ── Boot ────────────────────────────────────────────────────

/**
 * Espera a que terminen los callbacks asíncronos pendientes (FileReader del
 * importData, setTimeout de los toast y de los selectores de mes).
 *
 * Sin esto, el onload de un import disparado en un test anterior puede
 * ejecutarse durante el siguiente y escribir en el localStorage recién
 * reiniciado, mezclando datos entre tests.
 */
const drainAsync = () => new Promise((resolve) => setTimeout(resolve, 60));

/** Replaces the document body with the real index.html markup. */
function mountIndexHtml() {
  const parsed = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
}

/**
 * Boots main.js against a fresh DOM + localStorage.
 * @param {object} [seed] — state to pre-persist before booting. Defaults to an
 *   empty state on Enero so tests don't depend on the real current month.
 * @param {object} [opts]
 * @param {boolean} [opts.serviceWorker=true] — false para simular un browser
 *   sin soporte de service workers.
 */
export async function bootApp(seed, { serviceWorker = true } = {}) {
  await drainAsync();
  vi.resetModules();
  mountIndexHtml();
  localStorage.clear();
  setStoredState(seed ?? stateWith((s) => { s.selectedMonth = 0; }));
  if (!serviceWorker) delete navigator.serviceWorker;
  await import('../../main.js');
}

/** Re-runs main.js against the existing localStorage, simulating an app restart. */
export async function restartApp() {
  await drainAsync();
  vi.resetModules();
  mountIndexHtml();
  await import('../../main.js');
}

// ── localStorage ────────────────────────────────────────────

export function getStoredState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

export function setStoredState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** A default state with `mutate` applied — the usual way to arrange state. */
export function stateWith(mutate) {
  const state = defaultState();
  mutate(state);
  return state;
}

// ── DOM helpers ─────────────────────────────────────────────

export const $  = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const byId = (id) => document.getElementById(id);

export const toastText = () => byId('toast').textContent;
/** Vacía el toast para que un waitFor no matchee el mensaje de una acción previa. */
export const clearToast = () => { byId('toast').textContent = ''; };
export const activeScreen = () => $('.screen.active')?.id.replace('screen-', '');
/** Clicks a bottom-nav entry, like a user switching tabs. */
export const navTo = (screen) => $(`.nav-item[data-screen="${screen}"]`).click();

/** Clicks the nth month button of a month selector, e.g. 'gastos-months'. */
export const clickMonth = (containerId, index) => byId(containerId).querySelectorAll('.month-btn')[index].click();

/**
 * Dispatches the beforeinstallprompt event Chrome would fire.
 * @param {'accepted'|'dismissed'} outcome
 */
export function fireInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

/** Fills the gasto modal and saves it. */
export function submitGasto({ detalle, importe, mes, categoria, medio }) {
  if (detalle !== undefined) byId('f-detalle').value = detalle;
  if (importe !== undefined) byId('f-importe').value = importe;
  if (mes !== undefined) byId('f-mes').value = String(mes);
  if (categoria !== undefined) byId('f-categoria').value = categoria;
  if (medio !== undefined) byId('f-medio').value = medio;
  byId('btn-save-gasto').click();
}

/** Fills the ingreso modal and saves it. */
export function submitIngreso({ descripcion, importe, mes, tipo }) {
  if (descripcion !== undefined) byId('fi-desc').value = descripcion;
  if (importe !== undefined) byId('fi-importe').value = importe;
  if (mes !== undefined) byId('fi-mes').value = String(mes);
  if (tipo !== undefined) byId('fi-tipo').value = tipo;
  byId('btn-save-ingreso').click();
}

/** Opens the gasto modal on a specific existing gasto. */
export const openGastoFromList = (index = 0) =>
  byId('gastos-list').querySelectorAll('.gasto-item')[index].click();

/** Lee un Blob como texto (jsdom no implementa Blob.text()). */
export const readBlob = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

export const listNames = (containerId) =>
  $$(`#${containerId} .gasto-name`).map(n => n.textContent);
