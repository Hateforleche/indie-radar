import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; IndieRadar/0.1)' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DAY = 24 * 60 * 60 * 1000;

export async function fetchWithRetry(url, { as = 'text', retries = 4, backoff = 15000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return as === 'json' ? res.json() : res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = backoff * (attempt + 1);
      console.warn(`  ${res.status} en ${url} — reintento en ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status} en ${url}`);
  }
}

export function decodeEntities(s = '') {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');
}

export function stripTags(s = '') {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Límite inferior de Wilson (95 %): ordena por calidad sin premiar juegos con 3 reseñas al 100 %. */
export function wilson(positive, total, z = 1.96) {
  if (!total) return 0;
  const p = positive / total;
  const d = 1 + (z * z) / total;
  const c = p + (z * z) / (2 * total);
  const m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (c - m) / d;
}

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
