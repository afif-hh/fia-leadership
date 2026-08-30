<script setup lang="ts">
definePageMeta({
  layout: 'public',
})

useHead({
  title: 'FIA Leadership Lab - Universitas Brawijaya',
  meta: [
    {
      name: 'description',
      content:
        'Leadership Development Operating System of Fakultas Ilmu Administrasi, Universitas Brawijaya. Empowering students and faculty with precise psychological profiling and actionable developmental pathways.',
    },
  ],
})
</script>

<template>
  <div>
    <PublicHeroSection />
    <PublicTrustBar />
    <PublicCoreMethodology />
    <PublicMetricsResearch />
    <PublicTailoredPathways />
    <PublicEvidenceInsights />
    <PublicFinalCTA />
  </div>
</template>
