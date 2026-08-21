<script setup lang="ts">
const phases = [
  { number: '01', title: 'Assess', description: 'Identifikasi profil kepemimpinan Anda melalui instrumen psikometrik terversi.' },
  { number: '02', title: 'Understand', description: 'Pahami kekuatan dan area pengembangan Anda berdasarkan data komprehensif.' },
  { number: '03', title: 'Learn', description: 'Akses modul pembelajaran yang direkomendasikan sesuai profil Anda.' },
  { number: '04', title: 'Simulate', description: 'Latih kemampuan dalam skenario simulasi kepemimpinan interaktif.' },
  { number: '05', title: 'Develop', description: 'Buat rencana pengembangan personal dengan target yang terukur.' },
  { number: '06', title: 'Lead', description: 'Terapkan pembelajaran dalam peran kepemimpinan nyata di kampus dan masyarakat.' },
]
</script>

<template>
  <section class="section bg-surface-sunken" aria-labelledby="journey-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="journey-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Perjalanan Kepemimpinan
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Enam fase komprehensif untuk mengembangkan potensi kepemimpinan Anda.
        </p>
      </div>

      <!-- Mobile: Vertical Timeline -->
      <div class="lg:hidden space-y-8">
        <article v-for="(phase, index) in phases" :key="index" class="timeline-item">
          <div v-if="index < phases.length - 1" class="timeline-line" aria-hidden="true" />
          <div class="timeline-marker" aria-hidden="true">
            {{ phase.number }}
          </div>
          <div class="timeline-content">
            <h3 class="text-heading-md font-semibold text-ink-900 mb-2">{{ phase.title }}</h3>
            <p class="text-body-md text-body-700">{{ phase.description }}</p>
          </div>
        </article>
      </div>

      <!-- Desktop: Horizontal Timeline -->
      <div class="hidden lg:block">
        <div class="relative">
          <div class="absolute top-5 left-0 right-0 h-0.5 bg-border" aria-hidden="true" />
          <div class="grid grid-cols-6 gap-4">
            <article v-for="(phase, index) in phases" :key="index" class="relative text-center group">
              <div class="relative z-10 w-10 h-10 rounded-full bg-primary-600 text-on-primary flex items-center justify-center text-body-sm font-bold mx-auto mb-4 transition-transform group-hover:scale-110" aria-hidden="true">
                {{ phase.number }}
              </div>
              <div class="timeline-card">
                <h3 class="text-heading-sm font-semibold text-ink-900 mb-2">{{ phase.title }}</h3>
                <p class="text-body-sm text-body-700">{{ phase.description }}</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Mobile Timeline */
.timeline-item {
  position: relative;
  padding-left: 3rem;
}

.timeline-line {
  position: absolute;
  left: 1.25rem;
  top: 2.5rem;
  bottom: 0;
  width: 2px;
  background: var(--border);
}

.timeline-marker {
  position: absolute;
  left: 0;
  top: 0.25rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--primary-600);
  color: var(--on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-body-sm);
  font-weight: var(--font-bold);
}

.timeline-content {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-level1);
}

/* Desktop Timeline */
.timeline-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-level1);
  transition: all var(--transition-fast);
}

.group:hover .timeline-card {
  box-shadow: var(--shadow-level2);
  transform: translateY(-2px);
}
</style>
