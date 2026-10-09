import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, restartApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, clickMonth, toastText, clearToast, getStoredState, stateWith,
  submitGasto, openGastoFromList, abrirRecurrente, submitRecurrente, tab,
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
  it('edita sólo ese mes si no se marca el checkbox', async () => {
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
    expect(byId('f-actualizar-base-group').hidden).toBe(false);
    expect(byId('f-actualizar-base').checked).toBe(false);
    submitGasto({ importe: 12000 });
    await Promise.resolve();   // el aviso de la base se emite en un microtask

    // El mes editado cambia; la base y el otro mes quedan como estaban.
    expect(getStoredState().gastos[0].importe).toBe(12000);
    expect(getStoredState().gastos[1].importe).toBe(8500);
    expect(getStoredState().recurrentes[0].importe).toBe(8500);
    expect(toastText()).not.toContain('Importe base');
  });

  it('actualiza el importe base si se marca el checkbox', async () => {
    await bootApp(conRecurrente());
    clearToast();
    navTo('gastos');

    abrirGasto('Netflix');
    byId('f-actualizar-base').checked = true;
    submitGasto({ importe: 12000 });
    await Promise.resolve();

    expect(getStoredState().gastos[0].importe).toBe(12000);
    expect(getStoredState().recurrentes[0].importe).toBe(12000);
    expect(toastText()).toContain('Importe base de Netflix actualizado');
  });

  it('actualiza la base desde un mes viejo si se marca el checkbox', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [
        { id: 'viejo', detalle: 'Netflix', importe: 8500, mes: 0, categoria: 'suscripciones', recurrenteId: 'r1' },
        { id: 'nuevo', detalle: 'Netflix', importe: 9500, mes: 1, categoria: 'suscripciones', recurrenteId: 'r1' },
      ];
    }));
    clearToast();
    navTo('gastos');

    abrirGasto('Netflix');
    byId('f-actualizar-base').checked = true;
    submitGasto({ importe: 3000 });
    await Promise.resolve();

    expect(getStoredState().recurrentes[0].importe).toBe(3000);
    // El otro mes ya cargado conserva lo que se pagó ese mes.
    expect(getStoredState().gastos[1].importe).toBe(9500);
  });

  it('el mes siguiente usa el importe base, no el del mes editado', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [{ id: 'viejo', detalle: 'Netflix', importe: 8500, mes: 0, categoria: 'suscripciones', recurrenteId: 'r1' }];
    }));
    navTo('gastos');

    abrirGasto('Netflix');
    submitGasto({ importe: 12000 });

    // Sin tocar la base, noviembre se sigue generando con 8500.
    clickMonth('gastos-months', 1);

    expect(getStoredState().gastos.find(g => g.mes === 1).importe).toBe(8500);
  });

  it('no muestra el checkbox al editar un gasto manual', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [{ id: 'manual', detalle: 'Cena', importe: 8000, mes: 0, categoria: 'salidas', medio: 'debito' }];
    }));
    navTo('gastos');

    abrirGasto('Cena');

    expect(byId('f-actualizar-base-group').hidden).toBe(true);
  });

  it('no muestra el checkbox al crear un gasto nuevo', async () => {
    await bootApp();
    byId('fab').click();

    expect(byId('f-actualizar-base-group').hidden).toBe(true);
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

describe('correr el "desde" de un recurrente', () => {
  // Siete meses ya generados (enero..julio) y el mes visible en enero: el
  // recurrente ya cubrió todos, así que la app no genera nada extra al navegar.
  const SIETE_MESES = [0, 1, 2, 3, 4, 5, 6];
  const conMesesGenerados = (meses = SIETE_MESES, extra = {}) => estadoBase((s) => {
    s.recurrentes = [recurrente()];
    s.gastos = meses.map(mi => ({
      id: `g${mi}`, detalle: 'Netflix', importe: 8500, mes: mi,
      categoria: 'suscripciones', medio: 'credito', recurrenteId: 'r1', ...extra,
    }));
  });

  const editarDesde = (nombre, valores) => {
    navTo('presupuesto');
    tab('recurrentes');
    abrirRecurrente(nombre);
    submitRecurrente(valores);
    return Promise.resolve();   // el aviso se emite en un microtask
  };

  const editarGastoDeEnero = (campos) => {
    navTo('gastos');
    abrirGastoDesdeLista('Netflix');
    submitGasto(campos);
  };

  it('borra los gastos generados antes del nuevo "desde"', async () => {
    await bootApp(conMesesGenerados());

    await editarDesde('Netflix', { detalle: 'Netflix', desde: 5 });

    expect(getStoredState().recurrentes[0].desdeMes).toBe(5);
    expect(getStoredState().gastos.map(g => g.mes)).toEqual([5, 6]);
    expect(toastText()).toContain('5 gastos anteriores eliminados');
  });

  it('conserva los gastos que el usuario editó a mano', async () => {
    await bootApp(conMesesGenerados());

    // Corregir el importe de enero lo convierte en un gasto que el usuario quiso.
    editarGastoDeEnero({ importe: 12000 });

    await editarDesde('Netflix', { detalle: 'Netflix', desde: 5 });

    const s = getStoredState();
    expect(s.gastos.map(g => g.mes).sort((a, b) => a - b)).toEqual([0, 5, 6]);
    expect(s.gastos.find(g => g.mes === 0).importe).toBe(12000);
    expect(toastText()).toContain('4 gastos anteriores eliminados');
  });

  it('no borra nada si el "desde" no se adelanta', async () => {
    await bootApp(conMesesGenerados());

    await editarDesde('Netflix', { detalle: 'Netflix', importe: 9500 });

    expect(getStoredState().gastos).toHaveLength(7);
    expect(toastText()).not.toContain('eliminados');
  });

  it('no borra nada si el "desde" se atrasa', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente({ desdeMes: 5 })];
      s.gastos = [5, 6].map(mi => ({
        id: `g${mi}`, detalle: 'Netflix', importe: 8500, mes: mi,
        categoria: 'suscripciones', recurrenteId: 'r1',
      }));
    }));

    await editarDesde('Netflix', { detalle: 'Netflix', desde: 0 });

    // Adelantar el "desde" fue lo que borró; atrasarlo no toca lo que ya está.
    expect(getStoredState().gastos.map(g => g.mes)).toEqual([5, 6]);
  });

  it('abrir y guardar sin cambiar nada no marca el gasto como editado', async () => {
    await bootApp(conMesesGenerados());

    editarGastoDeEnero({ detalle: 'Netflix' });

    expect(getStoredState().gastos[0].editado).toBeUndefined();

    await editarDesde('Netflix', { detalle: 'Netflix', desde: 5 });

    // Sin cambios reales, el gasto de enero era intacto y se fue con los demás.
    expect(getStoredState().gastos.map(g => g.mes)).toEqual([5, 6]);
  });

  it('marca el gasto como editado sólo si cambió algo', async () => {
    await bootApp(conMesesGenerados());

    editarGastoDeEnero({ importe: 12000 });

    expect(getStoredState().gastos[0].editado).toBe(true);
    // El importe base no se toca sin marcar el checkbox.
    expect(getStoredState().recurrentes[0].importe).toBe(8500);
  });
});

