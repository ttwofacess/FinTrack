// ============================================================
// DATA
// ============================================================
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const now = new Date();
const CUR_YEAR = now.getFullYear();

const CAT_FIJOS = [
  { key:'vivienda', label:'Vivienda', icon:'🏠', color:'#7c6dfa' },
  { key:'servicios', label:'Servicios', icon:'💡', color:'#6dfad0' },
  { key:'impuestos', label:'Impuestos', icon:'🏛️', color:'#fa6d9a' },
  { key:'prestamo', label:'Préstamo', icon:'🏦', color:'#fad06d' },
  { key:'ahorro', label:'Ahorro', icon:'💰', color:'#4ade80' },
  { key:'suscripciones', label:'Suscripciones', icon:'📱', color:'#60a5fa' },
  { key:'seguro', label:'Seguro', icon:'🛡️', color:'#a78bfa' },
];
const CAT_VARIABLES = [
  { key:'alimentacion', label:'Alimentación', icon:'🛒', color:'#fb923c' },
  { key:'cuidado_personal', label:'Cuidado Personal', icon:'💊', color:'#f472b6' },
  { key:'salidas', label:'Salidas', icon:'🎉', color:'#c084fc' },
  { key:'regalos', label:'Regalos', icon:'🎁', color:'#f87171' },
  { key:'mascotas', label:'Mascotas', icon:'🐾', color:'#fb923c' },
  { key:'viaticos', label:'Viáticos', icon:'🚗', color:'#34d399' },
  { key:'ropa', label:'Ropa', icon:'👕', color:'#38bdf8' },
  { key:'vacaciones', label:'Vacaciones', icon:'✈️', color:'#818cf8' },
  { key:'extras', label:'Extras', icon:'⭐', color:'#fbbf24' },
  { key:'salud', label:'Salud', icon:'❤️', color:'#f87171' },
];
const ALL_CATS = [...CAT_FIJOS, ...CAT_VARIABLES];

function getState() {
  try {
    return JSON.parse(localStorage.getItem('fintrack_v2') || 'null') || defaultState();
  } catch(e) { return defaultState(); }
}
function setState(s) { localStorage.setItem('fintrack_v2', JSON.stringify(s)); }
function defaultState() {
  const budgets = {};
  MESES.forEach((m,i) => {
    budgets[i] = {};
    ALL_CATS.forEach(c => { budgets[i][c.key] = 0; });
  });
  return { gastos: [], ingresos: [], budgets, selectedMonth: now.getMonth() };
}

let STATE = getState();
let editingGastoId = null;
let presupTab = 'fijos';
let presupEditing = false;

// ============================================================
// HELPERS
// ============================================================
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('es-AR');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function catInfo(key) { return ALL_CATS.find(c => c.key === key) || { label: key, icon: '📦', color: '#888' }; }

function gastosByMonth(mi) {
  return STATE.gastos.filter(g => g.mes === mi);
}
function ingresosByMonth(mi) {
  return STATE.ingresos.filter(g => g.mes === mi);
}
function totalGastosMonth(mi) {
  return gastosByMonth(mi).reduce((s, g) => s + (g.importe || 0), 0);
}
function totalIngresosMonth(mi) {
  return ingresosByMonth(mi).reduce((s, g) => s + (g.importe || 0), 0);
}
function totalBudgetMonth(mi) {
  const b = STATE.budgets[mi] || {};
  return Object.values(b).reduce((s, v) => s + (v || 0), 0);
}
function gastoByCat(mi, catKey) {
  return gastosByMonth(mi).filter(g => g.categoria === catKey).reduce((s, g) => s + g.importe, 0);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ============================================================
// NAVIGATION
// ============================================================
function navigate(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
  document.querySelector(`.nav-item[data-screen="${screenId}"]`).classList.add('active');
  document.getElementById('fab').style.display = screenId === 'gastos' ? 'flex' : 'none';
  if (screenId === 'dashboard') renderDashboard();
  if (screenId === 'gastos') renderGastos();
  if (screenId === 'presupuesto') renderPresupuesto();
  if (screenId === 'ingresos') renderIngresos();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.screen));
});

