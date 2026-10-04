/**
 * Minimal DOM fixtures for the render modules.
 * Mirrors only the ids/classes that each screen touches, so the tests stay
 * focused on logic rather than on the full index.html markup.
 */

const el = (id, tag = 'div') => {
  const node = document.createElement(tag);
  node.id = id;
  return node;
};

/** ui.js showToast() dereferences #toast without a null check. */
const addToast = () => {
  document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
};

export function mountGastosDom() {
  document.body.innerHTML = `
    <div id="gastos-months"></div>
    <input id="gastos-search" type="search">
    <select id="gastos-sort">
      <option value="recientes">Recientes</option>
      <option value="monto-desc">Monto ↓</option>
      <option value="monto-asc">Monto ↑</option>
      <option value="categoria">Categoría</option>
    </select>
    <div id="gastos-filters"></div>
    <span id="gastos-count"></span>
    <span id="gastos-total-pill"></span>
    <div id="gastos-list"></div>
    <div class="modal-overlay" id="modal-gasto"></div>
    <span id="modal-title"></span>
    <input id="f-detalle">
    <input id="f-importe">
    <input id="f-medio">
    <select id="f-mes"></select>
    <select id="f-categoria"></select>
    <button id="btn-save-gasto"></button>
    <button id="btn-delete-gasto"></button>
  `;
  addToast();
}

export function mountDashboardDom() {
  document.body.innerHTML = `
    <div id="dash-months"></div>
    <div id="dash-balance"></div>
    <div id="dash-month-name"></div>
    <div id="dash-ingresos"></div>
    <div id="dash-gastos"></div>
    <div id="dash-presup"></div>
    <div class="bi-label" id="dash-debt-label">💳 deuda</div>
    <div id="dash-debt"></div>
    <div id="dash-badges"></div>
    <div id="dash-barchart"></div>
    <div id="dash-bvr"></div>
    <div id="dash-recientes"></div>
  `;
}

export function mountIngresosDom() {
  document.body.innerHTML = `
    <div id="ing-months"></div>
    <div id="ing-summary-cards"></div>
    <div id="ing-list"></div>
    <div class="modal-overlay" id="modal-ingreso"></div>
    <input id="fi-desc">
    <input id="fi-importe">
    <select id="fi-mes"></select>
    <select id="fi-tipo">
      <option value="sueldo">Sueldo</option>
      <option value="freelance">Freelance</option>
    </select>
    <button id="btn-add-ingreso"></button>
    <button id="btn-save-ingreso"></button>
  `;
  addToast();
}

export function mountPresupuestoDom() {
  document.body.innerHTML = `
    <div id="presup-months"></div>
    <div id="presup-content"></div>
    <button class="tab-btn" data-tab="fijos">Fijos</button>
    <button class="tab-btn" data-tab="variables">Variables</button>
    <button class="tab-btn" data-tab="ingresos">Ingresos</button>
    <button id="btn-edit-presup"></button>
  `;
  addToast();
}

export { el };
