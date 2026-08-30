<script setup lang="ts">
const { t } = useI18n()

const sidebarLinks = ['methodologyGuide', 'researchDigest', 'ethics'] as const
</script>

<template>
  <section
    class="bg-surface-container-low rounded-xl p-space-8 md:p-space-12 flex flex-col gap-space-8"
    aria-labelledby="insights-heading"
  >
    <div class="flex flex-col md:flex-row justify-between items-end gap-space-4">
      <div class="flex flex-col gap-space-2">
        <h2 id="insights-heading" class="font-display-md text-display-md text-ink-900">
          {{ t('public.insights.heading') }}
        </h2>
        <p class="font-body-lg text-body-lg text-body-700">{{ t('public.insights.lead') }}</p>
      </div>
      <a
        href="#"
        class="text-primary-700 font-semibold hover:underline flex items-center gap-space-1"
      >
        {{ t('public.insights.viewAll') }}
        <span class="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
      </a>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-space-8">
      <div
        class="lg:col-span-2 bg-surface rounded-lg border border-border overflow-hidden flex flex-col md:flex-row"
      >
        <div class="md:w-1/2 bg-surface-container-high flex items-center justify-center p-space-8">
          <span
            class="material-symbols-outlined text-primary-500"
            style="font-size: 64px"
            aria-hidden="true"
            >menu_book</span
          >
        </div>
        <div class="p-space-6 flex flex-col gap-space-4">
          <div class="font-label-mono text-label-mono text-primary-700 uppercase">
            {{ t('public.insights.featuredEyebrow') }}
          </div>
          <h3 class="font-heading-lg text-heading-lg text-ink-900">
            {{ t('public.insights.featuredTitle') }}
          </h3>
          <p class="font-body-md text-body-md text-body-700">
            {{ t('public.insights.featuredBody') }}
          </p>
          <a href="#" class="mt-auto text-primary-500 font-bold hover:underline">{{
            t('public.insights.readFull')
          }}</a>
        </div>
      </div>
      <div class="flex flex-col gap-space-4">
        <a
          v-for="link in sidebarLinks"
          :key="link"
          href="#"
          class="bg-surface p-space-4 rounded-lg border border-border hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <h4 class="font-heading-lg text-body-md font-bold text-ink-900">
            {{ t(`public.insights.${link}.title`) }}
          </h4>
          <p class="text-sm text-body-700 mt-1">{{ t(`public.insights.${link}.description`) }}</p>
        </a>
      </div>
    </div>
  </section>
</template>