// ============================================================
// MONTH SELECTORS
// ============================================================
function buildMonthSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  MESES.forEach((m, i) => {
    const btn = document.createElement('div');
    btn.className = 'month-btn' + (i === STATE.selectedMonth ? ' active' : '');
    btn.textContent = m.slice(0, 3);
    btn.addEventListener('click', () => {
      STATE.selectedMonth = i;
      document.querySelectorAll(`#${containerId} .month-btn`).forEach((b, j) => {
        b.classList.toggle('active', j === i);
      });
      onChange(i);
    });
    el.appendChild(btn);
  });
  // Scroll to active
  setTimeout(() => {
    const active = el.querySelector('.active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 50);
}

function syncAllMonthSelectors() {
  ['dash-months','gastos-months','presup-months','ing-months'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('.month-btn').forEach((b, i) => {
      b.classList.toggle('active', i === STATE.selectedMonth);
    });
  });
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const mi = STATE.selectedMonth;
  buildMonthSelector('dash-months', () => renderDashboard());

  const ingresos = totalIngresosMonth(mi);
  const gastos = totalGastosMonth(mi);
  const presup = totalBudgetMonth(mi);
  const balance = ingresos - gastos;

  const balEl = document.getElementById('dash-balance');
  balEl.textContent = fmt(balance);
  balEl.className = 'balance-amount ' + (balance >= 0 ? 'positive' : 'negative');
  document.getElementById('dash-month-name').textContent = MESES[mi] + ' ' + CUR_YEAR;
  document.getElementById('dash-ingresos').textContent = fmt(ingresos);
  document.getElementById('dash-gastos').textContent = fmt(gastos);
  document.getElementById('dash-presup').textContent = fmt(presup);

  // Badges
  const txCount = gastosByMonth(mi).length;
  const avgTx = txCount > 0 ? gastos / txCount : 0;
  const savingRate = ingresos > 0 ? ((ingresos - gastos) / ingresos * 100) : 0;
  document.getElementById('dash-badges').innerHTML = `
    <div class="badge">
      <div class="badge-icon">📊</div>
      <div class="badge-right">
        <div class="badge-val" style="color:var(--accent4)">${txCount}</div>
        <div class="badge-lbl">transacciones</div>
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

  // Bar chart
  const barEl = document.getElementById('dash-barchart');
  const catTotals = ALL_CATS.map(c => ({ ...c, total: gastoByCat(mi, c.key) }))
    .filter(c => c.total > 0)
    .sort((a,b) => b.total - a.total)
    .slice(0, 6);
  if (catTotals.length === 0) {
    barEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>Sin gastos este mes</div>';
  } else {
    const max = catTotals[0].total;
    barEl.innerHTML = catTotals.map(c => `
      <div class="bar-row">
        <div class="bar-label">${c.icon} ${c.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c.total/max*100).toFixed(1)}%;background:${c.color}"></div></div>
        <div class="bar-value">${fmt(c.total)}</div>
      </div>
    `).join('');
  }

  // Budget vs Real
  const bvrEl = document.getElementById('dash-bvr');
  const bvItems = ALL_CATS.map(c => {
    const budget = (STATE.budgets[mi] || {})[c.key] || 0;
    const real = gastoByCat(mi, c.key);
    return { ...c, budget, real };
  }).filter(c => c.budget > 0 || c.real > 0).slice(0, 5);
  if (bvItems.length === 0) {
    bvrEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-icon">📋</div>Configurá tu presupuesto</div>';
  } else {
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

  // Recientes
  const recEl = document.getElementById('dash-recientes');
  const recientes = [...gastosByMonth(mi)].reverse().slice(0, 4);
  if (recientes.length === 0) {
    recEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Sin movimientos este mes<br>Agregá tu primer gasto</div>';
  } else {
    recEl.innerHTML = '<div class="gastos-list">' + recientes.map(g => gastoItemHTML(g)).join('') + '</div>';
    recEl.querySelectorAll('.gasto-item').forEach(el => {
      el.addEventListener('click', () => openEditGasto(el.dataset.id));
    });
  }
}

// ============================================================
// GASTOS
// ============================================================
let gastoFilter = 'all';

function renderGastos() {
  const mi = STATE.selectedMonth;
  buildMonthSelector('gastos-months', () => { gastoFilter = 'all'; renderGastos(); });

  const gastos = gastosByMonth(mi);
  const total = gastos.reduce((s,g) => s + g.importe, 0);

  document.getElementById('gastos-count').textContent = gastos.length + ' registros';
  document.getElementById('gastos-total-pill').textContent = fmt(total) + ' total';

  // Filters
  const filterEl = document.getElementById('gastos-filters');
  const cats = [...new Set(gastos.map(g => g.categoria))];
  filterEl.innerHTML = `<div class="filter-chip ${gastoFilter === 'all' ? 'active' : ''}" data-cat="all">Todos</div>` +
    cats.map(c => {
      const ci = catInfo(c);
      return `<div class="filter-chip ${gastoFilter === c ? 'active' : ''}" data-cat="${c}">${ci.icon} ${ci.label}</div>`;
    }).join('');
  filterEl.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => { gastoFilter = el.dataset.cat; renderGastos(); });
  });

  const filtered = gastoFilter === 'all' ? gastos : gastos.filter(g => g.categoria === gastoFilter);
  const listEl = document.getElementById('gastos-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Sin gastos este mes<br>Tocá + para agregar uno</div>';
  } else {
    listEl.innerHTML = [...filtered].reverse().map(g => gastoItemHTML(g)).join('');
    listEl.querySelectorAll('.gasto-item').forEach(el => {
      el.addEventListener('click', () => openEditGasto(el.dataset.id));
    });
  }
}

function gastoItemHTML(g) {
  const ci = catInfo(g.categoria);
  return `<div class="gasto-item" data-id="${g.id}">
    <div class="gasto-icon" style="background:${ci.color}22">${ci.icon}</div>
    <div class="gasto-info">
      <div class="gasto-name">${g.detalle}</div>
      <div class="gasto-meta">${ci.label} · ${g.medio || 'efectivo'}</div>
    </div>
    <div class="gasto-amount" style="color:${ci.color}">${fmt(g.importe)}</div>
  </div>`;
}

// FAB
document.getElementById('fab').addEventListener('click', () => openNewGasto());

function openNewGasto() {
  editingGastoId = null;
  document.getElementById('modal-title').textContent = 'Nuevo Gasto';
  document.getElementById('f-detalle').value = '';
  document.getElementById('f-importe').value = '';
  document.getElementById('btn-delete-gasto').style.display = 'none';
  populateGastoForm();
  document.getElementById('modal-gasto').classList.add('open');
}
function openEditGasto(id) {
  const g = STATE.gastos.find(x => x.id === id);
  if (!g) return;
  editingGastoId = id;
  document.getElementById('modal-title').textContent = 'Editar Gasto';
  document.getElementById('f-detalle').value = g.detalle;
  document.getElementById('f-importe').value = g.importe;
  document.getElementById('btn-delete-gasto').style.display = 'block';
  populateGastoForm();
  document.getElementById('f-mes').value = g.mes;
  document.getElementById('f-categoria').value = g.categoria;
  document.getElementById('f-medio').value = g.medio || 'efectivo';
  document.getElementById('modal-gasto').classList.add('open');
}
function populateGastoForm() {
  const mesEl = document.getElementById('f-mes');
  mesEl.innerHTML = MESES.map((m,i) => `<option value="${i}" ${i===STATE.selectedMonth?'selected':''}>${m}</option>`).join('');
  const catEl = document.getElementById('f-categoria');
  catEl.innerHTML = `<optgroup label="Gastos Fijos">${CAT_FIJOS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}</optgroup>
  <optgroup label="Gastos Variables">${CAT_VARIABLES.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}</optgroup>`;
}

document.getElementById('btn-save-gasto').addEventListener('click', () => {
  const detalle = document.getElementById('f-detalle').value.trim();
  const importe = parseFloat(document.getElementById('f-importe').value);
  const mes = parseInt(document.getElementById('f-mes').value);
  const categoria = document.getElementById('f-categoria').value;
  const medio = document.getElementById('f-medio').value;
  if (!detalle || isNaN(importe) || importe <= 0) { showToast('Completá detalle e importe'); return; }
  if (editingGastoId) {
    const idx = STATE.gastos.findIndex(g => g.id === editingGastoId);
    if (idx >= 0) STATE.gastos[idx] = { ...STATE.gastos[idx], detalle, importe, mes, categoria, medio };
  } else {
    STATE.gastos.push({ id: uid(), detalle, importe, mes, categoria, medio });
  }
  setState(STATE);
  closeModals();
  showToast(editingGastoId ? '✓ Gasto actualizado' : '✓ Gasto guardado');
  renderGastos();
  renderDashboard();
});

document.getElementById('btn-delete-gasto').addEventListener('click', () => {
  if (!editingGastoId) return;
  STATE.gastos = STATE.gastos.filter(g => g.id !== editingGastoId);
  setState(STATE);
  closeModals();
  showToast('Gasto eliminado');
  renderGastos();
  renderDashboard();
});

// ============================================================
// PRESUPUESTO
// ============================================================
function renderPresupuesto() {
  const mi = STATE.selectedMonth;
  buildMonthSelector('presup-months', () => renderPresupuesto());

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === presupTab);
  });

  const budgets = STATE.budgets[mi] || {};
  const cats = presupTab === 'fijos' ? CAT_FIJOS : presupTab === 'variables' ? CAT_VARIABLES : null;

  const el = document.getElementById('presup-content');
  if (presupTab === 'ingresos') {
    const ings = ingresosByMonth(mi);
    const totalIng = totalIngresosMonth(mi);
    el.innerHTML = `<div class="card-title">Total: ${fmt(totalIng)}</div>` +
      (ings.length === 0
        ? '<div class="empty-state" style="padding:16px"><div class="empty-icon">💰</div>Sin ingresos este mes</div>'
        : ings.map(g => `<div class="ingreso-list-item">
            <div class="ili-left"><div class="ili-name">${g.descripcion}</div><div class="ili-type">${g.tipo}</div></div>
            <div><div class="ili-amount">${fmt(g.importe)}</div></div>
          </div>`).join(''));
    return;
  }

  el.innerHTML = cats.map(c => {
    const budget = budgets[c.key] || 0;
    const real = gastoByCat(mi, c.key);
    const pct = budget > 0 ? (real / budget * 100).toFixed(0) : 0;
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

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => { presupTab = btn.dataset.tab; renderPresupuesto(); });
});

document.getElementById('btn-edit-presup').addEventListener('click', () => {
  const mi = STATE.selectedMonth;
  const cats = presupTab === 'ingresos' ? [] : presupTab === 'fijos' ? CAT_FIJOS : CAT_VARIABLES;
  if (!cats.length) return;
  const budgets = STATE.budgets[mi] || {};
  // Simple inline edit modal
  const el = document.getElementById('presup-content');
  el.innerHTML = '<div class="card-title" style="margin-bottom:16px">Editar Budget · ' + MESES[mi] + '</div>' +
    cats.map(c => `
      <div class="presup-item">
        <div class="presup-icon" style="background:${c.color}22">${c.icon}</div>
        <div class="presup-info"><div class="presup-name">${c.label}</div></div>
        <div>
          <input class="form-input" data-cat="${c.key}" value="${budgets[c.key]||0}" type="number" style="width:110px;text-align:right;padding:8px 10px">
        </div>
      </div>`).join('') +
    `<div style="padding:12px 0 4px"><button class="btn-primary" id="btn-save-presup">Guardar Budget</button></div>`;

  document.getElementById('btn-save-presup').addEventListener('click', () => {
    if (!STATE.budgets[mi]) STATE.budgets[mi] = {};
    el.querySelectorAll('input[data-cat]').forEach(inp => {
      STATE.budgets[mi][inp.dataset.cat] = parseFloat(inp.value) || 0;
    });
    setState(STATE);
    showToast('✓ Budget guardado');
    renderPresupuesto();
  });
});

// ============================================================
// INGRESOS
// ============================================================
function renderIngresos() {
  const mi = STATE.selectedMonth;
  buildMonthSelector('ing-months', () => renderIngresos());

  const ings = ingresosByMonth(mi);
  const total = totalIngresosMonth(mi);
  const prev = mi > 0 ? totalIngresosMonth(mi - 1) : 0;
  const avg = STATE.ingresos.length > 0
    ? MESES.reduce((s, _, i) => s + totalIngresosMonth(i), 0) / 12 : 0;

  document.getElementById('ing-summary-cards').innerHTML = `
    <div class="ingreso-card">
      <div class="ingreso-label">este mes</div>
      <div class="ingreso-value" style="color:var(--green)">${fmt(total)}</div>
      <div class="ingreso-month-label">${MESES[mi]}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">mes anterior</div>
      <div class="ingreso-value" style="color:var(--text2)">${fmt(prev)}</div>
      <div class="ingreso-month-label">${mi > 0 ? MESES[mi-1] : '—'}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">promedio anual</div>
      <div class="ingreso-value" style="color:var(--accent)">${fmt(avg)}</div>
      <div class="ingreso-month-label">${CUR_YEAR}</div>
    </div>
    <div class="ingreso-card">
      <div class="ingreso-label">total año</div>
      <div class="ingreso-value" style="color:var(--accent4)">${fmt(avg*12)}</div>
      <div class="ingreso-month-label">proyectado</div>
    </div>
  `;

  const listEl = document.getElementById('ing-list');
  if (ings.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>Sin ingresos este mes<br>Tocá + nuevo para agregar</div>';
  } else {
    listEl.innerHTML = ings.map(g => `
      <div class="ingreso-list-item">
        <div class="ili-left">
          <div class="ili-name">${g.descripcion}</div>
          <div class="ili-type">${g.tipo}</div>
        </div>
        <div>
          <div class="ili-amount">${fmt(g.importe)}</div>
        </div>
      </div>`).join('');
  }
}

document.getElementById('btn-add-ingreso').addEventListener('click', () => {
  document.getElementById('fi-desc').value = '';
  document.getElementById('fi-importe').value = '';
  const mesEl = document.getElementById('fi-mes');
  mesEl.innerHTML = MESES.map((m,i) => `<option value="${i}" ${i===STATE.selectedMonth?'selected':''}>${m}</option>`).join('');
  document.getElementById('modal-ingreso').classList.add('open');
});

document.getElementById('btn-save-ingreso').addEventListener('click', () => {
  const desc = document.getElementById('fi-desc').value.trim();
  const importe = parseFloat(document.getElementById('fi-importe').value);
  const mes = parseInt(document.getElementById('fi-mes').value);
  const tipo = document.getElementById('fi-tipo').value;
  if (!desc || isNaN(importe) || importe <= 0) { showToast('Completá descripción e importe'); return; }
  STATE.ingresos.push({ id: uid(), descripcion: desc, importe, mes, tipo });
  setState(STATE);
  closeModals();
  showToast('✓ Ingreso guardado');
  renderIngresos();
});

// ============================================================
// MODALS
// ============================================================
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModals(); });
});

// ============================================================
// IMPORT / EXPORT
// ============================================================
document.getElementById('btn-export').addEventListener('click', () => {
  const data = JSON.stringify(STATE, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fintrack-${CUR_YEAR}.json`;
  a.click();
  showToast('✓ Datos exportados');
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('input-import').click();
});

document.getElementById('input-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const importedData = JSON.parse(ev.target.result);
      // Validación básica
      if (importedData.gastos && importedData.ingresos && importedData.budgets) {
        STATE = importedData;
        setState(STATE);
        renderDashboard();
        showToast('✓ Datos importados');
      } else {
        showToast('❌ Formato JSON inválido');
      }
    } catch (err) {
      showToast('❌ Error al leer el archivo');
    }
    e.target.value = ''; // Limpiar el input
  };
  reader.readAsText(file);
});

// ============================================================
// INIT
// ============================================================
navigate('dashboard');