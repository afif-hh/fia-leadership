import tailwindcss from '@tailwindcss/vite'

import { rawMarkdown } from './build/raw-markdown'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxtjs/google-fonts'],

  // ui/ has both index.ts and .vue per component; scanning both as components
  // triggers NUXT_B3011 name collisions, so restrict ui/ to .vue.
  components: {
    dirs: [{ path: '~/components/ui', extensions: ['vue'] }, '~/components'],
  },

  // Generates .nuxt/eslint.config.mjs, which eslint.config.mjs extends. Without
  // the module registered there is no flat config at all and `pnpm lint` cannot
  // run — which is how it sat until #29.
  eslint: {
    config: {
      stylistic: false,
    },
  },

  // Cloudflare Workers, per the map's locked deploy target. `cloudflare_module` is the preset
  // for the Workers module format that wrangler.jsonc expects.
  nitro: {
    preset: 'cloudflare_module',

    rollupConfig: {
      plugins: [rawMarkdown()],
    },
  },

  // Secrets reach the server from wrangler secrets (deployed) or .env (local). Only
  // `public.betterAuthUrl` is exposed to the client; everything else stays server-side.
  runtimeConfig: {
    betterAuthSecret: '',
    tursoDatabaseUrl: '',
    tursoAuthToken: '',
    public: {
      betterAuthUrl: '',
    },
  },

  // Tailwind v4 is a Vite plugin, not a Nuxt module.
  vite: {
    plugins: [tailwindcss()],
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      title: 'FIA Leadership Lab - Universitas Brawijaya',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Leadership Development Operating System of Fakultas Ilmu Administrasi, Universitas Brawijaya. Empowering students and faculty with precise psychological profiling and actionable developmental pathways.',
        },
      ],
      link: [
        {
          rel: 'icon',
          type: 'image/x-icon',
          href: '/favicon.ico',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
        },
      ],
    },
  },

  googleFonts: {
    families: {
      Inter: [400, 600, 700],
    },
    display: 'swap',
    preload: true,
  },

  typescript: {
    strict: true,
  },

  experimental: {
    payloadExtraction: false,
  },
})