describe('el indicador en la lista de gastos', () => {
  it('marca con ↻ el gasto generado y no los manuales', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [recurrente()];
      s.gastos = [{ id: 'manual', detalle: 'Cena', importe: 8000, mes: 0, categoria: 'salidas', medio: 'debito' }];
    }));
    navTo('gastos');

    expect($$('#gastos-list .gasto-meta').map(n => n.textContent)).toEqual([
      'Suscripciones ↻ · 💳 crédito',   // el generado, último cargado → primero
      'Salidas · debito',
    ]);
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
// ── Pestaña Recurrentes ────────────────────────────────────
//
// Estos tests sí dependen de la fecha, así que la fijan: main.js decide hasta
// qué mes autogenera con `new Date().getMonth()`, y sin un "hoy" estable el
// resultado dependería de cuándo se corra la suite. Sólo se foca Date, no los
// timers: el harness de arranque usa setTimeout para esperar.
const OCTUBRE_FIJO = new Date(2026, 9, 15);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(OCTUBRE_FIJO); });
afterEach(() => vi.useRealTimers());

const filaPorNombre = (nombre) =>
  $$('#presup-content .recurrente-item').find(el => el.querySelector('.presup-name').textContent === nombre);

const abrirPestana = () => { navTo('presupuesto'); tab('recurrentes'); };

const crearRecurrente = (over = {}) => {
  byId('btn-new-recurrente').click();
  submitRecurrente({ detalle: 'Netflix', importe: 8500, categoria: 'suscripciones', medio: 'credito', ...over });
};

