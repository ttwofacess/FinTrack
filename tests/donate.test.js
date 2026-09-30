import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDonateModal } from '../donate.js';

const mount = () => {
  document.body.innerHTML = `
    <div id="toast"></div>
    <button id="btn-donate">Donar</button>
    <div class="modal-overlay" id="modal-donate">
      <div class="crypto-option">
        <input class="crypto-address" value="abc123">
        <button class="copy-button">Copiar</button>
      </div>
    </div>
  `;
};

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  mount();
  writeText.mockClear();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('initDonateModal', () => {
  it('opens the modal when the donate button is clicked', () => {
    initDonateModal();
    document.getElementById('btn-donate').click();
    expect(document.getElementById('modal-donate').classList.contains('open')).toBe(true);
  });

  it('closes any other open modal before opening the donate one', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-overlay open" id="otro"></div>');
    initDonateModal();
    document.getElementById('btn-donate').click();
    expect(document.getElementById('otro').classList.contains('open')).toBe(false);
  });

  it('does nothing when the markup is missing', () => {
    document.body.innerHTML = '<div id="toast"></div>';
    expect(() => initDonateModal()).not.toThrow();
  });

  it('does not throw when only the button is missing', () => {
    document.body.innerHTML = '<div id="toast"></div><div id="modal-donate"></div>';
    expect(() => initDonateModal()).not.toThrow();
  });
});

describe('initDonateModal — copy address', () => {
  it('copies the address to the clipboard', async () => {
    initDonateModal();
    document.querySelector('.copy-button').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('abc123'));
  });

  it('shows the copied state and a toast', async () => {
    initDonateModal();
    const btn = document.querySelector('.copy-button');
    btn.click();

    await vi.waitFor(() => expect(btn.textContent).toBe('Copiado'));
    expect(document.getElementById('toast').textContent).toBe('Dirección copiada');
  });

  it('restores the original label after 1800ms', async () => {
    vi.useFakeTimers();
    initDonateModal();
    const btn = document.querySelector('.copy-button');
    btn.click();

    await vi.waitFor(() => expect(btn.textContent).toBe('Copiado'));
    vi.advanceTimersByTime(1800);
    expect(btn.textContent).toBe('Copiar');
  });

  it('falls back to execCommand when the clipboard API rejects', async () => {
    const execCommand = vi.fn();
    document.execCommand = execCommand;
    writeText.mockRejectedValueOnce(new Error('denied'));

    initDonateModal();
    document.querySelector('.copy-button').click();

    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(document.getElementById('toast').textContent).toBe('Dirección copiada');
  });

  it('ignores a copy button with no address input', async () => {
    document.querySelector('.crypto-option').innerHTML = '<button class="copy-button">Copiar</button>';
    initDonateModal();
    document.querySelector('.copy-button').click();
    await new Promise(r => setTimeout(r, 20));
    expect(writeText).not.toHaveBeenCalled();
  });
});
