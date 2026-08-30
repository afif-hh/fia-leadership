<script setup lang="ts">
/**
 * The step titles (Assess, Understand, Develop) are the PRD's own cycle vocabulary and stay
 * untranslated by design — the Indonesian message file repeats them verbatim so the terms remain
 * the same words a student meets in the instrument and the reports.
 */
const { t } = useI18n()

const steps = [
  { key: 'assess', icon: 'assignment', iconBg: 'bg-primary-container text-on-primary-container' },
  { key: 'understand', icon: 'analytics', iconBg: 'bg-surface-container-highest text-ink-900' },
  { key: 'develop', icon: 'trending_up', iconBg: 'bg-primary-500 text-on-primary' },
] as const
</script>

<template>
  <section class="flex flex-col gap-space-8 py-space-12" aria-labelledby="methodology-heading">
    <div class="text-center max-w-3xl mx-auto flex flex-col gap-space-2">
      <h2 id="methodology-heading" class="font-display-md text-display-md text-ink-900">
        {{ t('public.methodology.heading') }}
      </h2>
      <p class="font-body-lg text-body-lg text-body-700">{{ t('public.methodology.lead') }}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-6">
      <article
        v-for="step in steps"
        :key="step.key"
        class="bg-surface border border-border rounded-xl p-space-6 flex flex-col gap-space-4 hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition-shadow"
      >
        <div :class="['w-12 h-12', step.iconBg, 'rounded flex items-center justify-center']">
          <span class="material-symbols-outlined" aria-hidden="true">{{ step.icon }}</span>
        </div>
        <h3 class="font-heading-lg text-heading-lg text-ink-900">
          {{ t(`public.methodology.${step.key}.title`) }}
        </h3>
        <p class="font-body-md text-body-md text-body-700">
          {{ t(`public.methodology.${step.key}.description`) }}
        </p>
      </article>
    </div>
  </section>
</template>
