// Grandes empresas: si el desarrollador o la distribuidora coincide, el juego NO se considera indie.
// Distribuidoras indie (Devolver, Annapurna, Raw Fury, Team17...) se mantienen a propósito.
export const BIG_COMPANIES = [
  'Electronic Arts', 'EA Games', 'EA Sports',
  'Ubisoft',
  'Activision', 'Blizzard Entertainment',
  'Microsoft', 'Xbox Game Studios', 'Bethesda', 'Mojang',
  'Sony', 'PlayStation', 'Sony Interactive Entertainment',
  'Nintendo',
  'Take-Two', '2K', 'Rockstar Games',
  'Square Enix',
  'Bandai Namco',
  'SEGA',
  'Capcom',
  'Konami',
  'Warner Bros', 'WB Games',
  'Tencent', 'NetEase', 'Krafton', 'Nexon', 'NCSOFT',
  'Embracer', 'Plaion', 'Deep Silver', 'THQ Nordic',
  'Epic Games',
  'Valve',
  'Riot Games',
  'Games Workshop',
];

const patterns = BIG_COMPANIES.map(
  (name) => new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
);

export function isBigCompany(names = []) {
  return names.some((n) => patterns.some((p) => p.test(String(n).toLowerCase())));
}
