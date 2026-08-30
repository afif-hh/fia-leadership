<script setup lang="ts">
const steps = [
  {
    icon: 'assignment',
    iconBg: 'bg-primary-container text-on-primary-container',
    title: 'Assess',
    description:
      'Deploy validated psychometric instruments and administrative scenario testing to establish a baseline of leadership potential and cognitive capabilities.',
  },
  {
    icon: 'analytics',
    iconBg: 'bg-surface-container-highest text-ink-900',
    title: 'Understand',
    description:
      'Synthesize raw data into clear, academic profiles. Gain insight into behavioral tendencies, stress responses, and collaborative dynamics.',
  },
  {
    icon: 'trending_up',
    iconBg: 'bg-primary-500 text-on-primary',
    title: 'Develop',
    description:
      'Execute personalized developmental interventions. Utilize structured mentorship and experiential learning aligned with empirical findings.',
  },
]
</script>

<template>
  <section class="flex flex-col gap-space-8 py-space-12" aria-labelledby="methodology-heading">
    <div class="text-center max-w-3xl mx-auto flex flex-col gap-space-2">
      <h2 id="methodology-heading" class="font-display-md text-display-md text-ink-900">
        The Core Methodology
      </h2>
      <p class="font-body-lg text-body-lg text-body-700">
        A systematic approach to identifying and nurturing administrative excellence.
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-space-6">
      <article
        v-for="(step, index) in steps"
        :key="index"
        class="bg-surface border border-border rounded-xl p-space-6 flex flex-col gap-space-4 hover:shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition-shadow"
      >
        <div :class="['w-12 h-12', step.iconBg, 'rounded flex items-center justify-center']">
          <span class="material-symbols-outlined" aria-hidden="true">{{ step.icon }}</span>
        </div>
        <h3 class="font-heading-lg text-heading-lg text-ink-900">{{ step.title }}</h3>
        <p class="font-body-md text-body-md text-body-700">{{ step.description }}</p>
      </article>
    </div>
  </section>
</template>
