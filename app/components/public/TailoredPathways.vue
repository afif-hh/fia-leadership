<script setup lang="ts">
const pathways = [
  {
    icon: 'person',
    title: 'Student Leadership Development',
    description: 'Comprehensive assessments, leadership academy modules, and high-fidelity simulations.',
  },
  {
    icon: 'groups',
    title: 'Faculty Intelligence',
    description: 'Advanced cohort analytics and research tools to monitor and enhance academic leadership growth.',
  },
  {
    icon: 'verified',
    title: 'Institutional Certification',
    description: 'Accredited leadership credentials for organizations seeking to validate administrative excellence.',
  },
]
</script>

<template>
  <section class="flex flex-col gap-space-8 py-space-12" aria-labelledby="pathways-heading">
    <div class="text-center max-w-3xl mx-auto flex flex-col gap-space-2">
      <h2 id="pathways-heading" class="font-display-md text-display-md text-ink-900">Tailored Leadership Pathways</h2>
      <p class="font-body-lg text-body-lg text-body-700">Explore our comprehensive programs designed for students, faculty, and institutional partners.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-6">
      <article
        v-for="(pathway, index) in pathways"
        :key="index"
        class="bg-surface border border-border rounded-lg p-space-6 flex flex-col gap-space-4 hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition-shadow"
      >
        <div class="w-12 h-12 bg-primary-container text-on-primary-container rounded flex items-center justify-center">
          <span class="material-symbols-outlined" aria-hidden="true">{{ pathway.icon }}</span>
        </div>
        <h3 class="font-heading-lg text-heading-lg text-ink-900">{{ pathway.title }}</h3>
        <p class="font-body-md text-body-md text-body-700">{{ pathway.description }}</p>
        <NuxtLink to="/program" class="mt-auto text-primary-500 font-semibold flex items-center gap-space-1 hover:underline">
          Learn More <span class="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
        </NuxtLink>
      </article>
    </div>
  </section>
</template>