<script setup lang="ts">
const institutions = [
  { icon: 'school', label: 'Universitas Brawijaya' },
  { icon: 'public', label: 'Global Partners' },
  { icon: 'corporate_fare', label: 'Industry Affiliates' },
]
</script>

<template>
  <section
    class="border-y border-border py-space-6 flex flex-col items-center gap-space-4"
    aria-label="Trusted by institutions"
  >
    <p class="font-label-mono text-label-mono text-outline uppercase tracking-[0.05em]">
      Trusted by Institutions
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
        {{ inst.label }}
      </div>
    </div>
  </section>
</template>
