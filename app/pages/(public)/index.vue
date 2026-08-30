<script setup lang="ts">
definePageMeta({
  layout: 'public',
})

/**
 * No `useHead` here. The home page is the site itself, so `app.vue`'s localized default title and
 * description are the right ones; setting them again would be a second copy to keep in step.
 */
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
