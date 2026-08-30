<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <section
    class="bg-primary-container text-on-primary-container rounded-xl p-space-12 text-center flex flex-col items-center gap-space-6 my-space-12"
  >
    <h2 class="font-display-md text-display-md text-on-primary max-w-2xl">
      {{ t('public.finalCta.heading') }}
    </h2>
    <p class="font-body-lg text-body-lg text-primary-fixed max-w-xl">
      {{ t('public.finalCta.body') }}
    </p>
    <NuxtLink
      :to="localePath('/asesmen')"
      class="mt-space-4 bg-surface text-primary-700 px-space-8 h-[48px] rounded hover:bg-surface-container-high transition-colors duration-200 font-body-md font-bold shadow-sm flex items-center justify-center"
    >
      {{ t('public.finalCta.action') }}
    </NuxtLink>
  </section>
</template>
