import fs from 'node:fs';
import path from 'node:path';
import { t as dict } from './i18n.js';

const raw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data/games.json'), 'utf8'),
);

const generatedAt = new Date(raw.generatedAt);
const DAY = 86_400_000;
const today = Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate());
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wilson lower bound, same idea the fetch script uses for Steam. */
function wilson(p, n, z = 1.96) {
  if (!n) return 0;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centre - margin) / denom;
}

/** Alternate two lists so both sources stay visible in the "All" view. */
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function build(lang) {
  const t = dict[lang];
  const num = new Intl.NumberFormat(t.locale, { useGrouping: 'always' });
  const dateFmt = new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const longDateFmt = new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const monthFmt = new Intl.DateTimeFormat(t.locale, { month: 'long', timeZone: 'UTC' });
  const pct = (n) => (lang === 'es' ? `${n} %` : `${n}%`);

  /** "November 2026" -> "En noviembre de 2026" / "In November 2026"; "2026" -> "En 2026". */
  function vagueDate(text) {
    if (!text) return t.noDate;
    const m = /^(\w+) (\d{4})$/.exec(text);
    const month = m ? MONTHS_EN.indexOf(m[1]) : -1;
    if (month >= 0) return t.inMonth(monthFmt.format(new Date(Date.UTC(2000, month, 1))), m[2]);
    if (/^\d{4}$/.test(text)) return t.inYear(text);
    return text;
  }

  function price(p, discount) {
    if (!p) return null;
    if (/^(gratis|free|0[.,]00)/i.test(p)) return { label: t.free, free: true, discount: 0 };
    return { label: p, free: false, discount: discount || 0 };
  }

  function steamGame(g) {
    const date = parseDate(g.releaseDate);
    const description = lang === 'en' ? g.shortDescriptionEn || g.shortDescription : g.shortDescription;
    return {
      id: g.id,
      source: 'steam',
      releaseText: g.releaseText ?? '',
      name: g.name,
      url: lang === 'en' ? `${g.url}?l=english` : g.url,
      image: g.image,
      date,
      dateLabel: date ? dateFmt.format(date) : g.releaseText,
      daysAway: date ? Math.round((date - today) / DAY) : null,
      price: price(g.price, g.discount),
      rating: g.reviewPct
        ? {
            label: t.reviewSummary[g.reviewSummary] ?? g.reviewSummary ?? t.reviews,
            value: pct(g.reviewPct),
            detail: `${num.format(g.reviewCount)} ${t.reviews}`,
            pct: g.reviewPct,
          }
        : null,
      maker: (g.developers ?? []).join(', '),
      description: description ?? '',
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
      price: price(g.price, 0),
      rating: g.rating
        ? {
            label: t.average,
            value: `${g.rating.toLocaleString(t.locale)} / 5`,
            detail: `${num.format(g.ratingCount ?? 0)} ${t.votes}`,
            pct: Math.round((g.rating / 5) * 100),
          }
        : null,
      maker: g.developer ?? g.author ?? '',
      // Written by the author on itch.io, usually in English; not translated.
      description: g.shortDescription ?? '',
      score: g.rating ? wilson(g.rating / 5, g.ratingCount ?? 0) : 0,
      popularityRank: null,
    };
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

  const sections = {
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

  const site = {
    generatedAt,
    updatedLabel: new Intl.DateTimeFormat(t.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Madrid',
    }).format(generatedAt),
    steamIndies30d: raw.stats?.steamIndiesLast30Days ?? null,
    num,
  };

  /** Games for the hero radar: a few of this week's releases. */
  const radarBlips = sections.week.slice(0, 9).map((g, i) => {
    const angle = (i * 137.5 + 20) % 360; // golden angle spreads them evenly
    const radius = 26 + ((i * 53) % 60) * 0.33; // % of radar radius
    return { name: g.name, source: g.source, angle, radius };
  });

  return { site, sections, radarBlips };
}

const memo = {};
export function getData(lang) {
  return (memo[lang] ??= build(lang));
}

export function countBy(list) {
  return {
    all: list.length,
    steam: list.filter((g) => g.source === 'steam').length,
    itch: list.filter((g) => g.source === 'itch').length,
  };
}
