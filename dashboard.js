// ============================================================
// dashboard.js — Pantalla Dashboard
// Responsabilidad: renderizar exclusivamente la vista del
// dashboard (balance, badges, gráficos, movimientos recientes).
// ============================================================

import { MESES, CUR_YEAR, ALL_CATS, DEFAULT_META_AHORRO } from './constants.js';
import { 
  fmt, catInfo, gastosByMonth, totalIngresosMonth, 
  totalCashGastosMonth, totalBudgetMonth, gastoByCat, getCardBalanceAtEnd, html, raw,
  getComparativaBalance, deltasCategorias, getBalancesAnuales, progresoMetaAhorro
} from './utils.js';
import { buildMonthSelector, gastoItemHTML, sparklineSVG } from './ui.js';

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
  const cardBalance = getCardBalanceAtEnd(state, mi);
  const balance  = ingresos - cashGastos;

  // Balance hero
  const balEl = document.getElementById('dash-balance');
  balEl.textContent = fmt(balance);
  balEl.className = 'balance-amount ' + (balance >= 0 ? 'positive' : 'negative');
  document.getElementById('dash-month-name').textContent = MESES[mi] + ' ' + CUR_YEAR;
  document.getElementById('dash-ingresos').textContent = fmt(ingresos);
  document.getElementById('dash-gastos').textContent   = fmt(cashGastos);
  document.getElementById('dash-presup').textContent   = fmt(presup);
  document.getElementById('dash-debt').textContent     = fmt(cardBalance);

  // Un saldo a favor no es deuda: la etiqueta y el color acompañan al signo.
  const inCredit = cardBalance < 0;
  const debtEl = document.getElementById('dash-debt');
  debtEl.style.color = inCredit ? 'var(--green)' : 'var(--accent1)';
  const debtLabel = document.getElementById('dash-debt-label');
  if (debtLabel) debtLabel.textContent = inCredit ? '💳 saldo a favor' : '💳 deuda';

  _renderBadges(cashGastos, ingresos, mi, state);
  _renderBalanceDelta(mi, state);
  _renderSparkline(mi, state);
  _renderBarChart(mi, state);
  _renderMeta(mi, state);
  _renderBudgetVsReal(mi, state);
  _renderRecientes(mi, state, onEditGasto);
}

