import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Guard del APP_SHELL del service worker.
 *
 * sw.js no se importa (necesita el contexto del service worker, que jsdom no
 * replica): se lee como texto y se le saca la lista. cache.addAll() es
 * todo-o-nada, así que un archivo que falta no degrada la caché: la install
 * falla entera y la PWA instalada se queda sirviendo la versión anterior sin
 * avisar. Estos tests hacen que eso se note en el CI y no en producción.
 */

// El path sale del archivo y no de `new URL('..', import.meta.url)`: vitest
// intercepta la resolución relativa y la devuelve como http://localhost.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');

const shellEntry = (path) => swSource.includes(`'/${path}'`);

/** Las entradas del APP_SHELL, en el orden en que están escritas en sw.js. */
const shellEntries = () => {
  const bloque = swSource.slice(swSource.indexOf('APP_SHELL'), swSource.indexOf('];'));
  return [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

/**
 * Huella del contenido del shell.
 *
 * sw.js deriva el nombre de la caché de este valor: si cambia un archivo del
 * shell, cambia el nombre y los clientes dejan de servir el versión vieja. El
 * hash tiene que ser estable (mismo contenido → mismo hash) y cambiar con
 * cualquier byte de cualquier archivo.
 */
const shellHash = () => createHash('sha256')
  .update(shellEntries().map((entry) => {
    const file = entry === '/' ? 'index.html' : entry.slice(1);
    return `${entry}:${readFileSync(join(ROOT, file))}`;
  }).join('\n'))
  .digest('hex')
  .slice(0, 12);

/**
 * Raíces .js que no son módulos de la app y por lo tanto no van en el shell:
 * sw.js es el worker mismo (no se cachea a sí mismo) y vitest.config.js es
 * tooling de desarrollo, que nunca se pide desde el navegador.
 */
const NO_ES_MODULO_APP = ['sw.js', 'vitest.config.js'];

/** Todos los .js de la raíz, que son los módulos de la app. */
const modulosApp = () => readdirSync(ROOT)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !NO_ES_MODULO_APP.includes(f));

/** Todos los .css de styles/, que main.css importa. */
const hojasDeEstilo = (dir = join(ROOT, 'styles')) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return hojasDeEstilo(full);
    return entry.endsWith('.css') ? [relative(ROOT, full).split(sep).join('/')] : [];
  });

describe('sw.js — APP_SHELL', () => {
  it('deriva el nombre de la caché del hash del shell', () => {
    expect(swSource).toMatch(/const CACHE_NAME = `fintrack-\$\{SHELL_HASH\}`;/);
  });

  it('el hash declarado es el del contenido actual del shell', () => {
    // Si tocaste un archivo del shell, el hash quedó viejo: el service worker
    // no reinstala y los clientes se quedan con el código anterior.
    const esperado = shellHash();
    const declarado = swSource.match(/const SHELL_HASH = '([^']+)'/)?.[1];
    expect(declarado, `actualizá SHELL_HASH a '${esperado}' en sw.js`).toBe(esperado);
  });

  it('cachea todos los módulos de la app', () => {
    const faltantes = modulosApp().filter((f) => !shellEntry(f));
    expect(faltantes).toEqual([]);
  });

  it('cachea todas las hojas de estilo', () => {
    const faltantes = hojasDeEstilo().filter((f) => !shellEntry(f));
    expect(faltantes).toEqual([]);
  });

  it('no lista dos veces la misma entrada', () => {
    const entradas = shellEntries();
    expect(entradas).toHaveLength(new Set(entradas).size);
  });
});