<script setup lang="ts">
const dimensions = [
  { name: 'Inspirational', score: 85 },
  { name: 'Integrity', score: 92 },
  { name: 'Sense of Purpose', score: 78 },
  { name: 'Participative', score: 88 },
  { name: 'Autonomy', score: 75 },
  { name: 'Accountability', score: 90 },
]
</script>

<template>
  <section class="section bg-surface-sunken" aria-labelledby="intelligence-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 id="intelligence-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
            Leadership Intelligence
          </h2>
          <p class="text-body-lg text-body-700 mb-6">
            Visualisasi data komprehensif dari profil kepemimpinan Anda.
          </p>
          <ul class="space-y-3 mb-8">
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Skor deterministik berbasis data
            </li>
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Benchmarking dengan cohort
            </li>
            <li class="flex items-center gap-3 text-body-md text-body-700">
              <span class="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true" />
              Rekomendasi pengembangan personal
            </li>
          </ul>
          <NuxtLink to="/asesmen" class="btn-primary">Mulai Asesmen</NuxtLink>
        </div>

        <div class="relative">
          <div class="radar-chart-container" role="img" aria-label="Contoh radar chart menampilkan skor kepemimpinan di berbagai dimensi">
            <div class="radar-chart">
              <div class="radar-ring radar-ring-outer" />
              <div class="radar-ring radar-ring-middle" />
              <div class="radar-ring radar-ring-inner" />
              <div class="radar-ring radar-ring-center" />
              <div class="radar-axis radar-axis-1" />
              <div class="radar-axis radar-axis-2" />
              <div class="radar-axis radar-axis-3" />
              <div class="radar-label radar-label-1">Inspirational</div>
              <div class="radar-label radar-label-2">Integrity</div>
              <div class="radar-label radar-label-3">Purpose</div>
              <div class="radar-label radar-label-4">Participative</div>
              <div class="radar-label radar-label-5">Autonomy</div>
              <div class="radar-label radar-label-6">Accountability</div>
            </div>
          </div>

          <div class="mt-6">
            <h3 class="text-heading-sm font-semibold text-ink-900 mb-3">Tabel Skor Dimensi</h3>
            <div class="bg-surface rounded-lg border border-border overflow-hidden">
              <table class="w-full">
                <thead>
                  <tr class="bg-surface-sunken">
                    <th class="text-left text-body-sm font-semibold text-ink-900 px-4 py-2">Dimensi</th>
                    <th class="text-right text-body-sm font-semibold text-ink-900 px-4 py-2">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(dim, index) in dimensions" :key="index" class="border-t border-border hover:bg-surface-sunken/50 transition-colors">
                    <td class="text-body-sm text-body-700 px-4 py-3">{{ dim.name }}</td>
                    <td class="text-right text-body-sm font-semibold text-primary-600 px-4 py-3">{{ dim.score }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.radar-chart-container {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  box-shadow: var(--shadow-level2);
  border: 1px solid var(--border);
}

.radar-chart {
  position: relative;
  width: 100%;
  max-width: 20rem;
  aspect-ratio: 1;
  margin: 0 auto;
}

.radar-ring {
  position: absolute;
  border-radius: var(--radius-full);
  border: 2px solid var(--border);
}

.radar-ring-outer {
  inset: 0;
}

.radar-ring-middle {
  inset: 1rem;
}

.radar-ring-inner {
  inset: 2rem;
}

.radar-ring-center {
  inset: 3rem;
  background: var(--primary-600/20);
}

.radar-axis {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
  transform-origin: center;
}

.radar-axis-1 {
  transform: translateY(-50%) rotate(0deg);
}

.radar-axis-2 {
  transform: translateY(-50%) rotate(60deg);
}

.radar-axis-3 {
  transform: translateY(-50%) rotate(120deg);
}

.radar-label {
  position: absolute;
  font-size: var(--text-caption);
  color: var(--muted-500);
  white-space: nowrap;
}

.radar-label-1 {
  top: -1.5rem;
  left: 50%;
  transform: translateX(-50%);
}

.radar-label-2 {
  top: 15%;
  right: -4rem;
}

.radar-label-3 {
  bottom: 15%;
  right: -3rem;
}

.radar-label-4 {
  bottom: -1.5rem;
  left: 50%;
  transform: translateX(-50%);
}

.radar-label-5 {
  bottom: 15%;
  left: -4rem;
}

.radar-label-6 {
  top: 15%;
  left: -3rem;
}
</style>
