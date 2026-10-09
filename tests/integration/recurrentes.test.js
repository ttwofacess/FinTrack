import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, restartApp, stubBrowserApis, restoreBrowserApis,
  $$, byId, navTo, toastText, clearToast, getStoredState, stateWith,
  submitGasto, openGastoFromList,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

/**
 * Tests del cableado de recurrentes.js en main.js, sin UI propia todavía: se
 * siembran recurrentes en localStorage y se deja que la app arranque y navegue.
 *
 * Todos fijan `selectedMonth: 0` a propósito: el mes 0 es siempre <= al mes
 * real, así que el caso no depende de la fecha en la que corra el test (y evita
 * que se autogenere algo en el mes en que estamos).
 */
const recurrente = (over = {}) => ({
  id: 'r1', detalle: 'Netflix', importe: 8500, categoria: 'suscripciones',
  medio: 'credito', activo: true, desdeMes: 0, salteados: [], ...over,
});

const estadoBase = (mutate) => stateWith((s) => {
  s.selectedMonth = 0;
  mutate(s);
});

const conRecurrente = (r = recurrente()) => estadoBase((s) => { s.recurrentes = [r]; });

const gastosGenerados = () => getStoredState().gastos.filter(g => g.recurrenteId);

/** Abre el modal de un gasto por su detalle, sin depender del orden de la lista. */
const abrirGasto = (detalle) => {
  const item = $$('#gastos-list .gasto-item').find(el => el.querySelector('.gasto-name').textContent === detalle);
  item.click();
};

describe('autogeneración al entrar a un mes', () => {
  it('crea el gasto del mes al arrancar y lo avisa', async () => {
    await bootApp(conRecurrente());

    expect(gastosGenerados()).toHaveLength(1);
    expect(gastosGenerados()[0]).toMatchObject({
      detalle: 'Netflix', importe: 8500, mes: 0, recurrenteId: 'r1',
    });
    expect(toastText()).toContain('gasto recurrente cargado');
  });

  it('suma el gasto generado al dashboard', async () => {
    // El dashboard separa efectivo de tarjeta: el recurrente va por débito o el
    // total de "gastos" del mes no lo refleja.
    await bootApp(conRecurrente(recurrente({ medio: 'debito' })));

    expect(byId('dash-gastos').textContent).toBe('$8.500');
    expect(byId('screen-dashboard').textContent).toContain('Netflix');
  });

  it('es idempotente: navegar no vuelve a generar el mismo mes', async () => {
    await bootApp(conRecurrente());

    navTo('gastos');
    navTo('dashboard');
    navTo('gastos');

    expect(gastosGenerados()).toHaveLength(1);
  });

  it('no genera un mes anterior a desdeMes', async () => {
    await bootApp(conRecurrente(recurrente({ desdeMes: 6 })));

    expect(getStoredState().gastos).toHaveLength(0);
  });

  it('no genera los recurrentes pausados', async () => {
    await bootApp(conRecurrente(recurrente({ activo: false })));

    expect(getStoredState().gastos).toHaveLength(0);
  });

  it('no genera un mes que ya fue salteado', async () => {
    await bootApp(conRecurrente(recurrente({ salteados: [0] })));

    expect(getStoredState().gastos).toHaveLength(0);
  });

  it('no duplica un gasto manual con el mismo detalle y categoría', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [{ id: 'manual', detalle: 'netflix', importe: 9000, mes: 0, categoria: 'suscripciones', medio: 'credito' }];
    }));

    expect(getStoredState().gastos).toHaveLength(1);
    expect(getStoredState().gastos[0].id).toBe('manual');
  });

  it('avisa cuando genera varios gastos a la vez', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [
        recurrente(),
        recurrente({ id: 'r2', detalle: 'Alquiler', importe: 250000, categoria: 'vivienda' }),
      ];
    }));

    expect(gastosGenerados()).toHaveLength(2);
    expect(toastText()).toContain('2 gastos recurrentes cargados');
  });
});

