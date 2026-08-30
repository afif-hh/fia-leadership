<script setup lang="ts">
const { t } = useI18n()

const metrics = [
  { key: 'completionRate', value: '85%' },
  { key: 'developmentActivation', value: '70%' },
  { key: 'profileComprehension', value: '85%' },
] as const

const audiences = ['forStudents', 'forFaculty'] as const
</script>

<template>
  <section
    class="grid grid-cols-1 lg:grid-cols-12 gap-space-8 py-space-12"
    aria-labelledby="metrics-heading"
  >
    <div
      class="lg:col-span-5 bg-on-surface text-surface-container-lowest rounded-xl p-space-8 flex flex-col gap-space-8 justify-center"
    >
      <h3 id="metrics-heading" class="font-display-md text-display-md">
        {{ t('public.metrics.heading') }}
      </h3>
      <div class="flex flex-col gap-space-6">
        <div
          v-for="metric in metrics"
          :key="metric.key"
          class="flex justify-between items-center border-b border-outline pb-space-2"
        >
          <span class="font-body-lg text-body-lg text-surface-variant">{{
            t(`public.metrics.${metric.key}`)
          }}</span>
          <span class="font-display-md text-display-md text-primary-fixed-dim">{{
            metric.value
          }}</span>
        </div>
      </div>
    </div>
    <div
      class="lg:col-span-7 bg-surface border border-border rounded-xl p-space-8 flex flex-col gap-space-6 justify-center"
    >
      <div
        class="inline-flex items-center gap-space-2 text-primary-700 font-label-mono text-label-mono"
      >
        <span class="material-symbols-outlined text-sm" aria-hidden="true">menu_book</span>
        <span>{{ t('public.metrics.eyebrow') }}</span>
      </div>
      <h3 class="font-display-md text-display-md text-ink-900">
        {{ t('public.metrics.approachHeading') }}
      </h3>
      <p class="font-body-lg text-body-lg text-body-700">
        {{ t('public.metrics.approachBody') }}
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-4 pt-space-4">
        <div v-for="aud in audiences" :key="aud" class="flex gap-space-2">
          <span class="material-symbols-outlined text-primary-500 mt-1" aria-hidden="true"
            >check_circle</span
          >
          <div>
            <h4 class="font-heading-lg text-body-lg text-ink-900 font-semibold">
              {{ t(`public.metrics.${aud}.title`) }}
            </h4>
            <p class="font-body-md text-body-md text-body-700">
              {{ t(`public.metrics.${aud}.description`) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
