// ============================================================
// presupuesto.js — Pantalla Presupuesto
// Responsabilidad: renderizar tabs de budget (fijos, variables,
// ingresos) y gestionar el flujo de edición inline.
// ============================================================

import { MESES, CAT_FIJOS, CAT_VARIABLES } from './constants.js';
import { fmt, ingresosByMonth, totalIngresosMonth, gastoByCat, validateBudgetUpdate } from './utils.js';
import { buildMonthSelector, showToast } from './ui.js';

let presupTab = 'fijos';

/**
 * @param {object}   state
 * @param {Function} onMonthChange
 * @param {Function} onBudgetSave  — (mi, budgetsParciales) => void
 */
export function renderPresupuesto(state, onMonthChange, onBudgetSave) {
  const mi = state.selectedMonth;
  buildMonthSelector('presup-months', mi, onMonthChange);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === presupTab);
  });

  const budgets = state.budgets[mi] || {};
  const cats    = presupTab === 'fijos' ? CAT_FIJOS : presupTab === 'variables' ? CAT_VARIABLES : null;
  const el      = document.getElementById('presup-content');

  if (presupTab === 'ingresos') {
    _renderIngresosTab(mi, state, el);
    return;
  }
  _renderBudgetTab(cats, budgets, mi, state, el);
}

function _renderIngresosTab(mi, state, el) {
  const ings     = ingresosByMonth(state, mi);
  const totalIng = totalIngresosMonth(state, mi);
  el.innerHTML =
    `<div class="card-title">Total: ${fmt(totalIng)}</div>` +
    (ings.length === 0
      ? '<div class="empty-state" style="padding:16px"><div class="empty-icon">💰</div>Sin ingresos este mes</div>'
      : ings.map(g => `
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
    return `<div class="presup-item">
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
 * @param {Function} onBudgetSave — (mi, { catKey: value }) => void
 */
export function openEditPresup(state, onBudgetSave) {
  const mi      = state.selectedMonth;
  const cats    = presupTab === 'ingresos' ? [] : presupTab === 'fijos' ? CAT_FIJOS : CAT_VARIABLES;
  if (!cats.length) return;
  const budgets = state.budgets[mi] || {};
  const el      = document.getElementById('presup-content');

  el.innerHTML =
    `<div class="card-title" style="margin-bottom:16px">Editar Budget · ${MESES[mi]}</div>` +
    cats.map(c => `
      <div class="presup-item">
        <div class="presup-icon" style="background:${c.color}22">${c.icon}</div>
        <div class="presup-info"><div class="presup-name">${c.label}</div></div>
        <div>
          <input class="form-input" data-cat="${c.key}" value="${budgets[c.key] || 0}"
                 type="number" min="0" step="0.01" style="width:110px;text-align:right;padding:8px 10px">
        </div>
      </div>`).join('') +
    `<div style="padding:12px 0 4px"><button class="btn-primary" id="btn-save-presup">Guardar Budget</button></div>`;

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

    onBudgetSave(mi, result.data);
    showToast('✓ Budget guardado');
  });
}

/** Registra listeners de tabs y botón editar (llamar una sola vez en init) */
export function initPresupuestoEvents(getState, onMonthChange, onBudgetSave) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      presupTab = btn.dataset.tab;
      renderPresupuesto(getState(), onMonthChange, onBudgetSave);
    });
  });

  document.getElementById('btn-edit-presup').addEventListener('click', () => {
    openEditPresup(getState(), (mi, updates) => {
      onBudgetSave(mi, updates);
      renderPresupuesto(getState(), onMonthChange, onBudgetSave);
    });
  });
}
