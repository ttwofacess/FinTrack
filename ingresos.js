// ============================================================
// ingresos.js — Pantalla Ingresos + Modal de ingreso
// Responsabilidad: renderizar la vista de ingresos, ordenar
// el detalle del mes y gestionar el modal para agregar nuevos
// registros.
// ============================================================

import { MESES, CUR_YEAR } from './constants.js';
import { fmt, uid, ingresosByMonth, totalIngresosMonth, validateIngreso, html,
         sortRecords, sanitizeEnum } from './utils.js';
import { buildMonthSelector, closeModals, showToast, toastSinPersistencia } from './ui.js';

// Ingresos lista en orden de carga, sin invertir, así que 'carga' es el default:
// poner 'recientes' cambiaría el orden de la lista al publicar una actualización.
let ingSort = 'carga';

// El primer elemento es el default de la pantalla porque sanitizeEnum cae al
// primero ante un valor desconocido: si fuera 'recientes', un select sin la
// opción elegida invertiría la lista en vez de volver al orden de carga.
const ING_SORT_MODES = ['carga', 'monto-desc', 'monto-asc'];

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

  document.getElementById('ing-summary-cards').innerHTML = html`
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

  _syncSortControl();
  _renderIngList(ings);
}

/**
 * El estado del módulo sobrevive al salir y volver a la pantalla, así que el
 * select hay que sincronizarlo con él en cada render.
 */
function _syncSortControl() {
  const sortEl = document.getElementById('ing-sort');
  if (sortEl && sortEl.value !== ingSort) sortEl.value = ingSort;
}

function _renderIngList(ings) {
  const listEl = document.getElementById('ing-list');
  if (ings.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>Sin ingresos este mes<br>Tocá + nuevo para agregar</div>';
    return;
  }
  // Los ingresos no tienen categoría, así que no se ofrece orden alfabético.
  const sorted = sortRecords(ings, ingSort);
  listEl.innerHTML = sorted.map(g => html`
      <div class="ingreso-list-item">
        <div class="ili-left">
          <div class="ili-name">${g.descripcion}</div>
          <div class="ili-type">${g.tipo}</div>
        </div>
        <div><div class="ili-amount">${fmt(g.importe)}</div></div>
      </div>`).join('');
}

/**
 * Registra el selector de orden (llamar una sola vez en init). Cada cambio
 * re-renderiza SOLO la lista, sin volver a dibujar las tarjetas de resumen.
 *
 * Se toma el state por callback para no quedar con una referencia vieja, por
 * ejemplo después de importar datos.
 *
 * @param {Function} getState — () => state
 */
export function initIngresosControls(getState) {
  const sortEl = document.getElementById('ing-sort');
  sortEl?.addEventListener('change', () => {
    ingSort = sanitizeEnum(sortEl.value, ING_SORT_MODES);
    // Si el value no era una opción real el select queda en blanco: se escribe
    // el modo ya saneado para que el control siempre muestre algo.
    sortEl.value = ingSort;
    _renderIngList(ingresosByMonth(getState(), getState().selectedMonth));
  });
}

/** Abre el modal de nuevo ingreso */
export function openNewIngreso(selectedMonth) {
  document.getElementById('fi-desc').value   = '';
  document.getElementById('fi-importe').value = '';
  document.getElementById('fi-mes').innerHTML =
    MESES.map((m, i) => html`<option value="${i}" ${i === selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
  document.getElementById('modal-ingreso').classList.add('open');
}

/**
 * Registra listeners del modal de ingresos (llamar una sola vez en init).
 * @param {Function} onSave — (ingreso) => boolean|undefined; false = no persistido
 */
export function initIngresoModal(getState, onSave) {
  document.getElementById('btn-add-ingreso').addEventListener('click', () => {
    openNewIngreso(getState().selectedMonth);
  });

  document.getElementById('btn-save-ingreso').addEventListener('click', () => {
    const raw = {
      descripcion : document.getElementById('fi-desc').value,
      importe     : document.getElementById('fi-importe').value,
      mes         : document.getElementById('fi-mes').value,
      tipo        : document.getElementById('fi-tipo').value,
    };

    const result = validateIngreso(raw);
    if (!result.ok) {
      showToast(result.errors[0]);
      return;
    }

    const persisted = onSave({ id: uid(), ...result.data });
    closeModals();
    // false = el estado quedó sólo en memoria (ver store.setState).
    if (persisted === false) toastSinPersistencia('Ingreso');
    else showToast('✓ Ingreso guardado');
  });
}

