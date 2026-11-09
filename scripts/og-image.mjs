// Genera las imágenes de vista previa para redes (1200x630) en public/og-es.png y public/og-en.png.
// Uso: npm run og-image   (solo hace falta volver a ejecutarlo si cambia el diseño o el texto)
import { readFile, writeFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const C = { paper: '#E8EAE4', paperHi: '#F6F7F3', ink: '#22234A', soft: '#4A4C72', pink: '#FF4FA3', blue: '#2F6BFF', yellow: '#FFD23F' };
const font = (pkg, file) => readFile(new URL(`../node_modules/${pkg}/files/${file}`, import.meta.url));

const fonts = [
  { name: 'Anybody', data: await font('@fontsource/anybody', 'anybody-latin-900-normal.woff'), weight: 900 },
  { name: 'Atkinson', data: await font('@fontsource/atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal.woff'), weight: 400 },
  { name: 'Atkinson', data: await font('@fontsource/atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal.woff'), weight: 700 },
];

const TEXT = {
  es: { tagline: 'Juegos indie de estudios pequeños, elegidos cada día en Steam e itch.io.', chips: ['Esta semana', 'Lo mejor del mes', 'Joyas ocultas', 'Próximamente'] },
  en: { tagline: 'Indie games from small studios, picked every day on Steam and itch.io.', chips: ['This week', 'Best of the month', 'Hidden gems', 'Coming soon'] },
};

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat() } });

/** One ink layer of the wordmark; the two layers overprint like a risograph. */
const wordLayer = (color, dx, dy) =>
  h('div', { position: 'absolute', left: dx, top: dy, flexDirection: 'column', color, mixBlendMode: 'multiply' },
    h('div', {}, 'Indie'), h('div', { marginLeft: 120 }, 'Radar'));

function radar() {
  const rings = [1, 0.75, 0.5, 0.25].map((s) =>
    h('div', { position: 'absolute', left: 230 * (1 - s), top: 230 * (1 - s), width: 460 * s, height: 460 * s, borderRadius: 999, border: `2px solid ${C.ink}`, opacity: s === 1 ? 1 : 0.25 }));
  const blips = [[70, 120, C.pink], [310, 90, C.blue], [360, 260, C.pink], [130, 330, C.blue], [250, 380, C.blue], [205, 165, C.pink]].map(([x, y, c], i) =>
    h('div', { position: 'absolute', left: x, top: y, width: i === 0 ? 26 : 18, height: i === 0 ? 26 : 18, borderRadius: 999, background: c }));
  return h('div', { position: 'absolute', right: -70, top: -40, width: 460, height: 460 },
    ...sweepDots(), ...rings, ...blips);
}

/** Halftone sweep: pink dots in the top-left quadrant, fading towards the trailing edge. */
function sweepDots() {
  const dots = [];
  for (let x = 6; x < 230; x += 11) {
    for (let y = 6; y < 230; y += 11) {
      const dx = 230 - x, dy = 230 - y;
      if (Math.hypot(dx, dy) > 226) continue;
      const angle = Math.atan2(dy, dx); // 0 = left edge, PI/2 = straight up (leading edge)
      const strength = angle / (Math.PI / 2);
      const r = 1.2 + 2.6 * strength;
      dots.push(h('div', { position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: 999, background: C.pink, opacity: 0.35 + 0.6 * strength }));
    }
  }
  return dots;
}

function card(lang) {
  const t = TEXT[lang];
  return h('div', { width: 1200, height: 630, background: C.paper, position: 'relative', overflow: 'hidden', fontFamily: 'Atkinson', color: C.ink },
    radar(),
    h('div', { position: 'absolute', left: 64, top: 40, width: 900, height: 380, fontFamily: 'Anybody', fontWeight: 900, fontSize: 188, lineHeight: 0.92, letterSpacing: -4 },
      wordLayer(C.pink, 0, 0), wordLayer(C.blue, 9, -6)),
    h('div', { position: 'absolute', left: 70, bottom: 56, right: 70, flexDirection: 'column', gap: 22 },
      h('div', { fontSize: 36, lineHeight: 1.25, maxWidth: 900 }, t.tagline),
      h('div', { gap: 12 }, ...t.chips.map((c, i) =>
        h('div', { padding: '8px 18px', borderRadius: 999, border: `3px solid ${C.ink}`, fontSize: 24, fontWeight: 700, background: i === 0 ? C.yellow : C.paperHi }, c)))),
  );
}

for (const lang of ['es', 'en']) {
  const svg = await satori(card(lang), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  await writeFile(new URL(`../public/og-${lang}.png`, import.meta.url), png);
  console.log(`public/og-${lang}.png (${Math.round(png.length / 1024)} KB)`);
}
