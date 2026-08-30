<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <section
    class="grid grid-cols-1 lg:grid-cols-2 gap-space-8 items-center min-h-[716px] py-space-12"
    aria-labelledby="hero-heading"
  >
    <div class="flex flex-col gap-space-6">
      <div
        class="inline-flex items-center gap-space-2 bg-surface-container-high text-primary-700 px-space-2 py-space-1 rounded-full font-label-mono text-label-mono w-max"
      >
        <span class="material-symbols-outlined text-sm">science</span>
        <span>{{ t('public.hero.badge') }}</span>
      </div>
      <!-- No `lang` here any more: `useLocaleHead` sets the document language per locale, and a
           hardcoded one would read the Indonesian heading in an English voice. -->
      <h1 id="hero-heading" class="font-display-lg text-display-lg text-ink-900 leading-tight">
        {{ t('public.hero.heading') }}
      </h1>
      <p class="font-body-lg text-body-lg text-body-700 max-w-2xl">
        {{ t('public.hero.lead') }}
      </p>
      <div class="flex flex-col sm:flex-row gap-space-4 pt-space-4">
        <!-- /program and /tentang have no page yet, so both render disabled rather than 404ing. -->
        <PublicPlannedLink
          class="bg-primary-700 text-on-primary px-space-6 h-[48px] rounded hover:bg-primary-500 transition-colors duration-200 font-body-md font-semibold flex items-center justify-center gap-space-2 shadow-sm"
        >
          <span>{{ t('public.hero.explorePrograms') }}</span>
          <span class="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
        </PublicPlannedLink>
        <PublicPlannedLink
          class="border border-border bg-surface text-ink-900 px-space-6 h-[48px] rounded hover:bg-surface-container-low transition-colors duration-200 font-body-md font-semibold flex items-center justify-center shadow-sm"
        >
          {{ t('public.hero.aboutLab') }}
        </PublicPlannedLink>
      </div>
    </div>
    <div
      class="relative h-[400px] lg:h-[500px] rounded-xl overflow-hidden border border-border bg-surface flex items-center justify-center"
    >
      <div
        class="bg-cover bg-center w-full h-full absolute inset-0 mix-blend-multiply opacity-90"
        role="img"
        :aria-label="t('public.hero.imageAlt')"
        style="background-image: url('/hero-image.jpg')"
      />
      <div
        class="absolute bottom-space-6 left-space-6 right-space-6 bg-surface/80 backdrop-blur-md border border-border p-space-4 rounded-lg shadow-sm flex items-center gap-space-4"
      >
        <div
          class="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container"
        >
          <span class="material-symbols-outlined fill" aria-hidden="true">psychology</span>
        </div>
        <div>
          <div class="font-label-mono text-label-mono text-body-700">
            {{ t('public.hero.cardEyebrow') }}
          </div>
          <div class="font-heading-lg text-heading-lg text-ink-900">
            {{ t('public.hero.cardTitle') }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
