// ============================================================
// dataIO.js — Importación y exportación de datos
// Responsabilidad: manejar la serialización / deserialización
// del estado hacia/desde archivos JSON. No renderiza nada.
// ============================================================

import { CUR_YEAR } from './constants.js';
import { showToast } from './ui.js';

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
      if (data.gastos && data.ingresos && data.budgets) {
        onSuccess(data);
        showToast('✓ Datos importados');
      } else {
        showToast('❌ Formato JSON inválido');
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
