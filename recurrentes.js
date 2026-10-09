// ============================================================
// recurrentes.js — Gastos recurrentes: lógica y pantalla
// Responsabilidad: decidir qué gastos se autogeneran al entrar a
// un mes, mantener el importe base del recurrente al día, y
// renderizar la lista y el modal de la pestaña Recurrentes.
// La lógica no toca el DOM ni guarda en localStorage (eso es
// responsabilidad de main.js); la parte de UI no toca el estado.
// ============================================================

import { MESES, CAT_FIJOS, CAT_VARIABLES } from './constants.js';
import { uid, normalizeText, catInfo, fmt, html, raw, validateRecurrente } from './utils.js';
import { closeModals, showToast, toastSinPersistencia } from './ui.js';

/**
 * Crea los gastos recurrentes que faltan en el mes `mi`.
 *
 * @param {object} state           — el estado de la app; se muta `state.gastos`
 * @param {number} mi              — mes destino, 0-11
 * @param {number} [mesActual]     — tope: no se generan meses futuros, para no
 *                                   llenar la proyección anual de gastos estimados
 * @returns {number} cuántos gastos se crearon (0 si no había nada que hacer)
 *
 * Es idempotente: volver a llamarla para el mismo mes no duplica nada, así que
 * se puede llamar en cada `navigate()` sin worry.
 *
 * Se saltea un recurrente si está pausado, si el mes es anterior a su
 * `desdeMes`, si el usuario borró antes el gasto de ese mes (`salteados`), si ya
 * hay un gasto con su `recurrenteId`, o si hay un gasto manual con el mismo
 * detalle y categoría — esa última comprobación evita generar un duplicado de
 * algo que el usuario ya cargó a mano (y no puede tener `recurrenteId`).
 */
export function ensureMonthRecurrentes(state, mi, mesActual = new Date().getMonth()) {
  if (!state || mi > mesActual) return 0;
  if (!Array.isArray(state.gastos) || !Array.isArray(state.recurrentes)) return 0;

  const delMes = state.gastos.filter(g => g.mes === mi);
  let creados = 0;

  for (const r of state.recurrentes) {
    if (!r.activo) continue;
    if (mi < r.desdeMes) continue;
    if (Array.isArray(r.salteados) && r.salteados.includes(mi)) continue;
    if (delMes.some(g => g.recurrenteId === r.id)) continue;

    // Un detalle vacío no sirve para comparar: sin este chequeo, cualquier gasto
    // sin detalle del mismo mes taparía al recurrente.
    const detalle = normalizeText(r.detalle);
    if (detalle && delMes.some(g => g.categoria === r.categoria && normalizeText(g.detalle) === detalle)) continue;

    const gasto = {
      id: uid(),
      detalle: r.detalle,
      importe: r.importe,
      mes: mi,
      categoria: r.categoria,
      medio: r.medio,
      recurrenteId: r.id,
    };
    state.gastos.push(gasto);
    delMes.push(gasto);
    creados++;
  }

  return creados;
}

/**
 * Si el gasto editado es el más reciente de su recurrente, actualiza el importe
 * base para que el mes siguiente se genere con ese valor.
 *
 * La regla del "mes más reciente" evita que corregir un gasto viejo pise el
 * valor vigente: editar marzo no debe cambiar lo que se cobra en octubre.
 *
 * @returns {object|null} el recurrente actualizado, o null si no hubo nada que
 *   sincronizar (gasto manual, recurrente inexistente, mes viejo o importe igual)
 */
export function sincronizarImporteBase(state, gasto) {
  if (!state || !gasto?.recurrenteId) return null;

  const r = state.recurrentes?.find(x => x.id === gasto.recurrenteId);
  if (!r || r.importe === gasto.importe) return null;

  const mesMasReciente = state.gastos
    .filter(g => g.recurrenteId === r.id)
    .reduce((max, g) => (Number.isInteger(g.mes) && g.mes > max ? g.mes : max), -1);

  if (gasto.mes < mesMasReciente) return null;

  r.importe = gasto.importe;
  return r;
}

/**
 * Registra que el usuario borró el gasto generado de un mes, para que no se
 * vuelva a crear al navegar a él de nuevo.
 *
 * @returns {object|null} el recurrente actualizado, o null si el gasto era manual
 */
