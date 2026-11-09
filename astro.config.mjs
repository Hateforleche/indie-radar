import { defineConfig } from 'astro/config';

// En GitHub Actions, SITE_URL y BASE_PATH llegan de actions/configure-pages
// (p. ej. https://usuario.github.io y /indie-radar). En local se sirve en la raíz.
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
  server: { port: 4321 },
});
