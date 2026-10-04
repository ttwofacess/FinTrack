import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

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
  it('tiene una versión con el formato fintrack-vN', () => {
    expect(swSource).toMatch(/const CACHE_NAME = 'fintrack-v\d+';/);
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
    const bloque = swSource.slice(swSource.indexOf('APP_SHELL'), swSource.indexOf('];'));
    const entradas = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(entradas).toHaveLength(new Set(entradas).size);
  });
});