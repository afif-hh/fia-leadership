<script setup lang="ts">
const { t } = useI18n()

const institutions = [
  { icon: 'school', key: 'ub' },
  { icon: 'public', key: 'globalPartners' },
  { icon: 'corporate_fare', key: 'industryAffiliates' },
] as const
</script>

<template>
  <section
    class="border-y border-border py-space-6 flex flex-col items-center gap-space-4"
    :aria-label="t('public.trustBar.regionLabel')"
  >
    <p class="font-label-mono text-label-mono text-outline uppercase tracking-[0.05em]">
      {{ t('public.trustBar.heading') }}
    </p>
    <div class="flex flex-wrap justify-center gap-space-12 opacity-70 grayscale">
      <div
        v-for="inst in institutions"
        :key="inst.icon"
        class="flex items-center gap-space-2 font-heading-lg text-ink-900 font-bold"
      >
        <span class="material-symbols-outlined text-[32px]" aria-hidden="true">{{
          inst.icon
        }}</span>
        {{ t(`public.trustBar.${inst.key}`) }}
      </div>
    </div>
  </section>
</template>
