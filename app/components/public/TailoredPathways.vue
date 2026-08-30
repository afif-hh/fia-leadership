<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

const pathways = [
  { key: 'student', icon: 'person' },
  { key: 'faculty', icon: 'groups' },
  { key: 'certification', icon: 'verified' },
] as const
</script>

<template>
  <section class="flex flex-col gap-space-8 py-space-12" aria-labelledby="pathways-heading">
    <div class="text-center max-w-3xl mx-auto flex flex-col gap-space-2">
      <h2 id="pathways-heading" class="font-display-md text-display-md text-ink-900">
        {{ t('public.pathways.heading') }}
      </h2>
      <p class="font-body-lg text-body-lg text-body-700">{{ t('public.pathways.lead') }}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-6">
      <article
        v-for="pathway in pathways"
        :key="pathway.key"
        class="bg-surface border border-border rounded-lg p-space-6 flex flex-col gap-space-4 hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition-shadow"
      >
        <div
          class="w-12 h-12 bg-primary-container text-on-primary-container rounded flex items-center justify-center"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ pathway.icon }}</span>
        </div>
        <h3 class="font-heading-lg text-heading-lg text-ink-900">
          {{ t(`public.pathways.${pathway.key}.title`) }}
        </h3>
        <p class="font-body-md text-body-md text-body-700">
          {{ t(`public.pathways.${pathway.key}.description`) }}
        </p>
        <NuxtLink
          :to="localePath('/program')"
          class="mt-auto text-primary-500 font-semibold flex items-center gap-space-1 hover:underline"
        >
          {{ t('public.pathways.learnMore') }}
          <span class="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
        </NuxtLink>
      </article>
    </div>
  </section>
</template>
