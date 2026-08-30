import tailwindcss from '@tailwindcss/vite'

import { rawMarkdown } from './build/raw-markdown'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxtjs/google-fonts', '@nuxtjs/i18n'],

  // Indonesian is the institution's language, so it owns the bare paths and every existing URL
  // keeps working. English is additive under /en. `prefix_except_default` is what gives the
  // public website a distinct, indexable URL per language; a cookie-only switch would not.
  i18n: {
    locales: [
      { code: 'id', language: 'id-ID', name: 'Bahasa Indonesia', file: 'id.json', dir: 'ltr' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json', dir: 'ltr' },
    ],
    defaultLocale: 'id',
    strategy: 'prefix_except_default',
    vueI18n: 'i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'fia_locale',
      // The cookie is a UI preference, not personal data, and it must survive a full page load
      // for SSR to render the right language on first paint.
      cookieSecure: true,
      cookieCrossOrigin: false,
      alwaysRedirect: false,
      fallbackLocale: 'id',
      redirectOn: 'root',
    },
  },

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
      // Title and description are locale-dependent, so they are set in `app/app.vue` rather
      // than frozen here in one language.
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
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
