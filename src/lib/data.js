import fs from 'node:fs';
import path from 'node:path';

const raw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data/games.json'), 'utf8'),
);

const generatedAt = new Date(raw.generatedAt);
const DAY = 86_400_000;
const num = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

const REVIEW_ES = {
  'Overwhelmingly Positive': 'Extremadamente positivas',
  'Very Positive': 'Muy positivas',
  Positive: 'Positivas',
  'Mostly Positive': 'Mayormente positivas',
  Mixed: 'Variadas',
  'Mostly Negative': 'Mayormente negativas',
  Negative: 'Negativas',
};

const HIDDEN_GENRES = new Set(['Indie', 'Free to Play', 'Gratuito', 'Acceso anticipado', 'Early Access']);

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function prettyPrice(price, discount) {
  if (!price) return null;
  if (/^(gratis|free|0[.,]00)/i.test(price)) return { label: 'Gratis', free: true, discount: 0 };
  return { label: price, free: false, discount: discount || 0 };
}

/** Wilson lower bound, same idea the fetch script uses for Steam. */
function wilson(p, n, z = 1.96) {
  if (!n) return 0;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centre - margin) / denom;
}

const today = Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate());

const MONTHS_ES = { January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio', July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre' };

/** "November 2026" -> "En noviembre de 2026"; "2026" -> "En 2026"; anything else as is. */
function vagueDate(text) {
  if (!text) return 'Sin fecha';
  const m = /^(\w+) (\d{4})$/.exec(text);
  if (m && MONTHS_ES[m[1]]) return `En ${MONTHS_ES[m[1]]} de ${m[2]}`;
  if (/^\d{4}$/.test(text)) return `En ${text}`;
  return text;
}

function steamGame(g) {
  const date = parseDate(g.releaseDate);
  return {
    id: g.id,
    source: 'steam',
    releaseText: g.releaseText ?? '',
    name: g.name,
    url: g.url,
    image: g.image,
    date,
    dateLabel: date ? dateFmt.format(date) : g.releaseText,
    daysAway: date ? Math.round((date - today) / DAY) : null,
    price: prettyPrice(g.price, g.discount),
    rating: g.reviewPct
      ? {
          label: REVIEW_ES[g.reviewSummary] ?? g.reviewSummary ?? 'Reseñas',
          value: `${g.reviewPct} %`,
          detail: `${num.format(g.reviewCount)} reseñas`,
          pct: g.reviewPct,
        }
      : null,
    maker: (g.developers ?? []).join(', '),
    publisher: (g.publishers ?? []).filter((p) => !(g.developers ?? []).includes(p)).join(', '),
    genres: (g.genres ?? []).filter((x) => !HIDDEN_GENRES.has(x)).slice(0, 3),
    description: g.shortDescription ?? '',
    score: g.score ?? 0,
    popularityRank: g.popularityRank ?? null,
  };
}

function itchGame(g) {
  // itch.io feeds carry no publish date (only page creation), so releaseDate is null.
  const date = parseDate(g.releaseDate);
  return {
    id: g.id,
    source: 'itch',
    name: g.name.replace(/^"(.*)"/, '$1'),
    url: g.url,
    image: g.image,
    date,
    dateLabel: date ? dateFmt.format(date) : null,
    daysAway: null,
    price: prettyPrice(g.price, 0),
    rating: g.rating
      ? {
          label: 'De media',
          value: `${g.rating.toLocaleString('es-ES')} / 5`,
          detail: `${num.format(g.ratingCount ?? 0)} votos`,
          pct: Math.round((g.rating / 5) * 100),
        }
      : null,
    maker: g.developer ?? g.author ?? '',
    publisher: '',
    genres: [...(g.genres ?? []), ...(g.tags ?? [])].slice(0, 3),
    description: g.shortDescription ?? '',
    score: g.rating ? wilson(g.rating / 5, g.ratingCount ?? 0) : 0,
    popularityRank: null,
  };
}

/** Alternate two lists so both sources stay visible in the "Todo" view. */
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

const steam = Object.fromEntries(Object.entries(raw.steam).map(([k, v]) => [k, v.map(steamGame)]));
const itch = Object.fromEntries(Object.entries(raw.itch).map(([k, v]) => [k, v.map(itchGame)]));

const byScore = (a, b) => b.score - a.score;

const topSteam = [...steam.topMonth].sort(byScore).slice(0, 10);
const topItch = [...itch.topMonth].sort(byScore).slice(0, 10);

// Games with only a month or year ("November 2026") go last, grouped by that text.
const upcoming = [...steam.upcoming].sort(
  (a, b) =>
    (a.date ?? Infinity) - (b.date ?? Infinity) ||
    (a.date ? 0 : a.releaseText.localeCompare(b.releaseText)) ||
    (a.popularityRank ?? 99) - (b.popularityRank ?? 99),
);
const upcomingGroups = [];
for (const g of upcoming) {
  const key = g.date ? g.date.toISOString().slice(0, 10) : `tbd:${g.releaseText}`;
  let group = upcomingGroups.at(-1);
  if (!group || group.key !== key) {
    group = {
      key,
      label: g.date ? longDateFmt.format(g.date) : vagueDate(g.releaseText),
      daysAway: g.daysAway,
      games: [],
    };
    upcomingGroups.push(group);
  }
  group.games.push(g);
}

export const site = {
  generatedAt,
  updatedLabel: new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(generatedAt),
  steamIndies30d: raw.stats?.steamIndiesLast30Days ?? null,
};

export const sections = {
  week: interleave(steam.newThisWeek, itch.newThisWeek.slice(0, 24)),
  top: {
    all: [...topSteam, ...topItch].sort(byScore).slice(0, 10),
    steam: topSteam,
    itch: topItch,
  },
  gems: interleave(steam.hiddenGems, itch.newAndPopular.slice(0, 12)),
  upcoming: upcomingGroups,
  upcomingCount: upcoming.length,
};

/** Games for the hero radar: a few of this week's releases. */
export const radarBlips = sections.week.slice(0, 9).map((g, i) => {
  const angle = (i * 137.5 + 20) % 360; // golden angle spreads them evenly
  const radius = 26 + ((i * 53) % 60) * 0.33; // % of radar radius
  return { name: g.name, url: g.url, source: g.source, angle, radius };
});

export function countBy(list) {
  return {
    all: list.length,
    steam: list.filter((g) => g.source === 'steam').length,
    itch: list.filter((g) => g.source === 'itch').length,
  };
}
