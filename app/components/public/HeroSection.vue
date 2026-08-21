<script setup lang="ts">
</script>

<template>
  <section class="section hero-section" aria-labelledby="hero-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="max-w-4xl mx-auto text-center">
        <!-- Hero Headline -->
        <h1 id="hero-heading" class="text-display-lg lg:text-display-xl font-bold text-ink-900 mb-6 hero-headline">
          <span lang="en" class="block">BUILD THE LEADER</span>
          <span lang="en" class="block text-primary-600">BEFORE THE LEADER</span>
        </h1>

        <!-- Subheadline -->
        <p class="text-body-lg lg:text-body-xl text-body-700 mb-8 max-w-2xl mx-auto">
          <span lang="en">Assess. Develop. Simulate. Lead.</span>
        </p>

        <!-- Description -->
        <p class="text-body-md text-muted-500 mb-10 max-w-xl mx-auto">
          Platform asesmen kepemimpinan untuk Fakultas Ilmu Administrasi,
          Universitas Brawijaya. Temukan potensi kepemimpinan Anda.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <NuxtLink
            to="/asesmen"
            class="btn-primary text-lg px-8 py-4 cta-button"
          >
            Mulai Asesmen
          </NuxtLink>
          <NuxtLink
            to="/tentang"
            class="btn-secondary text-lg px-8 py-4"
          >
            Pelajari Lebih Lanjut
          </NuxtLink>
        </div>

        <!-- Stats Preview -->
        <div class="mt-16 stats-grid">
          <div class="stat-item">
            <div class="stat-value">500+</div>
            <div class="stat-label">Mahasiswa Terfasilitasi</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">50+</div>
            <div class="stat-label">Dosen & Coach</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">8</div>
            <div class="stat-label">Modul Pembelajaran</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">6</div>
            <div class="stat-label">Fase Pengembangan</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Decorative Background -->
    <div class="absolute inset-0 -z-10 overflow-hidden">
      <div class="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
      <div class="absolute bottom-0 left-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  position: relative;
  background: var(--surface);
}

.hero-headline {
  letter-spacing: -0.03em;
}

.cta-button {
  position: relative;
  overflow: hidden;
}

.cta-button::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%);
  transform: translateX(-100%);
  transition: transform 0.6s ease;
}

.cta-button:hover::after {
  transform: translateX(100%);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-6);
  max-width: 600px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-item {
  position: relative;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface-sunken);
  transition: all var(--transition-fast);
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-level2);
}

.stat-value {
  font-size: var(--text-data-value);
  font-weight: var(--font-bold);
  color: var(--primary-600);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-1);
}

.stat-label {
  font-size: var(--text-body-sm);
  color: var(--muted-500);
  line-height: var(--leading-normal);
}
</style>
