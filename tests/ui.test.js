import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  showToast, closeModals, buildMonthSelector, syncAllMonthSelectors, gastoItemHTML,
  toastSinPersistencia, sparklineSVG,
} from '../ui.js';
import { catInfo, fmt } from '../utils.js';
import { MESES } from '../constants.js';

// jsdom does not implement scrollIntoView; the module calls it after 50ms.
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast"></div>';
  });

  it('writes the message into the toast element and shows it', () => {
    showToast('Hola');
    const t = document.getElementById('toast');
    expect(t.textContent).toBe('Hola');
    expect(t.classList.contains('show')).toBe(true);
  });

  it('replaces the previous message instead of appending', () => {
    showToast('Primero');
    showToast('Segundo');
    const t = document.getElementById('toast');
    expect(t.textContent).toBe('Segundo');
    expect(t.querySelectorAll('span')).toHaveLength(1);
  });

  it('hides the toast after the default duration', () => {
    vi.useFakeTimers();
    showToast('Temporal');
    const t = document.getElementById('toast');
    expect(t.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(t.classList.contains('show')).toBe(false);
  });

  it('honours a custom duration', () => {
    vi.useFakeTimers();
    showToast('Rápido', { duration: 1000 });
    const t = document.getElementById('toast');
    vi.advanceTimersByTime(999);
    expect(t.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(t.classList.contains('show')).toBe(false);
  });

  it('renders an action button when actionLabel and onAction are given', () => {
    const onAction = vi.fn();
    showToast('Nueva versión', { actionLabel: 'Actualizar', onAction });
    const btn = document.querySelector('#toast .toast-action');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Actualizar');
  });

  it('invokes onAction and hides the toast when the button is clicked', () => {
    const onAction = vi.fn();
    showToast('Accion', { actionLabel: 'Ir', onAction });
    document.querySelector('#toast .toast-action').click();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(document.getElementById('toast').classList.contains('show')).toBe(false);
  });

  it('renders no action button when only a label is given', () => {
    showToast('Sin accion', { actionLabel: 'Ignorado' });
    expect(document.querySelector('#toast .toast-action')).toBeNull();
  });

  it('renders no action button when only a handler is given', () => {
    showToast('Sin accion', { onAction: vi.fn() });
    expect(document.querySelector('#toast .toast-action')).toBeNull();
  });
});

describe('closeModals', () => {
  it('removes the open class from every modal overlay', () => {
    document.body.innerHTML = `
      <div class="modal-overlay open" id="m1"></div>
      <div class="modal-overlay open" id="m2"></div>
      <div class="modal-overlay" id="m3"></div>
    `;
    closeModals();
    expect(document.querySelectorAll('.modal-overlay.open')).toHaveLength(0);
    expect(document.getElementById('m3').classList.contains('open')).toBe(false);
  });

  it('does not throw when there are no modals', () => {
    expect(() => closeModals()).not.toThrow();
  });
});

describe('buildMonthSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="dash-months"></div>';
  });

  it('renders one button per month', () => {
    buildMonthSelector('dash-months', 0, vi.fn());
    expect(document.querySelectorAll('#dash-months .month-btn')).toHaveLength(MESES.length);
  });

  it('abbreviates each label to three characters', () => {
    buildMonthSelector('dash-months', 0, vi.fn());
    const labels = [...document.querySelectorAll('#dash-months .month-btn')].map(b => b.textContent);
    expect(labels[0]).toBe('Ene');
    expect(labels[11]).toBe('Dic');
  });

  it('marks the selected month as active', () => {
    buildMonthSelector('dash-months', 3, vi.fn());
    const active = document.querySelectorAll('#dash-months .month-btn.active');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe('Abr');
  });

  it('calls onChange with the clicked month index', () => {
    const onChange = vi.fn();
    buildMonthSelector('dash-months', 0, onChange);
    document.querySelectorAll('#dash-months .month-btn')[5].click();
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('moves the active class to the clicked month', () => {
    buildMonthSelector('dash-months', 0, vi.fn());
    const btns = document.querySelectorAll('#dash-months .month-btn');
    btns[8].click();
    expect(btns[8].classList.contains('active')).toBe(true);
    expect(btns[0].classList.contains('active')).toBe(false);
  });

  it('rebuilds without duplicating buttons', () => {
    buildMonthSelector('dash-months', 0, vi.fn());
    buildMonthSelector('dash-months', 1, vi.fn());
    expect(document.querySelectorAll('#dash-months .month-btn')).toHaveLength(MESES.length);
  });

  it('clears any pre-existing content of the container', () => {
    document.getElementById('dash-months').innerHTML = '<span id="stale">viejo</span>';
    buildMonthSelector('dash-months', 0, vi.fn());
    expect(document.getElementById('stale')).toBeNull();
  });

  it('does nothing when the container is missing', () => {
    expect(() => buildMonthSelector('no-existe', 0, vi.fn())).not.toThrow();
  });
});