describe('la pestaña Recurrentes', () => {
  it('es la cuarta pestaña y muestra el botón de nuevo sólo ahí', async () => {
    await bootApp();
    expect($$('.tab-btn')).toHaveLength(4);
    expect(byId('btn-new-recurrente').hidden).toBe(true);
    expect(byId('btn-edit-presup').hidden).toBe(false);

    tab('recurrentes');

    expect(byId('btn-new-recurrente').hidden).toBe(false);
    // Sin budgets que editar en esta pestaña.
    expect(byId('btn-edit-presup').hidden).toBe(true);
  });

  it('lista los recurrentes con su importe base y el resumen del mes', async () => {
    await bootApp(estadoBase((s) => {
      s.recurrentes = [
        recurrente(),
        recurrente({ id: 'r2', detalle: 'Alquiler', importe: 250000, categoria: 'vivienda', activo: false }),
      ];
    }));
    abrirPestana();

    expect(filaPorNombre('Netflix').textContent).toContain('$8.500');
    expect(filaPorNombre('Netflix').textContent).toContain('desde Enero');
    expect(filaPorNombre('Alquiler').className).toContain('recurrente-pausado');
    expect($('#presup-content .recurrentes-total').textContent).toContain('$8.500');
    expect($('#presup-content .recurrentes-sub').textContent).toContain('1 activo de 2');
  });

  it('muestra un estado vacío cuando no hay recurrentes', async () => {
    await bootApp();
    abrirPestana();

    expect($('#presup-content').textContent).toContain('Sin recurrentes');
  });

  it('escapa el detalle en la lista', async () => {
    await bootApp(conRecurrente(recurrente({ detalle: '<img src=x onerror=alert(1)>' })));
    abrirPestana();

    expect(filaPorNombre('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect($('#presup-content img')).toBeNull();
  });

  it('no abre el modal al tocar el switch', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').querySelector('.switch').click();

    expect(byId('modal-recurrente').classList.contains('open')).toBe(false);
  });
});

describe('alta y edición desde la UI', () => {
  it('crea un recurrente, lo lista y carga el gasto del mes actual', async () => {
    await bootApp();
    abrirPestana();

    crearRecurrente();
    await Promise.resolve();   // el toast combinado se emite en un microtask

    expect(getStoredState().recurrentes).toHaveLength(1);
    expect(getStoredState().gastos).toHaveLength(1);
    expect(getStoredState().gastos[0]).toMatchObject({ detalle: 'Netflix', importe: 8500, mes: 0, recurrenteId: getStoredState().recurrentes[0].id });
    expect(filaPorNombre('Netflix')).toBeTruthy();
    expect(toastText()).toContain('Recurrente guardado');
  });

  it('rechaza un recurrente inválido y deja el modal abierto', async () => {
    await bootApp();
    abrirPestana();
    byId('btn-new-recurrente').click();

    submitRecurrente({ detalle: '', importe: 0 });

    expect(getStoredState().recurrentes).toHaveLength(0);
    expect(toastText()).toContain('El detalle no puede estar vacío.');
    expect(byId('modal-recurrente').classList.contains('open')).toBe(true);
  });

  it('precarga el modal al tocar la fila y guarda los cambios', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').click();
    expect(byId('recurrente-title').textContent).toBe('Editar Recurrente');
    expect(byId('r-detalle').value).toBe('Netflix');
    expect(byId('r-importe').value).toBe('8500');
    expect(byId('r-categoria').value).toBe('suscripciones');

    submitRecurrente({ importe: 12000 });

    expect(getStoredState().recurrentes[0].importe).toBe(12000);
    // La lista se repinta con el valor nuevo.
    expect(filaPorNombre('Netflix').textContent).toContain('$12.000');
  });

  it('conserva los meses salteados al editar', async () => {
    await bootApp(conRecurrente(recurrente({ salteados: [3, 7] })));
    abrirPestana();

    abrirRecurrente('Netflix');
    submitRecurrente({ importe: 9500 });

    expect(getStoredState().recurrentes[0].salteados).toEqual([3, 7]);
  });

  it('elimina un recurrente y deja los gastos que ya generó', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').click();
    byId('btn-delete-recurrente').click();

    expect(getStoredState().recurrentes).toHaveLength(0);
    expect(getStoredState().gastos).toHaveLength(1);
    expect($('#presup-content').textContent).toContain('Sin recurrentes');
  });

  it('no borra si el usuario cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').click();
    byId('btn-delete-recurrente').click();

    expect(getStoredState().recurrentes).toHaveLength(1);
    expect(byId('modal-recurrente').classList.contains('open')).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('el mes siguiente usa el importe base vigente', () => {
  it('autogenera el mes siguiente con el importe base', async () => {
    await bootApp();
    abrirPestana();
    crearRecurrente();

    clickMonth('presup-months', 1);

    expect(getStoredState().gastos.map(g => g.mes)).toEqual([0, 1]);
    expect(getStoredState().gastos[1].importe).toBe(8500);
  });

  it('usa el importe editado si el usuario marca el checkbox', async () => {
    await bootApp();
    abrirPestana();
    crearRecurrente();

    // Marcar el checkbox es lo que hace que el precio nuevo riga hacia adelante.
    navTo('gastos');
    abrirGastoDesdeLista('Netflix');
    byId('f-actualizar-base').checked = true;
    submitGasto({ importe: 11500 });

    clickMonth('gastos-months', 1);

    expect(getStoredState().recurrentes[0].importe).toBe(11500);
    expect(getStoredState().gastos.find(g => g.mes === 1).importe).toBe(11500);
  });

  it('el checkbox actualiza el gasto del mes visible al cambiar la base', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').click();
    // El checkbox sólo aparece cuando ese mes ya tiene el gasto generado, y
    // viene desmarcado: no se pisa nada del usuario sin que lo pida.
    expect(byId('r-aplicar-mes-group').hidden).toBe(false);
    expect(byId('r-aplicar-mes').checked).toBe(false);
    expect(byId('r-aplicar-mes-label').textContent).toBe('Aplicar también a Enero');

    byId('r-aplicar-mes').checked = true;
    submitRecurrente({ importe: 9900 });

    expect(getStoredState().recurrentes[0].importe).toBe(9900);
    expect(getStoredState().gastos[0].importe).toBe(9900);
  });

  it('sin marcar el checkbox, cambiar la base no toca el gasto ya generado', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    filaPorNombre('Netflix').click();
    submitRecurrente({ importe: 9900 });

    expect(getStoredState().recurrentes[0].importe).toBe(9900);
    expect(getStoredState().gastos[0].importe).toBe(8500);
  });

  it('el checkbox no aparece si el mes todavía no tiene el gasto', async () => {
    await bootApp(conRecurrente(recurrente({ desdeMes: 6 })));
    abrirPestana();

    filaPorNombre('Netflix').click();

    expect(byId('r-aplicar-mes-group').hidden).toBe(true);
  });
});

