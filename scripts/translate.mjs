// Traduce al otro idioma (español <-> inglés) las descripciones que no vienen traducidas:
// juegos de Steam sin ficha en español y todas las de itch.io.
// Usa un servidor LibreTranslate (LT_URL, por defecto http://localhost:5000) y guarda cada
// traducción en data/cache/translations.json para no repetirla nunca.
//
// Uso:
//   node scripts/translate.mjs            aplica la caché y traduce lo pendiente (si hay servidor)
//   node scripts/translate.mjs --pending  solo imprime cuántas descripciones faltan por traducir
//
// Nunca falla: si el servidor no responde, la web muestra el texto original.
import { createHash } from 'node:crypto';
import { readJson, writeJson } from './lib/util.mjs';

const DATA = 'data/games.json';
const CACHE = 'data/cache/translations.json';
const LT_URL = (process.env.LT_URL || 'http://localhost:5000').replace(/\/$/, '');

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** The single text a game needs translated, or null if it already has both languages. */
function sourceText(game) {
  if (game.source === 'steam') {
    const es = game.shortDescription?.trim();
    const en = game.shortDescriptionEn?.trim();
    if (es && en && es !== en) return null; // Steam already has both
    return en || es || null;
  }
  return game.shortDescription?.trim() || null;
}

async function lt(body) {
  const res = await fetch(`${LT_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'text', ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Detects en/es and returns { lang, es, en }. */
async function translate(text) {
  const toEs = await lt({ q: text, source: 'auto', target: 'es' });
  const detected = toEs.detectedLanguage?.language;
  if (detected === 'es') {
    const toEn = await lt({ q: text, source: 'es', target: 'en' });
    return { lang: 'es', es: text, en: toEn.translatedText };
  }
  return { lang: 'en', es: toEs.translatedText, en: text };
}

const data = await readJson(DATA);
const cache = await readJson(CACHE, {});
const games = [...Object.values(data.steam), ...Object.values(data.itch)].flat();

const pending = new Map();
for (const g of games) {
  const text = sourceText(g);
  if (text && !cache[hash(text)]) pending.set(hash(text), text);
}

if (process.argv.includes('--pending')) {
  console.log(pending.size);
  process.exit(0);
}

let done = 0;
let failed = 0;
if (pending.size) {
  console.log(`Traduciendo ${pending.size} descripciones con ${LT_URL}…`);
  for (const [key, text] of pending) {
    try {
      cache[key] = await translate(text);
      done++;
    } catch (e) {
      failed++;
      console.warn(`  sin traducir (${e.message})`);
      if (failed >= 3 && done === 0) {
        console.warn('  LibreTranslate no responde; se mostrará el texto original.');
        break;
      }
    }
  }
}

// Apply translations to every game and drop cache entries no longer used.
const used = {};
for (const g of games) {
  const text = sourceText(g);
  delete g.descriptionEs;
  delete g.descriptionEn;
  delete g.machineTranslated;
  if (!text) continue;
  const t = cache[hash(text)];
  if (!t) continue;
  used[hash(text)] = t;
  g.descriptionEs = t.es;
  g.descriptionEn = t.en;
  g.machineTranslated = t.lang === 'es' ? 'en' : 'es'; // the language that was machine-translated
}

await writeJson(CACHE, used);
await writeJson(DATA, data);
console.log(`Traducciones: ${done} nuevas, ${failed} fallidas, ${Object.keys(used).length} en uso.`);
