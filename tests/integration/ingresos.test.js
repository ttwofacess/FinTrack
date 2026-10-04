import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, getStoredState,
  submitIngreso, stateWith,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

const nuevoIngreso = (over = {}) => ({
  descripcion: 'Sueldo', importe: '1200000', mes: 0, tipo: 'sueldo', ...over,
});

const crearIngreso = (campos) => {
  byId('btn-add-ingreso').click();
  submitIngreso(campos);
};

const seeded = (ingresos, selectedMonth = 0) =>
  stateWith((s) => { s.ingresos = ingresos; s.selectedMonth = selectedMonth; });

const cardValues = () => $$('#ing-summary-cards .ingreso-value').map(el => el.textContent);
const listNames = () => $$('#ing-list .ili-name').map(n => n.textContent);

describe('alta de ingresos', () => {
  it('guarda el ingreso, lo lista y lo persiste', async () => {
    await bootApp();
    navTo('ingresos');

    crearIngreso(nuevoIngreso());

    expect(toastText()).toContain('Ingreso guardado');
    expect(byId('modal-ingreso').classList.contains('open')).toBe(false);
    expect(listNames()).toEqual(['Sueldo']);
    expect($('#ing-list .ili-amount').textContent).toBe('$1.200.000');
    expect($('#ing-list .ili-type').textContent).toBe('sueldo');

    expect(getStoredState().ingresos).toHaveLength(1);
    expect(getStoredState().ingresos[0]).toMatchObject({
      descripcion: 'Sueldo', importe: 1200000, mes: 0, tipo: 'sueldo',
    });
  });

  it('abre el modal vacío y con el mes seleccionado', async () => {
    await bootApp(seeded([], 4));
    navTo('ingresos');

    byId('btn-add-ingreso').click();

    expect(byId('modal-ingreso').classList.contains('open')).toBe(true);
    expect(byId('fi-desc').value).toBe('');
    expect(byId('fi-importe').value).toBe('');
    expect(byId('fi-mes').value).toBe('4');
    expect(byId('fi-mes').querySelectorAll('option')).toHaveLength(12);
  });

  it('rechaza un ingreso inválido sin persistir nada', async () => {
    await bootApp();
    navTo('ingresos');

    crearIngreso(nuevoIngreso({ descripcion: '' }));
    expect(toastText()).toContain('descripción no puede estar vacía');
    expect(getStoredState().ingresos).toHaveLength(0);
    expect(byId('modal-ingreso').classList.contains('open')).toBe(true);

    crearIngreso(nuevoIngreso({ descripcion: 'Sueldo', importe: '0' }));
    expect(toastText()).toContain('importe debe ser un número mayor que cero');
    expect(getStoredState().ingresos).toHaveLength(0);
  });

  it('cae a un tipo válido si el select entrega algo desconocido', async () => {
    await bootApp();
    navTo('ingresos');

    byId('btn-add-ingreso').click();
    byId('fi-desc').value = 'Extra';
    byId('fi-importe').value = '1000';
    // Opción inválida, como la que podría dejar un JSON viejo o un DOM manipulado.
    const option = document.createElement('option');
    option.value = 'inventado';
    byId('fi-tipo').appendChild(option);
    byId('fi-tipo').value = 'inventado';
    byId('btn-save-ingreso').click();

    expect(getStoredState().ingresos[0].tipo).toBe('sueldo');
  });
});

describe('resumen de ingresos', () => {
  it('calcula total del mes, mes anterior y promedio anual', async () => {
    await bootApp(seeded([
      { id: 'i1', descripcion: 'Sueldo', importe: 100000, mes: 0, tipo: 'sueldo' },
      { id: 'i2', descripcion: 'Extra',  importe:  20000, mes: 0, tipo: 'freelance' },
      { id: 'i3', descripcion: 'Sueldo', importe:  90000, mes: 1, tipo: 'sueldo' },
    ], 1));
    navTo('ingresos');

    expect(cardValues()).toEqual(['$90.000', '$120.000', '$17.500', '$210.000']);
  });

  it('muestra el mes anterior como guion en Enero', async () => {
    await bootApp();
    navTo('ingresos');

    expect($$('#ing-summary-cards .ingreso-month-label')[1].textContent).toBe('—');
  });

  it('lista sólo los ingresos del mes visible', async () => {
    await bootApp(seeded([
      { id: 'i1', descripcion: 'Enero', importe: 100000, mes: 0, tipo: 'sueldo' },
      { id: 'i2', descripcion: 'Marzo', importe: 300000, mes: 2, tipo: 'freelance' },
    ]));
    navTo('ingresos');
    expect(listNames()).toEqual(['Enero']);

    clickMonth('ing-months', 2);
    expect(listNames()).toEqual(['Marzo']);
  });

  it('muestra el estado vacío cuando el mes no tiene ingresos', async () => {
    await bootApp();
    navTo('ingresos');

    expect(byId('ing-list').innerHTML).toContain('Sin ingresos este mes');
  });
});

describe('ingresos en el resto de la app', () => {
  it('el ingreso mueve el balance del dashboard al volver a la pantalla', async () => {
    await bootApp();
    expect(byId('dash-balance').textContent).toBe('$0');

    navTo('ingresos');
    crearIngreso(nuevoIngreso());

    navTo('dashboard');
    expect(byId('dash-ingresos').textContent).toBe('$1.200.000');
    expect(byId('dash-balance').textContent).toBe('$1.200.000');
    expect(byId('dash-balance').className).toContain('positive');
  });

  it('aparece en la pestaña de ingresos del presupuesto', async () => {
    await bootApp(seeded([
      { id: 'i1', descripcion: 'Sueldo', importe: 500000, mes: 0, tipo: 'sueldo' },
    ]));
    navTo('presupuesto');

    $('.tab-btn[data-tab="ingresos"]').click();

    expect($('#presup-content .card-title').textContent).toBe('Total: $500.000');
    expect($('#presup-content .ili-name').textContent).toBe('Sueldo');
  });

  it('la pestaña de ingresos del presupuesto está vacía si no hay ingresos', async () => {
    await bootApp();
    navTo('presupuesto');

    $('.tab-btn[data-tab="ingresos"]').click();

    expect(byId('presup-content').innerHTML).toContain('Sin ingresos este mes');
  });
});
