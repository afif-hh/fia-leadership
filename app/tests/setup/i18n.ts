import { config } from '@vue/test-utils'
import { createI18n, useI18n } from 'vue-i18n'

import en from '../../../i18n/locales/en.json'
import id from '../../../i18n/locales/id.json'

/**
 * The `app` project mounts components outside Nuxt, so nothing auto-imports `useI18n` and nothing
 * installs vue-i18n. Without this every component that renders a string throws
 * `useI18n is not defined` — a failure of the harness, not of the component.
 *
 * The **real** message files are loaded rather than a stub, so a component naming a key that does
 * not exist fails here rather than shipping as a raw key on screen.
 *
 * Indonesian is the locale under test because it is the default the application serves; the
 * English file is loaded alongside it so a test can switch and assert both.
 */
const i18n = createI18n({
  legacy: false,
  locale: 'id',
  fallbackLocale: 'id',
  messages: { id, en },
  missingWarn: false,
  fallbackWarn: false,
})

config.global.plugins = [...(config.global.plugins ?? []), i18n]

const globals = globalThis as Record<string, unknown>
globals.useI18n = useI18n
/** Identity: route localisation is Nuxt's job, and these tests mount components, not routes. */
globals.useLocalePath = () => (path: string) => path
globals.useSwitchLocalePath = () => (locale: string) => `/${locale}`