describe('toastSinPersistencia', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast"></div>';
  });

  it('nombra qué se perdió y avisa que el almacenamiento falló', () => {
    toastSinPersistencia('Gasto nuevo');
    expect(document.getElementById('toast').textContent)
      .toContain('Gasto nuevo sin guardar');
    expect(document.getElementById('toast').textContent)
      .toContain('almacenamiento del navegador');
  });

  it('dura más que un toast normal', () => {
    vi.useFakeTimers();
    try {
      toastSinPersistencia('Ingreso');
      vi.advanceTimersByTime(5000);
      expect(document.getElementById('toast').classList.contains('show')).toBe(true);
      vi.advanceTimersByTime(3001);
      expect(document.getElementById('toast').classList.contains('show')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reemplaza el contenido anterior del toast', () => {
    showToast('✓ Gasto guardado');
    toastSinPersistencia('Gasto');
    expect(document.getElementById('toast').textContent).not.toContain('✓');
  });
});

describe('syncAllMonthSelectors', () => {
  it('activates the matching button in every known selector', () => {
    document.body.innerHTML = `
      <div id="dash-months"></div>
      <div id="gastos-months"></div>
      <div id="presup-months"></div>
      <div id="ing-months"></div>
    `;
    ['dash-months', 'gastos-months', 'presup-months', 'ing-months'].forEach(id => {
      buildMonthSelector(id, 0, vi.fn());
    });

    syncAllMonthSelectors(6);

    for (const id of ['dash-months', 'gastos-months', 'presup-months', 'ing-months']) {
      const active = document.querySelectorAll(`#${id} .month-btn.active`);
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toBe('Jul');
    }
  });

  it('skips missing containers without throwing', () => {
    expect(() => syncAllMonthSelectors(2)).not.toThrow();
  });
});

describe('gastoItemHTML', () => {
  const base = { id: 'g1', detalle: 'Supermercado', importe: 1500, mes: 0, categoria: 'alimentacion', medio: 'debito' };

  it('renders the id, detalle, category and amount', () => {
    const html = gastoItemHTML(base, catInfo, fmt);
    expect(html).toContain('data-id="g1"');
    expect(html).toContain('Supermercado');
    expect(html).toContain('Alimentación');
    expect(html).toContain('$1.500');
  });

  it('uses the injected catInfo and fmt functions', () => {
    const html = gastoItemHTML(base, () => ({ label: 'X', icon: 'i', color: '#000000' }), () => '$$$');
    expect(html).toContain('X');
    expect(html).toContain('i');
    expect(html).toContain('$$$');
  });

  it('labels credit payments explicitly', () => {
    expect(gastoItemHTML({ ...base, medio: 'credito' }, catInfo, fmt)).toContain('💳 crédito');
  });

  it('shows the raw medio for non-credit payments', () => {
    expect(gastoItemHTML({ ...base, medio: 'transferencia' }, catInfo, fmt)).toContain('transferencia');
  });

  it('falls back to efectivo when medio is missing', () => {
    const { medio, ...noMedio } = base;
    expect(gastoItemHTML(noMedio, catInfo, fmt)).toContain('efectivo');
  });

  it('marks an autogenerated gasto with ↻', () => {
    const markup = gastoItemHTML({ ...base, recurrenteId: 'r1' }, catInfo, fmt);
    expect(markup).toContain('Alimentación · debito · ↻');
  });

  it('does not mark a manual gasto', () => {
    expect(gastoItemHTML(base, catInfo, fmt)).not.toContain('↻');
    // Un recurrenteId vacío no cuenta: el campo es opcional.
    expect(gastoItemHTML({ ...base, recurrenteId: '' }, catInfo, fmt)).not.toContain('↻');
  });

  it('applies the category colour to the amount and icon', () => {
    const html = gastoItemHTML(base, catInfo, fmt);
    expect(html).toContain('#fb923c');
  });

  it('escapes HTML in detalle so injected markup is inert', () => {
    const markup = gastoItemHTML({ ...base, detalle: '<img src=x onerror=alert(1)>' }, catInfo, fmt);
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img src=x');

    // The dangerous markup must not survive as a real element once parsed.
    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelector('img')).toBeNull();
  });

  it('escapes quotes so detalle cannot break out of an attribute', () => {
    const markup = gastoItemHTML({ ...base, detalle: '" autofocus onfocus=alert(1) x="' }, catInfo, fmt);
    expect(markup).toContain('&quot;');
  });

  it('escapes the id attribute', () => {
    const markup = gastoItemHTML({ ...base, id: 'a"><script>alert(1)</script>' }, catInfo, fmt);
    expect(markup).not.toContain('<script>');

    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelector('script')).toBeNull();
  });

  it('escapes a category label coming from an unknown key', () => {
    // catInfo() falls back to using the raw key as the label, and keys can
    // come from an imported JSON file.
    const markup = gastoItemHTML({ ...base, categoria: '<b>x</b>' }, catInfo, fmt);
    expect(markup).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('still renders the plain-text detalle correctly', () => {
    const markup = gastoItemHTML({ ...base, detalle: 'Compra &Lt;pan&Gt;' }, catInfo, fmt);
    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelector('.gasto-name').textContent).toBe('Compra &Lt;pan&Gt;');
  });
});

