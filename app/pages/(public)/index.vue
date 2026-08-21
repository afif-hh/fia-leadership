<script setup lang="ts">
definePageMeta({
  layout: 'public',
})

useHead({
  title: 'FIA Leadership Lab - Platform Asesmen Kepemimpinan',
  meta: [
    {
      name: 'description',
      content: 'Platform asesmen kepemimpinan untuk Fakultas Ilmu Administrasi, Universitas Brawijaya. Assess. Develop. Simulate. Lead.',
    },
  ],
})
</script>

<template>
  <div>
    <PublicHeroSection />
    <PublicWhyLeadershipLab />
    <PublicLeadershipJourney />
    <PublicAssessmentPortfolio />
    <PublicLeadershipIntelligence />
    <PublicAcademyModules />
    <PublicSimulationCenter />
    <PublicResearchPublication />
    <PublicPartners />
    <PublicNewsEvents />
  </div>
</template>
