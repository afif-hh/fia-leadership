<script setup lang="ts">
</script>

<template>
  <section class="section bg-surface-sunken" aria-labelledby="simulation-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 id="simulation-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
            Simulation Center
          </h2>
          <p class="text-body-lg text-body-700 mb-6">
            Latih kemampuan kepemimpinan Anda dalam lingkungan simulasi yang realistis.
          </p>
          <ul class="space-y-3 mb-8">
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Skenario berbasis kasus nyata
            </li>
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Feedback real-time dari AI coach
            </li>
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Rekaman dan analisis performa
            </li>
          </ul>
          <NuxtLink to="/simulasi" class="btn-primary">Jelajahi Simulasi</NuxtLink>
        </div>

        <div class="bg-surface rounded-xl p-8 shadow-level2 border border-border aspect-video relative overflow-hidden" role="img" aria-label="Ilustrasi simulasi kepemimpinan">
          <div class="absolute inset-0 bg-gradient-to-br from-primary-600/5 to-primary-600/10" />
          <div class="relative z-10 flex flex-col items-center justify-center h-full">
            <div class="w-20 h-20 rounded-full bg-primary-600/10 flex items-center justify-center mb-6">
              <svg class="w-10 h-10 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-heading-sm font-semibold text-ink-900 mb-2">Simulation Center</p>
            <p class="text-body-sm text-muted-500">Interaktif & Berbasis AI</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