describe('importe base y salteos', () => {
  it('actualiza el importe base al editar el gasto del mes actual', async () => {
    await bootApp(conRecurrente());
    clearToast();
    navTo('gastos');

    abrirGasto('Netflix');
    submitGasto({ importe: 12000 });
    await Promise.resolve();   // el aviso de la base se emite en un microtask

    expect(getStoredState().recurrentes[0].importe).toBe(12000);
    expect(toastText()).toContain('Importe base de Netflix actualizado');
  });

  it('no actualiza la base al corregir un gasto de un mes viejo', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [
        { id: 'viejo', detalle: 'Netflix', importe: 8500, mes: 0, categoria: 'suscripciones', recurrenteId: 'r1' },
        { id: 'nuevo', detalle: 'Netflix', importe: 8500, mes: 1, categoria: 'suscripciones', recurrenteId: 'r1' },
      ];
    }));
    clearToast();
    navTo('gastos');

    abrirGasto('Netflix');
    submitGasto({ importe: 3000 });
    await Promise.resolve();

    expect(getStoredState().recurrentes[0].importe).toBe(8500);
    expect(toastText()).not.toContain('Importe base');
  });

  it('no actualiza la base al editar un gasto manual', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [{ id: 'manual', detalle: 'Cena', importe: 8000, mes: 0, categoria: 'salidas', medio: 'debito' }];
    }));
    clearToast();
    navTo('gastos');

    abrirGasto('Cena');
    submitGasto({ importe: 9500 });
    await Promise.resolve();

    expect(getStoredState().recurrentes[0].importe).toBe(8500);
    expect(toastText()).not.toContain('Importe base');
  });

  it('registra el mes como salteado al borrar el gasto generado y no lo regenera', async () => {
    await bootApp(conRecurrente());
    clearToast();
    navTo('gastos');

    abrirGasto('Netflix');
    byId('btn-delete-gasto').click();

    expect(getStoredState().gastos).toHaveLength(0);
    expect(getStoredState().recurrentes[0].salteados).toEqual([0]);

    // Salir y volver a entrar al mes no debe regenerarlo.
    navTo('dashboard');
    navTo('gastos');
    expect(getStoredState().gastos).toHaveLength(0);
    expect($$('#gastos-list .gasto-item')).toHaveLength(0);
  });

  it('no registra salteo al borrar un gasto manual', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente({ salteados: [4] })];
      s.gastos = [{ id: 'manual', detalle: 'Cena', importe: 8000, mes: 0, categoria: 'salidas' }];
    }));
    navTo('gastos');

    abrirGasto('Cena');
    byId('btn-delete-gasto').click();

    expect(getStoredState().recurrentes[0].salteados).toEqual([4]);
  });
});

describe('el modal de recurrente', () => {
  const abrirModal = () => byId('modal-recurrente').classList.add('open');

  it('se cierra con Escape', async () => {
    await bootApp();
    abrirModal();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(byId('modal-recurrente').classList.contains('open')).toBe(false);
  });

  it('se cierra con el click en el overlay', async () => {
    await bootApp();
    abrirModal();

    byId('modal-recurrente').click();

    expect(byId('modal-recurrente').classList.contains('open')).toBe(false);
  });

  it('tiene todos los campos que necesita el formulario', async () => {
    await bootApp();

    for (const id of ['r-detalle', 'r-importe', 'r-desde', 'r-categoria', 'r-medio',
      'r-aplicar-mes', 'btn-save-recurrente', 'btn-delete-recurrente']) {
      expect(byId(id), id).not.toBeNull();
    }
  });
});

describe('persistencia', () => {
  it('conserva los recurrentes y los gastos generados al reiniciar', async () => {
    await bootApp(conRecurrente());
    await restartApp();

    const s = getStoredState();
    expect(s.recurrentes).toHaveLength(1);
    expect(s.gastos.filter(g => g.recurrenteId === 'r1')).toHaveLength(1);
  });

  it('avisa cuando los gastos recurrentes no se pudieron persistir', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await bootApp(conRecurrente());

    // Se saca el gasto generado del almacenamiento: al reiniciar se vuelve a
    // autogenerar, y esa vez sin poder guardarse.
    const s = getStoredState();
    s.gastos = s.gastos.filter(g => !g.recurrenteId);
    localStorage.setItem('fintrack_v2', JSON.stringify(s));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError');
    });

    await restartApp();

    expect(toastText()).toContain('Gastos recurrentes sin guardar');
    vi.restoreAllMocks();
  });
});