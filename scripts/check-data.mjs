// Comprueba que data/games.json tiene contenido razonable antes de publicarlo.
// Sale con código 1 si algo parece roto (p. ej. Steam o itch.io bloquearon las peticiones).
import { readFile } from 'node:fs/promises';

const MIN = 3;
const data = JSON.parse(await readFile('data/games.json', 'utf8'));
const problems = [];

for (const src of ['steam', 'itch']) {
  for (const [name, list] of Object.entries(data[src] ?? {})) {
    if (!Array.isArray(list) || list.length < MIN) problems.push(`${src}.${name}: ${list?.length ?? 0} juegos`);
  }
}
if (!data.steam || !data.itch) problems.push('faltan secciones de Steam o itch.io');
if ((data.stats?.steamIndiesLast30Days ?? 0) < 100) problems.push(`solo ${data.stats?.steamIndiesLast30Days} indies de Steam en 30 días`);

if (problems.length) {
  console.error(`Datos sospechosos:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Datos correctos (generados ${data.generatedAt}).`);
