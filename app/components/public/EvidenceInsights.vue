<script setup lang="ts">
const sidebarLinks = [
  {
    title: 'Leadership Methodology Guide v2.0',
    description: 'Standardized protocols for psychometric evaluation.',
  },
  {
    title: 'Annual Research Digest 2023',
    description: 'Aggregated findings from over 500 student assessments.',
  },
  {
    title: 'Ethics in Data-Driven Profiling',
    description: 'Whitepaper on privacy and transparency in leadership labs.',
  },
]
</script>

<template>
  <section class="bg-surface-container-low rounded-xl p-space-8 md:p-space-12 flex flex-col gap-space-8" aria-labelledby="insights-heading">
    <div class="flex flex-col md:flex-row justify-between items-end gap-space-4">
      <div class="flex flex-col gap-space-2">
        <h2 id="insights-heading" class="font-display-md text-display-md text-ink-900">Evidence-Based Insights</h2>
        <p class="font-body-lg text-body-lg text-body-700">Latest research and methodology guides from the FIA Leadership Lab.</p>
      </div>
      <a href="#" class="text-primary-700 font-semibold hover:underline flex items-center gap-space-1">
        View All Resources <span class="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
      </a>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-space-8">
      <div class="lg:col-span-2 bg-surface rounded-lg border border-border overflow-hidden flex flex-col md:flex-row">
        <div class="md:w-1/2 bg-surface-container-high flex items-center justify-center p-space-8">
          <span class="material-symbols-outlined text-primary-500" style="font-size: 64px;" aria-hidden="true">menu_book</span>
        </div>
        <div class="p-space-6 flex flex-col gap-space-4">
          <div class="font-label-mono text-label-mono text-primary-700 uppercase">Featured Publication</div>
          <h3 class="font-heading-lg text-heading-lg text-ink-900">The Future of Administrative Leadership in Higher Education</h3>
          <p class="font-body-md text-body-md text-body-700">A comprehensive study on data-intelligent assessment frameworks for 21st-century academic institutions.</p>
          <a href="#" class="mt-auto text-primary-500 font-bold hover:underline">Read Full Article</a>
        </div>
      </div>
      <div class="flex flex-col gap-space-4">
        <a
          v-for="(link, index) in sidebarLinks"
          :key="index"
          href="#"
          class="bg-surface p-space-4 rounded-lg border border-border hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <h4 class="font-heading-lg text-body-md font-bold text-ink-900">{{ link.title }}</h4>
          <p class="text-sm text-body-700 mt-1">{{ link.description }}</p>
        </a>
      </div>
    </div>
  </section>
</template>