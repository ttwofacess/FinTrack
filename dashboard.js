// ============================================================
// dashboard.js — Pantalla Dashboard
// Responsabilidad: renderizar exclusivamente la vista del
// dashboard (balance, badges, gráficos, movimientos recientes).
// ============================================================

import { MESES, CUR_YEAR, ALL_CATS } from './constants.js';
import { 
  fmt, catInfo, gastosByMonth, totalIngresosMonth, 
  totalCashGastosMonth, totalBudgetMonth, gastoByCat, getCardDebtAtEnd 
} from './utils.js';
import { buildMonthSelector, gastoItemHTML } from './ui.js';

/**
 * @param {object}   state
 * @param {Function} onMonthChange   — callback cuando cambia el mes
 * @param {Function} onEditGasto     — callback para editar un gasto
 */
export function renderDashboard(state, onMonthChange, onEditGasto) {
  const mi = state.selectedMonth;
  buildMonthSelector('dash-months', mi, onMonthChange);

  const ingresos = totalIngresosMonth(state, mi);
  const cashGastos = totalCashGastosMonth(state, mi);
  const presup   = totalBudgetMonth(state, mi);
  const debt     = getCardDebtAtEnd(state, mi);
  const balance  = ingresos - cashGastos;

  // Balance hero
  const balEl = document.getElementById('dash-balance');
  balEl.textContent = fmt(balance);
  balEl.className = 'balance-amount ' + (balance >= 0 ? 'positive' : 'negative');
  document.getElementById('dash-month-name').textContent = MESES[mi] + ' ' + CUR_YEAR;
  document.getElementById('dash-ingresos').textContent = fmt(ingresos);
  document.getElementById('dash-gastos').textContent   = fmt(cashGastos);
  document.getElementById('dash-presup').textContent   = fmt(presup);
  document.getElementById('dash-debt').textContent     = fmt(debt);

  _renderBadges(cashGastos, ingresos, mi, state);
  _renderBarChart(mi, state);
  _renderBudgetVsReal(mi, state);
  _renderRecientes(mi, state, onEditGasto);
}

function _renderBadges(gastos, ingresos, mi, state) {
  const txCount   = gastosByMonth(state, mi).length;
  const avgTx     = txCount > 0 ? gastos / txCount : 0;
  const savingRate = ingresos > 0 ? ((ingresos - gastos) / ingresos * 100) : 0;

  document.getElementById('dash-badges').innerHTML = `
    <div class="badge">
      <div class="badge-icon">📊</div>
      <div class="badge-right">
        <div class="badge-val" style="color:var(--accent4)">${txCount}</div>
        <div class="badge-lbl">transac.</div>
      </div>
    </div>
    <div class="badge">
      <div class="badge-icon">📉</div>
      <div class="badge-right">
        <div class="badge-val" style="color:var(--accent3)">${Math.round(savingRate)}%</div>
        <div class="badge-lbl">tasa ahorro</div>
      </div>
    </div>
    <div class="badge">
      <div class="badge-icon">💸</div>
      <div class="badge-right">
        <div class="badge-val" style="color:var(--accent2)">${fmt(avgTx)}</div>
        <div class="badge-lbl">gasto prom.</div>
      </div>
    </div>
  `;
}

function _renderBarChart(mi, state) {
  const barEl = document.getElementById('dash-barchart');
  const catTotals = ALL_CATS
    .map(c => ({ ...c, total: gastoByCat(state, mi, c.key) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  if (catTotals.length === 0) {
    barEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>Sin gastos este mes</div>';
    return;
  }
  const max = catTotals[0].total;
  barEl.innerHTML = catTotals.map(c => `
    <div class="bar-row">
      <div class="bar-label">${c.icon} ${c.label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(c.total / max * 100).toFixed(1)}%;background:${c.color}"></div>
      </div>
      <div class="bar-value">${fmt(c.total)}</div>
    </div>
  `).join('');
}

function _renderBudgetVsReal(mi, state) {
  const bvrEl = document.getElementById('dash-bvr');
  const bvItems = ALL_CATS.map(c => {
    const budget = (state.budgets[mi] || {})[c.key] || 0;
    const real   = gastoByCat(state, mi, c.key);
    return { ...c, budget, real };
  }).filter(c => c.budget > 0 || c.real > 0).slice(0, 5);

  if (bvItems.length === 0) {
    bvrEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">📋</div>Configurá tu presupuesto</div>';
    return;
  }
  bvrEl.innerHTML = bvItems.map(c => {
    const pct = c.budget > 0 ? Math.min(c.real / c.budget * 100, 100) : 0;
    const cls = pct < 70 ? 'ok' : pct < 100 ? 'warn' : 'over';
    return `
      <div class="bvr-row">
        <div class="bvr-header">
          <div class="bvr-name">${c.icon} ${c.label}</div>
          <div class="bvr-vals">${fmt(c.real)} / ${fmt(c.budget)}</div>
        </div>
        <div class="bvr-track">
          <div class="bvr-budget" style="width:100%"></div>
          <div class="bvr-real ${cls}" style="width:${pct.toFixed(1)}%"></div>
        </div>
      </div>`;
  }).join('');
}

function _renderRecientes(mi, state, onEditGasto) {
  const recEl     = document.getElementById('dash-recientes');
  const recientes = [...gastosByMonth(state, mi)].reverse().slice(0, 4);

  if (recientes.length === 0) {
    recEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Sin movimientos este mes<br>Agregá tu primer gasto</div>';
    return;
  }
  recEl.innerHTML = '<div class="gastos-list">' +
    recientes.map(g => gastoItemHTML(g, catInfo, fmt)).join('') +
    '</div>';
  recEl.querySelectorAll('.gasto-item').forEach(el => {
    el.addEventListener('click', () => onEditGasto(el.dataset.id));
  });
}
