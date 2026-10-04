import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, navTo, toastText, activeScreen, submitGasto,
} from '../helpers/app.js';
import { showToast } from '../../ui.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

const abrirGasto = () => {
  navTo('gastos');
  byId('fab').click();
};

const clickDentro = (modalId, selector) => $(`#${modalId} ${selector}`).click();

describe('modales', () => {
  it('se abren y se cierran con el overlay', async () => {
    await bootApp();

    abrirGasto();
    expect(byId('modal-gasto').classList.contains('open')).toBe(true);

    byId('modal-gasto').click();
    expect(byId('modal-gasto').classList.contains('open')).toBe(false);
  });

  it('no se cierran al hacer click dentro del modal', async () => {
    await bootApp();
    abrirGasto();

    clickDentro('modal-gasto', '#f-detalle');

    expect(byId('modal-gasto').classList.contains('open')).toBe(true);
  });

  it('cerrar con el overlay cierra todos los modales abiertos', async () => {
    await bootApp();
    byId('btn-donate').click();
    abrirGasto();
    expect(byId('modal-donate').classList.contains('open')).toBe(true);
    expect(byId('modal-gasto').classList.contains('open')).toBe(true);

    byId('modal-gasto').click();

    expect(byId('modal-gasto').classList.contains('open')).toBe(false);
    expect(byId('modal-donate').classList.contains('open')).toBe(false);
  });
});

describe('modal de donar', () => {
  it('se abre, copia la dirección y avisa', async () => {
    await bootApp();

    byId('btn-donate').click();
    expect(byId('modal-donate').classList.contains('open')).toBe(true);
    expect($$('#modal-donate .crypto-option')).toHaveLength(3);

    clickDentro('modal-donate', '.crypto-option:first-child .copy-button');
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'bc1qxz4nxj8rzxzsnwj8u4rq46wy8dnf5h7yvzaqs2'
    );
    expect(toastText()).toContain('Dirección copiada');
    expect($('#modal-donate .copy-button').textContent).toBe('Copiado');

    // El botón vuelve a su texto original.
    await vi.waitFor(() => expect($('#modal-donate .copy-button').textContent).toBe('Copiar'), { timeout: 2500 });
  });

  it('copia la dirección de la opción elegida', async () => {
    await bootApp();
    byId('btn-donate').click();

    $$('#modal-donate .copy-button')[1].click();

    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'M8snytUjZP13KVTEHA4JCbHfy31Ve2xMr4'
    ));
  });

  it('cae al método viejo si el portapapeles falla', async () => {
    await bootApp();
    navigator.clipboard.writeText.mockRejectedValue(new Error('sin permiso'));
    document.execCommand = vi.fn(() => true);

    byId('btn-donate').click();
    clickDentro('modal-donate', '.crypto-option:first-child .copy-button');

    await vi.waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('copy'));
    expect(toastText()).toContain('Dirección copiada');
  });
});

describe('flujo del modal de gasto', () => {
  it('cerrar sin guardar no persiste nada', async () => {
    await bootApp();
    abrirGasto();

    byId('f-detalle').value = 'Alquiler';
    byId('f-importe').value = '900000';
    byId('modal-gasto').click();

    expect(toastText()).toBe('');
    expect(byId('gastos-count').textContent).toBe('0 registros');
  });

  it('el escape no viene del teclado: el cierre es por overlay o guardar', async () => {
    await bootApp();
    abrirGasto();

    byId('modal-gasto').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Documenta que la app no tiene listener de Escape: el modal sigue abierto.
    expect(byId('modal-gasto').classList.contains('open')).toBe(true);
  });
});

describe('toasts', () => {
  it('muestra el mensaje y lo oculta solo', async () => {
    await bootApp();
    // Los timers falsos se activan después del boot: el harness espera un
    // setTimeout para drenar callbacks asíncronos y se colgaría con timers falsos.
    vi.useFakeTimers();
    try {
      abrirGasto();
      submitGasto({ detalle: 'Café', importe: '2500', mes: 0, categoria: 'salidas', medio: 'efectivo' });

      expect(toastText()).toContain('Gasto guardado');
      expect(byId('toast').classList.contains('show')).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(byId('toast').classList.contains('show')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un toast con acción muestra el botón y ejecuta la acción', async () => {
    await bootApp();
    const onAction = vi.fn();

    showToast('Nueva versión disponible', { actionLabel: 'Actualizar', onAction });

    const btn = $('#toast .toast-action');
    expect(btn.textContent).toBe('Actualizar');
    btn.click();

    expect(onAction).toHaveBeenCalled();
    expect(byId('toast').classList.contains('show')).toBe(false);
  });

  it('el toast no borra el mensaje anterior si no le pasan acción', async () => {
    await bootApp();
    showToast('Primero');
    showToast('Segundo');

    expect(toastText()).toBe('Segundo');
    expect(byId('toast').querySelector('button')).toBeNull();
  });
});

describe('navegación y scroll', () => {
  it('el mes activo del selector se scrollea al centro', async () => {
    await bootApp();

    await vi.waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
  });
});
