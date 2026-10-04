import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, getStoredState, stateWith,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

const tab = (name) => $(`.tab-btn[data-tab="${name}"]`).click();
const itemPorNombre = (nombre) =>
  $$('#presup-content .presup-item').find(el => el.querySelector('.presup-name').textContent === nombre);

const conGasto = (gastos, budgets = {}, selectedMonth = 0) =>
  stateWith((s) => {
    s.gastos = gastos;
    s.selectedMonth = selectedMonth;
    Object.assign(s.budgets[selectedMonth], budgets);
  });

const gasto = (over = {}) => ({
  id: 'g1', detalle: 'Alquiler', importe: 800000, mes: 0,
  categoria: 'vivienda', medio: 'transferencia', ...over,
});

/** Abre la edición inline, setea un valor y guarda. */
const editarBudget = (catKey, valor) => {
  byId('btn-edit-presup').click();
  $(`#presup-content input[data-cat="${catKey}"]`).value = String(valor);
  byId('btn-save-presup').click();
};

describe('edición del presupuesto', () => {
  it('guarda el budget, vuelve a la vista de lectura y lo persiste', async () => {
    await bootApp();
    navTo('presupuesto');
    expect(itemPorNombre('Vivienda').querySelector('.presup-budget').textContent).toBe('budget: $0');

    editarBudget('vivienda', 900000);

    expect(toastText()).toContain('Budget guardado');
    expect(itemPorNombre('Vivienda').querySelector('.presup-budget').textContent).toBe('budget: $900.000');
    expect(getStoredState().budgets[0].vivienda).toBe(900000);
    // El modo edición se cierra solo y vuelve la lista.
    expect($('#btn-save-presup')).toBeNull();
    expect($$('#presup-content .presup-item')).toHaveLength(8);
  });

  it('precarga los budgets existentes en el formulario de edición', async () => {
    await bootApp(conGasto([], { vivienda: 700000, servicios: 45000 }));
    navTo('presupuesto');

    byId('btn-edit-presup').click();

    expect($('#presup-content input[data-cat="vivienda"]').value).toBe('700000');
    expect($('#presup-content input[data-cat="servicios"]').value).toBe('45000');
    expect($('#presup-content input[data-cat="ahorro"]').value).toBe('0');
  });

  it('guarda el budget del mes visible, no del mes inicial', async () => {
    await bootApp();
    navTo('presupuesto');
    clickMonth('presup-months', 7);

    editarBudget('vivienda', 500000);

    expect(getStoredState().budgets[7].vivienda).toBe(500000);
    expect(getStoredState().budgets[0].vivienda).toBe(0);
    expect($('#presup-content .card-title, #presup-content').textContent).not.toContain('Agosto');
  });

  it('rechaza un budget negativo y enfoca el input inválido', async () => {
    await bootApp(conGasto([], { vivienda: 700000 }));
    navTo('presupuesto');

    byId('btn-edit-presup').click();
    const input = $('#presup-content input[data-cat="vivienda"]');
    input.value = '-1000';
    byId('btn-save-presup').click();

    expect(toastText()).toContain('debe ser un número positivo');
    expect(getStoredState().budgets[0].vivienda).toBe(700000);
    expect(document.activeElement).toBe(input);
    // El formulario sigue abierto para corregir.
    expect($('#btn-save-presup')).not.toBeNull();
  });

  it('rechaza un budget con basura y no guarda parcialmente', async () => {
    await bootApp();
    navTo('presupuesto');

    byId('btn-edit-presup').click();
    $('#presup-content input[data-cat="vivienda"]').value = '900000';
    $('#presup-content input[data-cat="ahorro"]').value = 'abc';
    byId('btn-save-presup').click();

    expect(toastText()).toContain('debe ser un número positivo');
    expect(getStoredState().budgets[0].vivienda).toBe(0);
  });

  it('el tab de ingresos no abre el editor', async () => {
    await bootApp();
    navTo('presupuesto');
    tab('ingresos');

    // Aunque el botón esté oculto, un click disparado por código lo alcanzaría.
    byId('btn-edit-presup').click();

    expect($('#btn-save-presup')).toBeNull();
    expect(byId('presup-content').innerHTML).toContain('Sin ingresos este mes');
  });

  it('oculta el botón editar en el tab de ingresos', async () => {
    await bootApp();
    navTo('presupuesto');
    expect(byId('btn-edit-presup').hidden).toBe(false);

    tab('ingresos');

    expect(byId('btn-edit-presup').hidden).toBe(true);
    expect(getComputedStyle(byId('btn-edit-presup')).display).toBe('none');
  });

  it('vuelve a mostrar el botón editar al salir del tab de ingresos', async () => {
    await bootApp();
    navTo('presupuesto');
    tab('ingresos');
    tab('variables');
    expect(byId('btn-edit-presup').hidden).toBe(false);

    byId('btn-edit-presup').click();
    expect($('#btn-save-presup')).not.toBeNull();
  });

  it('mantiene el botón oculto aunque el estado se repinte en el tab de ingresos', async () => {
    await bootApp();
    navTo('presupuesto');
    tab('ingresos');

    // Un re-render por cambio de mes no debe resucitar el botón.
    clickMonth('presup-months', 2);

    expect(byId('btn-edit-presup').hidden).toBe(true);
  });

  it('el estado vacío del tab de ingresos dice dónde se cargan', async () => {
    await bootApp();
    navTo('presupuesto');
    tab('ingresos');

    expect(byId('presup-content').innerHTML).toContain('Agregalos desde la pantalla Ingresos');
  });
});

