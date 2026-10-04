import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bootApp, stubBrowserApis, restoreBrowserApis, $, byId, toastText } from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

/**
 * Reemplaza el stub de navigator.serviceWorker por uno controlable y devuelve
 * los disparadores del flujo que main.js consulta:
 *
 *   load → register('/sw.js') → updatefound → statechange(installed)
 *
 * `registration.installing` tiene que estar puesto antes de disparar
 * updatefound: es lo que main.js lee para enganchar el statechange.
 */
function instalarServiceWorker({ controller = { scriptURL: '/sw.js' } } = {}) {
  const sw = navigator.serviceWorker;

  const worker = {
    state: 'installing',
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
  };
  const registration = { addEventListener: vi.fn(), installing: null };

  sw.controller = controller;
  sw.register = vi.fn(() => Promise.resolve(registration));

  const emit = (target, type, ...args) => {
    const call = target.addEventListener.mock.calls.find(([t]) => t === type);
    if (!call) throw new Error(`main.js no registró un listener "${type}"`);
    call[1](...args);
  };

  return {
    worker,
    registration,
    register: sw.register,

    /** Dispara el evento load que main.js escucha para registrar el SW. */
    async load() {
      window.dispatchEvent(new Event('load'));
      await vi.waitFor(() => expect(sw.register).toHaveBeenCalled());
      await vi.waitFor(() => expect(registration.addEventListener).toHaveBeenCalled());
    },

    /** Simula que el navegador encontró una versión nueva del service worker. */
    async updateFound({ state = 'installed', installing = worker } = {}) {
      registration.installing = installing;
      emit(registration, 'updatefound');
      if (installing) {
        worker.state = state;
        emit(worker, 'statechange');
      }
    },
  };
}

describe('registro del service worker', () => {
  it('registra /sw.js al dispararse load', async () => {
    await bootApp();
    const sw = instalarServiceWorker();

    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();

    await sw.load();

    expect(sw.register).toHaveBeenCalledWith('/sw.js');
    expect(toastText()).toBe('');
  });

  it('avisa cuando el registro falla y no rompe la app', async () => {
    await bootApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('sin conexión');
    navigator.serviceWorker.register = vi.fn(() => Promise.reject(error));

    window.dispatchEvent(new Event('load'));

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
      '[FinTrack] Service worker registration failed:', error
    ));
    expect(byId('dash-balance').textContent).toBe('$0');
  });

  it('la app arranca igual en un browser sin soporte de service workers', async () => {
    // El API se borra antes de importar main.js: es el guard de
    // registerServiceWorker. Antes de este fix, main.js registraba el listener
    // de controllerchange a nivel de módulo y reventaba en el import.
    await bootApp(undefined, { serviceWorker: false });

    expect(byId('dash-balance').textContent).toBe('$0');
    expect(toastText()).toBe('');

    // jsdom reutiliza el mismo window entre tests, así que los listeners de
    // 'load' que dejaron los tests anteriores siguen enganchados. Se repone un
    // stub inocuo para que el evento no los haga explotar; lo que se verifica
    // acá es que la app de este test arrancó y no registró nada.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null, register: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }), addEventListener: vi.fn() },
    });
    expect(() => window.dispatchEvent(new Event('load'))).not.toThrow();
  });
});

describe('aviso de nueva versión', () => {
  it('ofrece actualizar cuando el worker nuevo queda instalado', async () => {
    await bootApp();
    const sw = instalarServiceWorker();
    await sw.load();

    await sw.updateFound();

    expect(toastText()).toContain('Nueva versión disponible');
    expect($('#toast .toast-action').textContent).toBe('Actualizar');
  });

  it('el botón Actualizar le manda SKIP_WAITING al worker nuevo', async () => {
    await bootApp();
    const sw = instalarServiceWorker();
    await sw.load();
    await sw.updateFound();

    $('#toast .toast-action').click();

    expect(sw.worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('no ofrece actualizar en la primera instalación, sin controller previo', async () => {
    await bootApp();
    const sw = instalarServiceWorker({ controller: null });
    await sw.load();

    await sw.updateFound();

    expect(toastText()).not.toContain('Nueva versión disponible');
    expect($('#toast .toast-action')).toBeNull();
  });

  it('no ofrece actualizar mientras el worker no está instalado', async () => {
    await bootApp();
    const sw = instalarServiceWorker();
    await sw.load();

    await sw.updateFound({ state: 'installing' });
    expect(toastText()).not.toContain('Nueva versión disponible');

    // Cuando termina de instalarse, el mismo statechange sí dispara el aviso.
    await sw.updateFound({ state: 'installed' });
    expect(toastText()).toContain('Nueva versión disponible');
  });

  it('aguanta un updatefound sin worker instalándose', async () => {
    await bootApp();
    const sw = instalarServiceWorker();
    await sw.load();

    // El optional chaining de main.js: no debe romper ni avisar.
    await sw.updateFound({ installing: null });

    expect(toastText()).not.toContain('Nueva versión disponible');
  });
});