<script setup lang="ts">
/**
 * `useLocaleHead` is what sets `<html lang>` and emits the `hreflang` alternates. It lives here
 * rather than per page so no page can ship without them: `nuxt.config.ts` no longer hardcodes
 * `lang: 'en'`, which was wrong on every Indonesian screen and told a screen reader to read
 * Indonesian text with an English voice.
 */
const { t } = useI18n()
const head = useLocaleHead({ lang: true, dir: true, seo: true })

useHead(() => ({
  htmlAttrs: head.value.htmlAttrs,
  link: head.value.link,
  meta: [...(head.value.meta ?? []), { name: 'description', content: t('site.description') }],
  titleTemplate: (title?: string) => (title ? `${title} · ${t('site.name')}` : t('site.title')),
}))
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
