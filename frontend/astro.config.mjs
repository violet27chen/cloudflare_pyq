// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
//
// Static build. The built files in dist/ are served by the Worker's
// [assets] binding (see worker/wrangler.toml). The API is same-origin
// (/api/*), so no separate Pages project or proxy is needed.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
  },
});
