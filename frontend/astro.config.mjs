// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Astro handles the public feed + admin SPA; /api is proxied to the Worker
  // (see top-level deployment docs). Locally we point dev at the Worker.
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Pre-bundle heavy ESM dependencies so Vite dev server never hits
      // "Outdated Optimize Dep" / 504 on first load.
      include: [
        'motion',
        '@phosphor-icons/react',
        'react',
        'react-dom',
        '@supabase/supabase-js',
      ],
      force: true,
    },
    ssr: {
      // motion ships ESM that needs to be externalized for the CF adapter
      noExternal: ['@phosphor-icons/react'],
    },
  },
  server: {
    host: true,
  },
});
