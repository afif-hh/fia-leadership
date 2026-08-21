<script setup lang="ts">
const publications = [
  { type: 'Jurnal', title: 'Analisis Gaya Kepemimpinan Transformatif pada Mahasiswa Universitas Brawijaya', authors: 'Dr. Ahmad Fauzi, et al.', year: '2024' },
  { type: 'Konferensi', title: 'Development of Leadership Assessment Instrument for Indonesian Higher Education', authors: 'Dr. Budi Santoso, et al.', year: '2024' },
]
</script>

<template>
  <section class="section" aria-labelledby="research-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="research-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Research & Publication
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Kontribusi ilmiah dalam pengembangan instrumen dan metodologi asesmen kepemimpinan.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <article v-for="(pub, index) in publications" :key="index" class="card publication-card">
          <div class="flex items-start gap-4">
            <span class="badge flex-shrink-0" :class="pub.type === 'Jurnal' ? 'badge-primary' : 'badge-success'">{{ pub.type }}</span>
            <div class="flex-1">
              <h3 class="text-heading-md font-semibold text-ink-900 mb-2">{{ pub.title }}</h3>
              <p class="text-body-sm text-muted-500 mb-1">{{ pub.authors }}</p>
              <p class="text-caption text-muted-500">{{ pub.year }}</p>
            </div>
          </div>
        </article>
      </div>
      <div class="text-center mt-12">
        <NuxtLink to="/penelitian" class="btn-secondary">Lihat Semua Publikasi</NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.publication-card {
  position: relative;
  overflow: hidden;
}

.publication-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--primary-600);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.publication-card:hover::before {
  opacity: 1;
}
</style>