export function registrarSalteo(state, gasto) {
  if (!state || !gasto?.recurrenteId) return null;

  const r = state.recurrentes?.find(x => x.id === gasto.recurrenteId);
  if (!r) return null;

  if (!Array.isArray(r.salteados)) r.salteados = [];
  if (!r.salteados.includes(gasto.mes)) {
    r.salteados.push(gasto.mes);
    r.salteados.sort((a, b) => a - b);
  }
  return r;
}

// ── Pantalla ───────────────────────────────────────────────

let editingRecurrenteId = null;

/**
 * Renderiza la pestaña Recurrentes dentro de #presup-content.
 *
 * @param {object}   state
 * @param {Function} onToggle — (id) => void, el switch on/off de cada fila
 * @param {Function} onEdit   — (id) => void, al tocar la fila
 */
export function renderRecurrentes(state, onToggle, onEdit) {
  const el = document.getElementById('presup-content');
  if (!el) return;

  const recs = state.recurrentes || [];
  const activos = recs.filter(r => r.activo);
  const total   = activos.reduce((s, r) => s + (r.importe || 0), 0);
  const cargadosEnMes = state.gastos.filter(g => g.mes === state.selectedMonth).length;

  const resumen = html`<div class="recurrentes-resumen">
      <div class="recurrentes-total">${fmt(total)} <span>por mes</span></div>
      <div class="recurrentes-sub">${activos.length} activo${activos.length === 1 ? '' : 's'} de ${recs.length} · ${cargadosEnMes} gasto${cargadosEnMes === 1 ? '' : 's'} en ${MESES[state.selectedMonth]}</div>
    </div>`;

  const filas = recs.map(r => {
    const ci = catInfo(r.categoria);
    return html`<div class="presup-item recurrente-item ${r.activo ? '' : 'recurrente-pausado'}" data-id="${r.id}">
      <div class="presup-icon" style="background:${ci.color}22">${ci.icon}</div>
      <div class="presup-info">
        <div class="presup-name">${r.detalle}</div>
        <div class="presup-sub">${ci.label} · desde ${MESES[r.desdeMes] || 'Enero'}</div>
      </div>
      <div class="presup-right">
        <div class="presup-real">${fmt(r.importe)}</div>
        <div class="presup-budget">${r.activo ? 'por mes' : 'pausado'}</div>
      </div>
      <div class="switch ${r.activo ? 'on' : ''}" role="switch" aria-checked="${r.activo ? 'true' : 'false'}" aria-label="${r.activo ? 'Pausar' : 'Reactivar'} ${r.detalle}" tabindex="0" data-id="${r.id}"></div>
    </div>`;
  }).join('');

  el.innerHTML = resumen + (recs.length === 0
    ? html`<div class="empty-state" style="padding:16px"><div class="empty-icon">↻</div>Sin recurrentes<br>Agregá uno y se carga solo cada mes</div>`
    : filas);

  el.querySelectorAll('.recurrente-item').forEach(row => {
    row.addEventListener('click', (e) => {
      // El switch vive dentro de la fila: sin esto, pausar abriría el modal.
      if (e.target.closest('.switch')) return;
      onEdit(row.dataset.id);
    });
  });

  el.querySelectorAll('.switch').forEach(sw => {
    const alternar = () => onToggle(sw.dataset.id);
    sw.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
    // El switch es un <div> con role="switch": sin esto no se puede operar con
    // el teclado.
    sw.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      alternar();
    });
  });
}

// ── Modal ──────────────────────────────────────────────────

/** ¿Ese mes ya tiene el gasto generado de este recurrente? */
function tieneGastoDelMes(state, r) {
  if (!r) return false;
  return state.gastos.some(g => g.recurrenteId === r.id && g.mes === state.selectedMonth);
}

function _populateForm(selectedMonth, defaults = {}) {
  document.getElementById('r-desde').innerHTML =
    MESES.map((m, i) => html`<option value="${i}" ${i === (defaults.desdeMes ?? selectedMonth) ? 'selected' : ''}>${m}</option>`).join('');
  document.getElementById('r-categoria').innerHTML =
    html`<optgroup label="Gastos Fijos">${raw(CAT_FIJOS.map(c => html`<option value="${c.key}">${c.icon} ${c.label}</option>`).join(''))}</optgroup>
     <optgroup label="Gastos Variables">${raw(CAT_VARIABLES.map(c => html`<option value="${c.key}">${c.icon} ${c.label}</option>`).join(''))}</optgroup>`;
}

/**
 * Muestra u oculta el checkbox de "aplicar también al mes visible".
 *
 * Sólo tiene sentido en edición y cuando el mes visible ya tiene el gasto
 * generado: si todavía no existe, se va a generar con el importe base nuevo y no
 * hay nada que ajustar.
 */