describe('pausar y reactivar', () => {
  it('pausado no genera el mes siguiente y reactivado sí', async () => {
    await bootApp();
    abrirPestana();
    crearRecurrente();

    filaPorNombre('Netflix').querySelector('.switch').click();
    expect(getStoredState().recurrentes[0].activo).toBe(false);

    clickMonth('presup-months', 1);
    expect(getStoredState().gastos.map(g => g.mes)).toEqual([0]);

    // Reactivarlo carga el mes visible en el momento.
    filaPorNombre('Netflix').querySelector('.switch').click();

    expect(getStoredState().recurrentes[0].activo).toBe(true);
    expect(getStoredState().gastos.map(g => g.mes)).toEqual([0, 1]);
  });

  it('el switch se puede operar con el teclado', async () => {
    await bootApp(conRecurrente());
    abrirPestana();

    const sw = filaPorNombre('Netflix').querySelector('.switch');
    sw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(getStoredState().recurrentes[0].activo).toBe(false);
    // La fila se repinta, así que el switch nuevo es otro nodo.
    expect(filaPorNombre('Netflix').querySelector('.switch').getAttribute('aria-checked')).toBe('false');
  });

  it('no crea recurrentes ni gastos si el recurrente empieza en un mes futuro', async () => {
    await bootApp();
    abrirPestana();
    crearRecurrente({ desde: 11 });

    expect(getStoredState().gastos).toHaveLength(0);
    expect($('#presup-content').textContent).toContain('desde Diciembre');
  });
});

/** Abre el modal de un gasto por su detalle, sin depender del orden de la lista. */
const abrirGastoDesdeLista = (detalle) => {
  const item = $$('#gastos-list .gasto-item').find(el => el.querySelector('.gasto-name').textContent === detalle);
  item.click();
};
