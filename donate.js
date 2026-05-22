import { closeModals, showToast } from './ui.js';

/**
 * Inicializa el modal de donaciones: apertura y funcionalidad de copiado.
 */
export function initDonateModal() {
  const donateButton = document.getElementById('btn-donate');
  const donateModal = document.getElementById('modal-donate');

  if (!donateButton || !donateModal) return;

  donateButton.addEventListener('click', () => {
    closeModals();
    donateModal.classList.add('open');
  });

  donateModal.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', async () => {
      const option = button.closest('.crypto-option');
      const input = option?.querySelector('.crypto-address');
      if (!input) return;

      try {
        await navigator.clipboard.writeText(input.value);
        const originalText = button.textContent;
        button.textContent = 'Copiado';
        showToast('Dirección copiada');
        setTimeout(() => { button.textContent = originalText; }, 1800);
      } catch (err) {
        // Fallback para navegadores antiguos
        input.select();
        document.execCommand('copy');
        showToast('Dirección copiada');
      }
    });
  });
}
