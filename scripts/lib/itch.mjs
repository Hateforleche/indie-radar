import { fetchWithRetry, sleep, decodeEntities, stripTags } from './util.mjs';

const DELAY = 8000; // itch.io devuelve 429 si vamos rápido

function tag(item, name) {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '');
}

function isoDay(text) {
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

async function fetchFeed(path) {
  const xml = await fetchWithRetry(`https://itch.io/games/${path}.xml`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const link = tag(item, 'link');
    const price = tag(item, 'price');
    return {
      id: `itch:${link.replace(/^https?:\/\//, '')}`,
      source: 'itch',
      name: decodeEntities(tag(item, 'plainTitle')),
      url: link,
      image: tag(item, 'imageurl'),
      // El feed no trae la fecha de publicación: pubDate es la creación de la página
      // del proyecto (puede ser de hace años), así que no se usa como lanzamiento.
      releaseDate: null,
      createdDate: isoDay(tag(item, 'createDate') || tag(item, 'pubDate')),
      updatedDate: isoDay(tag(item, 'updateDate')),
      price: !price || price === '$0.00' ? 'Gratis' : price,
      shortDescription: stripTags(tag(item, 'description')).slice(0, 220),
      developer: link.match(/^https?:\/\/([^.]+)\.itch\.io/)?.[1] ?? null,
      platforms: stripTags(tag(item, 'platforms')),
    };
  });
}

/** Nota media y número de valoraciones desde el JSON-LD de la página del juego. */
async function fetchRating(game) {
  const html = await fetchWithRetry(game.url);
  let agg = null;
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { agg ??= JSON.parse(json).aggregateRating ?? null; } catch { /* JSON-LD malformado: ignorar */ }
  }
  const row = (label) => {
    const cell = html.match(new RegExp(`<td>${label}</td><td>([\\s\\S]*?)</td>`))?.[1] ?? '';
    return [...cell.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => decodeEntities(m[1]));
  };
  return {
    ...game,
    rating: agg ? Number(agg.ratingValue) : null,
    ratingCount: agg ? Number(agg.ratingCount) : 0,
    genres: row('Genre'),
    tags: row('Tags').slice(0, 6),
    author: row('Authors?')[0] ?? game.developer,
  };
}

export async function fetchItchSections({ ratingsFor = 12 } = {}) {
  console.log('  itch.io: novedades de los últimos 7 días');
  const week = await fetchFeed('last-7-days');
  await sleep(DELAY);
  console.log('  itch.io: mejor valorados de los últimos 30 días');
  const topMonth = await fetchFeed('top-rated/last-30-days');
  await sleep(DELAY);
  console.log('  itch.io: nuevos y populares');
  const newAndPopular = await fetchFeed('new-and-popular');

  // Notas solo para los mejor valorados (cada página cuesta ~8 s)
  const ratedTop = [];
  for (const [i, g] of topMonth.slice(0, ratingsFor).entries()) {
    await sleep(DELAY);
    process.stdout.write(`\r  itch.io: notas ${i + 1}/${Math.min(ratingsFor, topMonth.length)}   `);
    try { ratedTop.push(await fetchRating(g)); } catch (e) { console.warn(`\n  sin nota para ${g.name}: ${e.message}`); ratedTop.push(g); }
  }
  process.stdout.write('\n');

  return { newThisWeek: week, topMonth: ratedTop, newAndPopular };
}
