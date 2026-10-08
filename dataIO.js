// ============================================================
// dataIO.js — Importación y exportación de datos
// Responsabilidad: manejar la serialización / deserialización
// del estado hacia/desde archivos JSON. No renderiza nada.
// ============================================================

import { CUR_YEAR } from './constants.js';
import { showToast, toastSinPersistencia } from './ui.js';
import { validateGasto, validateIngreso, validateBudgetUpdate, validateMetaAhorro } from './utils.js';
import { normalizeState } from './store.js';

/**
 * Descarga el estado actual como JSON.
 * @param {object} state
 */
export function exportData(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `fintrack-${CUR_YEAR}.json`;
  a.click();
  showToast('✓ Datos exportados');
}

/**
 * Deep-validates an imported state object.
 * Returns { ok: boolean, errors: string[] }.
 */
function validateImportedState(data) {
  // La meta se captura antes de normalizeState, que muta `data` y reemplaza
  // cualquier metaAhorro por el default: si se leyera después, una meta inválida
  // del archivo pasaría el chequeo como si fuera válida.
  const metaRaw = data.metaAhorro;

  const normalized = normalizeState(data);
  const errors = [];

  if (!Array.isArray(normalized.gastos))   errors.push('gastos debe ser un array.');
  if (!Array.isArray(normalized.ingresos)) errors.push('ingresos debe ser un array.');
  if (typeof normalized.budgets !== 'object' || normalized.budgets === null) errors.push('budgets debe ser un objeto.');

  if (errors.length) return { ok: false, errors, data: normalized };

  // Validate individual gastos. Los válidos se reescriben con los datos ya
  // saneados: sin esto un importe importado como string queda crudo en el
  // estado y se renderiza como $0, porque fmt() no parsea strings con
  // separador de miles. Los inválidos se conservan y se reportan.
  let badGastos = 0;
  normalized.gastos = normalized.gastos.map(g => {
    const r = validateGasto(g);
    if (!r.ok) { badGastos++; return g; }
    return { ...g, ...r.data };
  });
  if (badGastos > 0) {
    errors.push(`${badGastos} gasto(s) con datos inválidos fueron encontrados.`);
  }

  // Validate individual ingresos
  let badIngresos = 0;
  normalized.ingresos = normalized.ingresos.map(i => {
    const r = validateIngreso(i);
    if (!r.ok) { badIngresos++; return i; }
    return { ...i, ...r.data };
  });
  if (badIngresos > 0) {
    errors.push(`${badIngresos} ingreso(s) con datos inválidos fueron encontrados.`);
  }

  // Validate budgets
  for (const [mi, updates] of Object.entries(normalized.budgets)) {
    const monthIndex = parseInt(mi, 10);
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      errors.push(`Mes inválido en budgets: ${mi}`);
      continue;
    }
    const r = validateBudgetUpdate(updates);
    if (!r.ok) {
      errors.push(`Presupuesto inválido para el mes ${monthIndex}: ${r.errors[0]}`);
      continue;
    }
    // Igual que en gastos: escribir el budget saneado, no el crudo.
    normalized.budgets[mi] = { ...updates, ...r.data };
  }

  // Un export anterior a la meta no la trae y eso es válido: normalizeState ya
  // dejó el default. Si viene, se valida y se escribe la versión saneada.
  if (metaRaw !== undefined) {
    const r = validateMetaAhorro(metaRaw);
    if (!r.ok) errors.push(`Meta de ahorro inválida: ${r.errors[0]}`);
    else normalized.metaAhorro = r.data;
  }

  return { ok: errors.length === 0, errors, data: normalized };
}

/**
 * Lee un archivo JSON e invoca onSuccess con los datos si son válidos.
 * @param {File}     file
 * @param {Function} onSuccess — (importedState) => boolean|undefined;
 *   devuelve false si el estado importado no llegó a persistirse
 */
export function importData(file, onSuccess) {
  if (!file) return;
  const reader   = new FileReader();
  reader.onload  = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const validation = validateImportedState(data);
      if (validation.ok) {
        const persisted = onSuccess(validation.data);
        if (persisted === false) toastSinPersistencia('Importación');
        else showToast('✓ Datos importados');
      } else {
        // Show the first error; log all for debugging
        console.warn('[importData] Validation errors:', validation.errors);
        showToast('❌ ' + validation.errors[0]);
      }
    } catch {
      showToast('❌ Error al leer el archivo');
    }
  };
  reader.readAsText(file);
}

/** Registra los listeners de importar/exportar (llamar una sola vez en init) */
export function initDataIO(getState, onImport) {
  document.getElementById('btn-export').addEventListener('click', () => {
    exportData(getState());
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('input-import').click();
  });

  document.getElementById('input-import').addEventListener('change', (e) => {
    importData(e.target.files[0], onImport);
    e.target.value = '';
  });
}
