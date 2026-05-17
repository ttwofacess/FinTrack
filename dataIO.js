// ============================================================
// dataIO.js — Importación y exportación de datos
// Responsabilidad: manejar la serialización / deserialización
// del estado hacia/desde archivos JSON. No renderiza nada.
// ============================================================

import { CUR_YEAR } from './constants.js';
import { showToast } from './ui.js';
import { validateGasto, validateIngreso, validateBudgetUpdate } from './utils.js';

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
  const errors = [];

  if (!Array.isArray(data.gastos))   errors.push('gastos debe ser un array.');
  if (!Array.isArray(data.ingresos)) errors.push('ingresos debe ser un array.');
  if (typeof data.budgets !== 'object' || data.budgets === null) errors.push('budgets debe ser un objeto.');

  if (errors.length) return { ok: false, errors };

  // Validate individual gastos — skip malformed entries and report them
  const badGastos = data.gastos.filter(g => {
    const r = validateGasto(g);
    return !r.ok;
  });
  if (badGastos.length > 0) {
    errors.push(`${badGastos.length} gasto(s) con datos inválidos fueron encontrados.`);
  }

  // Validate individual ingresos
  const badIngresos = data.ingresos.filter(i => {
    const r = validateIngreso(i);
    return !r.ok;
  });
  if (badIngresos.length > 0) {
    errors.push(`${badIngresos.length} ingreso(s) con datos inválidos fueron encontrados.`);
  }

  // Validate budgets
  for (const [mi, updates] of Object.entries(data.budgets)) {
    const monthIndex = parseInt(mi, 10);
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      errors.push(`Mes inválido en budgets: ${mi}`);
      continue;
    }
    const r = validateBudgetUpdate(updates);
    if (!r.ok) {
      errors.push(`Presupuesto inválido para el mes ${monthIndex}: ${r.errors[0]}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Lee un archivo JSON e invoca onSuccess con los datos si son válidos.
 * @param {File}     file
 * @param {Function} onSuccess — (importedState) => void
 */
export function importData(file, onSuccess) {
  if (!file) return;
  const reader   = new FileReader();
  reader.onload  = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const validation = validateImportedState(data);
      if (validation.ok) {
        onSuccess(data);
        showToast('✓ Datos importados');
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
