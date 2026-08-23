import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/eslint', '@nuxtjs/google-fonts'],

  // shadcn-vue writes one `index.ts` barrel per component folder (e.g.
  // `ui/button/index.ts`) alongside the `.vue` file it re-exports. Nuxt's default
  // component scan picks up both and registers each under the same inferred name
  // (`UiButton`), which is a NUXT_B3011 warning on every dev/build run. Restricting
  // the `ui/` dir to `.vue` only leaves the barrel files as plain TS imports, which
  // is all they are ever used as (`import { Button } from '@/components/ui/button'`).
  components: {
    dirs: [
      { path: '~/components/ui', extensions: ['vue'] },
      '~/components',
    ],
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