describe('sparklineSVG', () => {
  /** Devuelve el atributo `d` del path del SVG generado. */
  const pathOf = (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    return host.querySelector('path').getAttribute('d');
  };

  /** Devuelve los puntos del path como [{ x, y }]. */
  const coordsOf = (d) =>
    d.split(/(?=[ML])/).filter(Boolean).map(p => {
      const [x, y] = p.slice(1).trim().split(' ').map(Number);
      return { x, y };
    });

  const circlesOf = (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    return [...host.querySelectorAll('circle')];
  };

  it('returns an empty string when there is nothing to draw', () => {
    expect(sparklineSVG([])).toBe('');
    expect(sparklineSVG([null, null, null])).toBe('');
  });

  it('renders an accessible svg with the given viewBox', () => {
    const markup = sparklineSVG([1, 2, 3], { label: 'Balance del año' });
    const host = document.createElement('div');
    host.innerHTML = markup;

    const svg = host.querySelector('svg.sparkline');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Balance del año');
    expect(svg.getAttribute('viewBox')).toBe('0 0 120 32');
  });

  it('honours custom dimensions', () => {
    expect(sparklineSVG([1, 2], { width: 60, height: 20 })).toContain('viewBox="0 0 60 20"');
  });

  it('draws a move plus one line per extra value', () => {
    const d = pathOf(sparklineSVG([1, 2, 3]));
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it('starts a new subpath on every gap instead of bridging it', () => {
    const d = pathOf(sparklineSVG([1, null, 3]));
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain('L');
  });

  it('keeps gaps as gaps in the middle of a run', () => {
    const d = pathOf(sparklineSVG([1, 2, null, 4, 5]));
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it('renders a flat line without NaN when every value is the same', () => {
    const d = pathOf(sparklineSVG([7, 7, 7]));
    expect(d).not.toContain('NaN');
    // height/2 = 16: la línea queda centrada en lugar de dividir por cero.
    expect(coordsOf(d).map(c => c.y)).toEqual([16, 16, 16]);
  });

  it('never emits NaN for a single value', () => {
    expect(pathOf(sparklineSVG([null, 5, null]))).not.toContain('NaN');
  });

  it('scales negative and positive values around the middle', () => {
    const coords = coordsOf(pathOf(sparklineSVG([-100, 100])));
    // El mínimo queda abajo (y alto) y el máximo arriba (y bajo).
    expect(coords[0].y).toBeGreaterThan(coords[1].y);
  });

  it('marks the active month with a bigger dot', () => {
    const circles = circlesOf(sparklineSVG([1, 2, 3], { activeIndex: 1 }));
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute('r')).toBe('2.5');
    // viewBox de 120x32: el punto central queda en x = 60.
    expect(circles[0].getAttribute('cx')).toBe('60.0');
  });

  it('omits the active dot when that month has no data', () => {
    expect(circlesOf(sparklineSVG([1, 2, 3], { activeIndex: 5 }))).toHaveLength(0);
    // Los dos meses con datos quedan como puntos sueltos, no como punto activo.
    const circles = circlesOf(sparklineSVG([1, null, 3], { activeIndex: 1 }));
    expect(circles).toHaveLength(2);
    expect(circles.every(c => c.getAttribute('r') === '1.5')).toBe(true);
  });

  it('draws a small dot for a month isolated between gaps', () => {
    const circles = circlesOf(sparklineSVG([null, 5, null]));
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute('r')).toBe('1.5');
  });

  it('does not double the isolated dot when it is the active month', () => {
    expect(circlesOf(sparklineSVG([null, 5, null], { activeIndex: 1 }))).toHaveLength(1);
  });

  it('draws no extra dot for a value that is part of a run', () => {
    expect(circlesOf(sparklineSVG([null, 5, 6, null]))).toHaveLength(0);
  });

  it('inherits the colour from currentColor', () => {
    const markup = sparklineSVG([1, 2], { activeIndex: 1 });
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('fill="currentColor"');
  });

  it('escapes the aria-label so it cannot break out of the attribute', () => {
    const markup = sparklineSVG([1, 2], { label: 'x" onload="alert(1)' });
    expect(markup).toContain('&quot;');
    expect(markup).not.toContain('onload="alert(1)"');
  });
});
