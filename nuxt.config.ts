// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/google-fonts',
  ],

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
          content: 'Leadership Development Operating System of Fakultas Ilmu Administrasi, Universitas Brawijaya. Empowering students and faculty with precise psychological profiling and actionable developmental pathways.',
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

  tailwindcss: {
    configPath: '~/tailwind.config.ts',
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