function _renderBadges(gastos, ingresos, mi, state) {
  const txCount   = gastosByMonth(state, mi).length;
  const avgTx     = txCount > 0 ? gastos / txCount : 0;
  const savingRate = ingresos > 0 ? ((ingresos - gastos) / ingresos * 100) : 0;

  document.getElementById('dash-badges').innerHTML = html`
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
  const deltas = deltasCategorias(state, mi);
  barEl.innerHTML = catTotals.map(c => html`
    <div class="bar-row">
      <div class="bar-label">${c.icon} ${c.label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(c.total / max * 100).toFixed(1)}%;background:${c.color}"></div>
      </div>
      <div class="bar-value">${fmt(c.total)}${raw(_deltaCatHTML(deltas[c.key], c.key))}</div>
    </div>
  `).join('');
}

// Un salto de 100 a 5000 por ciento es real pero ilegible como "↑4900%": se
// acota el número y el sentido lo lleva la flecha.
const MAX_PCT = 999;

/** Porcentaje de variación redondeado, acotado y sin signo (la flecha lo pone). */
function _fmtPct(pct) {
  const n = Math.round(Math.abs(pct));
  return n > MAX_PCT ? `>${MAX_PCT}%` : `${n}%`;
}

// ── Comparativa contra el mes anterior ─────────────────────

/**
 * Delta del balance contra el mes anterior, debajo del monto.
 * Enero y los meses cuyo anterior está vacío no muestran nada: sin base no hay
 * comparación, y un "↑ ∞%" sería peor que no mostrar nada.
 */
function _renderBalanceDelta(mi, state) {
  const el = document.getElementById('dash-balance-delta');
  if (!el) return;

  const c = getComparativaBalance(state, mi);
  if (!c) {
    el.hidden = true;
    el.textContent = '';
    return;
  }

  const mejora = c.diff > 0;
  const igual  = c.diff === 0;
  // Con el mes anterior en 0 el porcentaje no significa nada: se muestra la
  // diferencia en pesos.
  const magnitud = c.pct === null ? fmt(Math.abs(c.diff)) : _fmtPct(c.pct);

  el.hidden = false;
  el.className = 'balance-delta ' + (igual ? 'flat' : mejora ? 'good' : 'bad');
  el.textContent = igual
    ? '= igual que el mes anterior'
    : `${mejora ? '↑' : '↓'} ${magnitud} vs mes anterior`;
}

// Gastar más es malo, pero para 'ahorro' es al revés (depositar más es bueno) y
// el pago de tarjeta no es consumo: son deuda, así que no se juzga el signo.
const CATS_SUBEN_BIEN = new Set(['ahorro']);
const CATS_NEUTRALES  = new Set(['pay_card']);

/** Delta de una categoría para anotar su barra. '' si no hay comparación. */
function _deltaCatHTML(d, catKey) {
  if (!d || d.previo === null || d.diff === 0) return '';

  const sube  = d.diff > 0;
  const texto = d.pct === null ? 'nuevo' : `${sube ? '↑' : '↓'}${_fmtPct(d.pct)}`;
  const buena = CATS_SUBEN_BIEN.has(catKey) ? sube : !sube;
  const cls   = CATS_NEUTRALES.has(catKey) ? 'flat' : buena ? 'good' : 'bad';
  return html`<span class="bar-delta ${cls}">${texto}</span>`;
}

/** Sparkline con el balance de los 12 meses del año. */
function _renderSparkline(mi, state) {
  const el = document.getElementById('dash-spark');
  if (!el) return;

  el.innerHTML = sparklineSVG(getBalancesAnuales(state), {
    activeIndex: mi,
    label: `Balance mes a mes de ${CUR_YEAR}`,
  });
}

// ── Meta de ahorro ─────────────────────────────────────────

/**
 * Barra de avance contra la meta del mes. Reutiliza .bvr-track / .bvr-real.{ok,
 * warn, over} de "budget vs real": es la misma idea visual y evita una segunda
 * barra con otro nombre.
 */
function _renderMeta(mi, state) {
  const el = document.getElementById('dash-meta');
  if (!el) return;

  const { tipo, valor } = state.metaAhorro || DEFAULT_META_AHORRO;
  const p = progresoMetaAhorro(state, mi);

  // Sin meta, o con una meta en % y un mes sin ingresos, no hay nada que medir.
  if (p.pct === null) {
    const msg = valor > 0
      ? 'Cargá ingresos este mes para calcular tu meta'
      : 'Definí una meta de ahorro para ver tu avance';
    el.innerHTML = html`
      <div class="empty-state" style="padding:16px">
        <div class="empty-icon">🎯</div>${msg}
      </div>`;
    return;
  }

  const barPct = Math.max(0, Math.min(100, p.pct));
  const cls  = p.cumplida ? 'ok' : p.ahorro < 0 ? 'over' : 'warn';
  const desc = tipo === 'porcentaje' ? `${valor}% de tus ingresos` : 'monto fijo';
  const pie  = p.cumplida ? '¡Meta cumplida! 🎉' : `Te faltan ${fmt(p.faltante)}`;

  el.innerHTML = html`
    <div class="bvr-header">
      <div class="bvr-name">${fmt(p.ahorro)} / ${fmt(p.meta)}</div>
      <div class="bvr-vals">${Math.round(p.pct)}% · ${desc}</div>
    </div>
    <div class="bvr-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="${Math.round(barPct)}" aria-label="Avance de la meta de ahorro">
      <div class="bvr-budget" style="width:100%"></div>
      <div class="bvr-real ${cls}" style="width:${barPct.toFixed(1)}%"></div>
    </div>
    <div class="meta-foot ${p.cumplida ? 'good' : ''}">${pie}</div>`;
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
    return html`
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