describe('presupuesto vs real', () => {
  it('muestra el porcentaje ejecutado y el color según el desvío', async () => {
    await bootApp(conGasto([gasto({ id: 'a', importe: 800000 })], { vivienda: 800000 }));
    navTo('presupuesto');

    let item = itemPorNombre('Vivienda');
    expect(item.querySelector('.presup-sub').textContent).toBe('100% ejecutado');
    // El rojo es "pasado el presupuesto", no "justo en el límite".
    expect(item.querySelector('.presup-real').style.color).toBe('var(--accent4)');

    await bootApp(conGasto([gasto({ id: 'a', importe: 900000 })], { vivienda: 800000 }));
    navTo('presupuesto');
    item = itemPorNombre('Vivienda');
    expect(item.querySelector('.presup-sub').textContent).toBe('113% ejecutado');
    expect(item.querySelector('.presup-real').style.color).toBe('var(--red)');

    await bootApp(conGasto([gasto({ id: 'a', importe: 500000 })], { vivienda: 800000 }));
    navTo('presupuesto');
    item = itemPorNombre('Vivienda');
    expect(item.querySelector('.presup-sub').textContent).toBe('63% ejecutado');
    expect(item.querySelector('.presup-real').style.color).toBe('var(--accent3)');

    await bootApp(conGasto([gasto({ id: 'a', importe: 700000 })], { vivienda: 800000 }));
    navTo('presupuesto');
    item = itemPorNombre('Vivienda');
    expect(item.querySelector('.presup-sub').textContent).toBe('88% ejecutado');
    expect(item.querySelector('.presup-real').style.color).toBe('var(--accent4)');
  });

  it('el tab de variables compara contra los gastos variables', async () => {
    await bootApp(conGasto([
      gasto({ id: 'a', categoria: 'alimentacion', importe: 30000 }),
      gasto({ id: 'b', categoria: 'salidas', importe: 20000 }),
    ], { alimentacion: 100000 }));
    navTo('presupuesto');
    tab('variables');

    expect(itemPorNombre('Alimentación').querySelector('.presup-sub').textContent).toBe('30% ejecutado');
    expect(itemPorNombre('Salidas').querySelector('.presup-sub').textContent).toBe('0% ejecutado');
    expect($$('#presup-content .presup-item')).toHaveLength(10);
  });

  it('mantiene el tab activo al cambiar de mes', async () => {
    await bootApp();
    navTo('presupuesto');
    tab('variables');

    clickMonth('presup-months', 2);

    expect($('.tab-btn[data-tab="variables"]').classList.contains('active')).toBe(true);
    expect($$('#presup-content .presup-item')).toHaveLength(10);
  });
});

describe('presupuesto en el dashboard', () => {
  it('suma todos los budgets del mes en el hero y en budget vs real', async () => {
    await bootApp(conGasto([gasto({ id: 'a', importe: 400000 })], {
      vivienda: 800000, servicios: 100000, alimentacion: 60000,
    }));
    navTo('dashboard');

    expect(byId('dash-presup').textContent).toBe('$960.000');
    expect($$('#dash-bvr .bvr-row')).toHaveLength(3);
    expect($('#dash-bvr .bvr-vals').textContent).toBe('$400.000 / $800.000');
  });

  it('un budget nuevo se ve en el dashboard sin cambiar de pantalla', async () => {
    await bootApp();
    navTo('presupuesto');

    editarBudget('vivienda', 800000);

    expect(byId('dash-presup').textContent).toBe('$800.000');
    expect($$('#dash-bvr .bvr-vals')[0].textContent).toBe('$0 / $800.000');
  });
});
