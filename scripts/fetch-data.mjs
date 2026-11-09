// Recoge juegos indie de Steam e itch.io y genera data/games.json para la web.
// Uso: npm run fetch-data
import { fetchRecentIndies, fetchUpcomingIndies, fetchDetails } from './lib/steam.mjs';
import { fetchItchSections } from './lib/itch.mjs';
import { isBigCompany } from './lib/blocklist.mjs';
import { wilson, readJson, writeJson, DAY } from './lib/util.mjs';

const OUT = 'data/games.json';
const CACHE = 'data/cache/steam-details.json';

const CONFIG = {
  newThisWeek: { days: 7, limit: 24 },
  topMonth: { days: 30, minReviews: 20, limit: 10 },
  hiddenGems: { days: 30, minReviews: 10, maxReviews: 300, minPct: 90, limit: 12 },
  upcoming: { limit: 20 },
};

const score = (g) => wilson((g.reviewPct ?? 0) / 100 * g.reviewCount, g.reviewCount);
const byScore = (a, b) => score(b) - score(a) || b.reviewCount - a.reviewCount;

/** Recorre candidatos en orden, pide detalles y descarta grandes empresas hasta llenar `limit`. */
async function pickIndies(candidates, limit, cache, exclude = new Set()) {
  const picked = [];
  for (const g of candidates) {
    if (picked.length >= limit) break;
    if (exclude.has(g.id)) continue;
    const d = await fetchDetails(g.appid, cache);
    if (!d || (d.type && d.type !== 'game')) continue;
    if (isBigCompany([...d.developers, ...d.publishers])) {
      console.log(`  descartado (gran empresa): ${g.name} — ${[...d.publishers].join(', ')}`);
      continue;
    }
    picked.push({ ...g, ...d, image: d.headerImage ?? g.image, score: Number(score(g).toFixed(4)) });
  }
  return picked;
}

async function main() {
  const started = Date.now();
  const cache = await readJson(CACHE, {});

  console.log('Steam');
  const recent = await fetchRecentIndies(CONFIG.topMonth.days);
  const weekCutoff = Date.now() - CONFIG.newThisWeek.days * DAY;

  const weekCandidates = recent.filter((g) => Date.parse(g.releaseDate) >= weekCutoff).sort(byScore);
  const topCandidates = recent.filter((g) => g.reviewCount >= CONFIG.topMonth.minReviews).sort(byScore);
  const { minReviews, maxReviews, minPct } = CONFIG.hiddenGems;
  const gemCandidates = recent
    .filter((g) => g.reviewCount >= minReviews && g.reviewCount <= maxReviews && (g.reviewPct ?? 0) >= minPct)
    .sort(byScore);
  const upcomingRaw = await fetchUpcomingIndies(CONFIG.upcoming.limit * 3);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingCandidates = upcomingRaw.filter((g) => !g.releaseDate || g.releaseDate > today);

  console.log(`  ${recent.length} indies en 30 días · pidiendo detalles de candidatos…`);
  const topMonth = await pickIndies(topCandidates, CONFIG.topMonth.limit, cache);
  const hiddenGems = await pickIndies(gemCandidates, CONFIG.hiddenGems.limit, cache, new Set(topMonth.map((g) => g.id)));
  const newThisWeek = await pickIndies(weekCandidates, CONFIG.newThisWeek.limit, cache);
  const upcoming = await pickIndies(upcomingCandidates, CONFIG.upcoming.limit, cache);
  await writeJson(CACHE, cache);

  console.log('itch.io');
  const itch = await fetchItchSections();

  const data = {
    generatedAt: new Date().toISOString(),
    stats: { steamIndiesLast30Days: recent.length },
    steam: { newThisWeek, topMonth, hiddenGems, upcoming },
    itch,
  };
  await writeJson(OUT, data);

  console.log(`\nListo en ${Math.round((Date.now() - started) / 1000)} s → ${OUT}`);
  for (const [src, sections] of Object.entries({ steam: data.steam, itch: data.itch })) {
    for (const [name, list] of Object.entries(sections)) console.log(`  ${src}.${name}: ${list.length}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
