import rss from '@astrojs/rss';
import { getData } from './data.js';
import { t as dict } from './i18n.js';

const escape = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS feed for one language: this week's releases, best of the month and hidden gems. */
export function feed(lang, context) {
  const t = dict[lang];
  const { site, sections } = getData(lang);
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const home = new URL(`${base}/${lang === 'es' ? '' : 'en/'}`, context.site).href;

  const groups = [
    [t.week.title, sections.week],
    [t.top.title, sections.top.all],
    [t.gems.title, sections.gems],
  ];
  const seen = new Set();
  const items = [];
  for (const [section, games] of groups) {
    for (const g of games) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      const store = g.source === 'steam' ? 'Steam' : 'itch.io';
      const facts = [store, g.price?.label, g.rating && `${g.rating.value} (${g.rating.detail})`].filter(Boolean).join(', ');
      items.push({
        title: `${g.name} (${section})`,
        link: g.url,
        // Steam release date when known; otherwise the day the radar picked it up.
        pubDate: g.date && g.date <= site.generatedAt ? g.date : site.generatedAt,
        description: g.description || facts,
        content: `<p><img src="${escape(g.image)}" alt="" /></p>${g.description ? `<p>${escape(g.description)}</p>` : ''}<p>${escape(facts)}</p>`,
        categories: [section, store],
        customData: `<guid isPermaLink="false">${escape(g.id)}</guid>`,
      });
    }
  }

  return rss({
    title: t.rss.title,
    description: t.rss.description,
    site: home,
    items,
    customData: `<language>${lang === 'es' ? 'es-ES' : 'en-GB'}</language><lastBuildDate>${site.generatedAt.toUTCString()}</lastBuildDate>`,
  });
}