function _syncAplicarMes(state, r) {
  const group = document.getElementById('r-aplicar-mes-group');
  const aplica = document.getElementById('r-aplicar-mes');
  const visible = Boolean(r) && tieneGastoDelMes(state, r);

  group.hidden = !visible;
  if (visible) {
    document.getElementById('r-aplicar-mes-label').textContent = `Aplicar también a ${MESES[state.selectedMonth]}`;
    aplica.checked = true;
  } else {
    aplica.checked = false;
  }
}

export function openNewRecurrente(state) {
  editingRecurrenteId = null;
  document.getElementById('recurrente-title').textContent = 'Nuevo Recurrente';
  document.getElementById('r-detalle').value = '';
  document.getElementById('r-importe').value = '';
  document.getElementById('btn-delete-recurrente').style.display = 'none';
  _populateForm(state.selectedMonth);
  document.getElementById('r-medio').value = 'efectivo';
  _syncAplicarMes(state, null);
  document.getElementById('modal-recurrente').classList.add('open');
}

export function openEditRecurrente(id, state) {
  const r = state.recurrentes.find(x => x.id === id);
  if (!r) return;
  editingRecurrenteId = id;
  document.getElementById('recurrente-title').textContent = 'Editar Recurrente';
  document.getElementById('r-detalle').value = r.detalle;
  document.getElementById('r-importe').value = r.importe;
  document.getElementById('btn-delete-recurrente').style.display = 'block';
  _populateForm(state.selectedMonth, { desdeMes: r.desdeMes });
  document.getElementById('r-categoria').value = r.categoria;
  document.getElementById('r-medio').value = r.medio || 'efectivo';
  _syncAplicarMes(state, r);
  document.getElementById('modal-recurrente').classList.add('open');
}

/**
 * Registra los listeners del modal (llamar una sola vez en init).
 * @param {Function} onSave   — (recurrente) => boolean|undefined; false = no persistió
 * @param {Function} onDelete — (id) => boolean|undefined
 */
export function initRecurrentesModal(getState, onSave, onDelete) {
  document.getElementById('btn-save-recurrente').addEventListener('click', () => {
    const state = getState();
    const raw = {
      detalle   : document.getElementById('r-detalle').value,
      importe   : document.getElementById('r-importe').value,
      categoria : document.getElementById('r-categoria').value,
      medio     : document.getElementById('r-medio').value,
      desdeMes  : document.getElementById('r-desde').value,
      activo    : true,
      _aplicarMes: document.getElementById('r-aplicar-mes').checked,
    };

    // Revalidación defensiva: el formulario ya está limpio, pero el estado
    // puede haber cambiado entre que se abrió el modal y se guardó.
    const existente = editingRecurrenteId
      ? state.recurrentes.find(r => r.id === editingRecurrenteId)
      : null;
    const result = validateRecurrente({ ...existente, ...raw });

    if (!result.ok) {
      showToast(result.errors[0]);
      return;
    }

    const wasEdit = Boolean(editingRecurrenteId);
    const rec = {
      ...result.data,
      id: editingRecurrenteId || uid(),
      _edit: wasEdit,
      _aplicarMes: raw._aplicarMes,
    };

    const persisted = onSave(rec);
    closeModals();
    if (persisted === false) toastSinPersistencia(wasEdit ? 'Recurrente' : 'Recurrente nuevo');
    else showToast(wasEdit ? '✓ Recurrente actualizado' : '✓ Recurrente guardado');
  });

  document.getElementById('btn-delete-recurrente').addEventListener('click', () => {
    if (!editingRecurrenteId) return;
    const id = editingRecurrenteId;
    const r = getState().recurrentes.find(x => x.id === id);

    const detalle = r ? r.detalle : '';
    if (!confirm(`¿Eliminar "${detalle}"? Los gastos que ya generó se quedan.`)) return;

    const persisted = onDelete(id);
    closeModals();
    if (persisted === false) toastSinPersistencia('Baja de recurrente');
    else showToast('Recurrente eliminado');
  });
}

/**
 * Registra el botón de "nuevo recurrente" del header (llamar una sola vez en
 * init). Los switches de cada fila se enganchan en el render, porque las filas
 * se recrean en cada cambio.
 */
export function initRecurrentesEvents(getState) {
  document.getElementById('btn-new-recurrente').addEventListener('click', () => {
    openNewRecurrente(getState());
  });
}