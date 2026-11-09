import { fetchWithRetry, sleep, decodeEntities, stripTags, DAY } from './util.mjs';

const INDIE_TAG = 492;
const BASE = 'https://store.steampowered.com/search/results/?json=1&category1=998&cc=es&l=english&infinite=1';

// Steam da la fecha sin hora ("13 Nov, 2026"): se interpreta en UTC para que
// toISOString() no la desplace un día según la zona horaria local.
// Fechas imprecisas ("November 2026", "2026", "Q1 2027") devuelven null en vez de
// inventar el día 1, para no descartar ni fechar mal los próximos lanzamientos.
function parseDate(text) {
  if (!/^\d{1,2} \w+,? \d{4}$/.test(text.trim())) return null;
  const t = Date.parse(`${text.replace(',', '')} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function parseRows(html) {
  return html.split('<a href="https://store.steampowered.com/app/').slice(1).map((row) => {
    const appid = row.match(/data-ds-appid="(\d+)"/)?.[1];
    const name = decodeEntities(row.match(/class="title">([^<]*)</)?.[1] ?? '');
    const releasedText = stripTags(row.match(/search_released[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '');
    const tooltip = decodeEntities(row.match(/search_reviewscore[\s\S]*?data-tooltip-html="([^"]*)"/)?.[1] ?? '');
    const pct = tooltip.match(/(\d+)%/)?.[1];
    const count = tooltip.match(/of the ([\d,.]+) user reviews/)?.[1];
    const priceHtml = row.match(/discount_final_price[^>]*>([^<]*)</)?.[1];
    const priceCents = Number(row.match(/data-price-final="(\d+)"/)?.[1] ?? 0);
    const discount = Number(row.match(/data-discount="(\d+)"/)?.[1] ?? 0);
    return {
      id: `steam:${appid}`,
      appid,
      source: 'steam',
      name,
      url: `https://store.steampowered.com/app/${appid}/`,
      image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      releaseDate: parseDate(releasedText),
      releaseText: releasedText,
      // Sin precio en la ficha = juego aún sin precio (próximos lanzamientos), no gratuito.
      price: priceHtml == null ? null : priceCents === 0 ? 'Gratis' : decodeEntities(priceHtml),
      discount,
      reviewSummary: tooltip.split('<br>')[0] || null,
      reviewPct: pct ? Number(pct) : null,
      reviewCount: count ? Number(count.replace(/[,.]/g, '')) : 0,
    };
  }).filter((g) => g.appid);
}

/** Juegos con etiqueta Indie publicados en los últimos `days` días (más nuevos primero). */
// Steam publica ~100 indies al día: 30 días ≈ 60-70 páginas de 50
export async function fetchRecentIndies(days = 30, maxPages = 90) {
  const cutoff = Date.now() - days * DAY;
  const games = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE}&tags=${INDIE_TAG}&sort_by=Released_DESC&count=50&start=${page * 50}`;
    const { results_html } = await fetchWithRetry(url, { as: 'json' });
    const rows = parseRows(results_html);
    if (!rows.length) break;
    games.push(...rows);
    const last = rows.at(-1).releaseDate;
    process.stdout.write(`\r  Steam recientes: página ${page + 1}, ${games.length} juegos, último ${last}   `);
    if (last && Date.parse(last) < cutoff) break;
    await sleep(800);
  }
  process.stdout.write('\n');
  const today = Date.now();
  return games.filter((g) => g.releaseDate && Date.parse(g.releaseDate) >= cutoff && Date.parse(g.releaseDate) <= today);
}

/** Próximos lanzamientos indie, en el orden de popularidad de Steam. */
export async function fetchUpcomingIndies(limit = 60) {
  const url = `${BASE}&tags=${INDIE_TAG}&filter=popularcomingsoon&count=${limit}`;
  const { results_html } = await fetchWithRetry(url, { as: 'json' });
  return parseRows(results_html).map((g, i) => ({ ...g, popularityRank: i + 1 }));
}

/** Detalles (desarrolladora, distribuidora, géneros, descripción). Usa caché para no repetir peticiones. */
export async function fetchDetails(appid, cache) {
  if (cache[appid]) return cache[appid];
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=es&l=spanish`;
  const json = await fetchWithRetry(url, { as: 'json' });
  const d = json?.[appid]?.success ? json[appid].data : null;
  const details = d ? {
    developers: d.developers ?? [],
    publishers: (d.publishers ?? []).filter(Boolean),
    genres: (d.genres ?? []).map((g) => g.description),
    shortDescription: decodeEntities(d.short_description ?? ''),
    headerImage: d.header_image,
    type: d.type,
  } : null;
  cache[appid] = details;
  await sleep(1500);
  return details;
}
