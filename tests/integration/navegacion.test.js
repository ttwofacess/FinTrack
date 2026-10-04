import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootApp, stubBrowserApis, restoreBrowserApis,
  $, $$, byId, activeScreen, navTo, clickMonth, toastText, fireInstallPrompt, getStoredState,
} from '../helpers/app.js';

beforeEach(stubBrowserApis);
afterEach(restoreBrowserApis);

describe('arranque', () => {
  it('boots on the dashboard with the real index.html DOM', async () => {
    await bootApp();

    expect(activeScreen()).toBe('dashboard');
    expect(byId('dash-balance').textContent).toBe('$0');
    expect(byId('dash-months').querySelectorAll('.month-btn')).toHaveLength(12);
    expect($$('.nav-item.active')).toHaveLength(1);
  });

  it('recovers from a corrupted localStorage instead of crashing', async () => {
    localStorage.setItem('fintrack_v2', '{ no soy json');
    await bootApp();

    expect(activeScreen()).toBe('dashboard');
    expect(byId('dash-balance').textContent).toBe('$0');
  });
});

describe('navegación', () => {
  it('switches screens through the bottom nav', async () => {
    await bootApp();

    navTo('gastos');
    expect(activeScreen()).toBe('gastos');
    expect(byId('gastos-list').innerHTML).toContain('empty-state');

    navTo('presupuesto');
    expect(activeScreen()).toBe('presupuesto');
    expect($$('#presup-content .presup-item').length).toBeGreaterThan(0);

    navTo('ingresos');
    expect(activeScreen()).toBe('ingresos');

    navTo('dashboard');
    expect(activeScreen()).toBe('dashboard');
  });

  it('shows the FAB only on the gastos screen', async () => {
    await bootApp();

    expect(byId('fab').style.display).toBe('none');
    navTo('gastos');
    expect(byId('fab').style.display).toBe('flex');
    navTo('dashboard');
    expect(byId('fab').style.display).toBe('none');
  });

  it('persists the month selected from the gastos screen', async () => {
    await bootApp();
    navTo('gastos');

    clickMonth('gastos-months', 3);

    expect(getStoredState().selectedMonth).toBe(3);
    expect($$('#gastos-months .month-btn')[3].classList.contains('active')).toBe(true);

    // Al volver al dashboard ya refleja el mes nuevo.
    navTo('dashboard');
    expect(byId('dash-month-name').textContent).toMatch(/^Abril/);
    expect($$('#dash-months .month-btn')[3].classList.contains('active')).toBe(true);
  });

  it('sincroniza el selector de meses de las pantallas ocultas', async () => {
    await bootApp();
    navTo('gastos');

    clickMonth('gastos-months', 3);

    // El contenido del dashboard se repinta al entrar a la pantalla, pero el
    // selector ya construido tiene que marcar el mes nuevo en el acto.
    expect($$('#dash-months .month-btn')[3].classList.contains('active')).toBe(true);
    expect($$('#dash-months .month-btn')[9].classList.contains('active')).toBe(false);
  });

  it('resets the gastos filter when the month changes', async () => {
    await bootApp();
    navTo('gastos');

    $('.filter-chip[data-cat="credito"]').click();
    expect($$('.filter-chip.active')[0].dataset.cat).toBe('credito');

    clickMonth('gastos-months', 0);
    expect($$('.filter-chip.active')[0].dataset.cat).toBe('all');
  });
});

describe('beforeinstallprompt', () => {
  it('reveals the install pill and hides it again once installed', async () => {
    await bootApp();
    expect(byId('btn-install-app').hasAttribute('hidden')).toBe(true);

    const event = fireInstallPrompt('accepted');
    expect(event.defaultPrevented).toBe(true);
    expect(byId('btn-install-app').hasAttribute('hidden')).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));
    expect(byId('btn-install-app').hasAttribute('hidden')).toBe(true);
  });

  it('confirms the install when the user accepts the native prompt', async () => {
    await bootApp();
    const event = fireInstallPrompt('accepted');

    byId('btn-install-app').querySelector('button').click();

    await vi.waitFor(() => expect(toastText()).toContain('FinTrack instalado'));
    expect(event.prompt).toHaveBeenCalled();
    expect(byId('btn-install-app').hasAttribute('hidden')).toBe(true);
  });

  it('reports a cancelled install', async () => {
    await bootApp();
    fireInstallPrompt('dismissed');

    byId('btn-install-app').querySelector('button').click();

    await vi.waitFor(() => expect(toastText()).toContain('cancelada'));
  });

  it('falls back to a hint when the browser has no prompt', async () => {
    await bootApp();
    // Rama defensiva: el botón está oculto hasta que Chrome dispara el evento,
    // así que solo se alcanza si el prompt llegó a expirarse.
    byId('btn-install-app').removeAttribute('hidden');

    byId('btn-install-app').querySelector('button').click();

    await vi.waitFor(() => expect(toastText()).toContain('menú del navegador'));
  });
});
