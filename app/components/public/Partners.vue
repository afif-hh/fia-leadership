<script setup lang="ts">
const partners = [
  { name: 'Universitas Brawijaya', abbr: 'UB' },
  { name: 'Fakultas Ilmu Administrasi', abbr: 'FIA' },
  { name: 'Institut Teknologi Bandung', abbr: 'ITB' },
  { name: 'Universitas Indonesia', abbr: 'UI' },
  { name: 'Universitas Gadjah Mada', abbr: 'UGM' },
  { name: 'Institut Pertanian Bogor', abbr: 'IPB' },
]
</script>

<template>
  <section class="section bg-surface-sunken" aria-labelledby="partners-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="partners-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Mitra Kami
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Berkolaborasi dengan institusi pendidikan terkemuka untuk pengembangan kepemimpinan mahasiswa.
        </p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div v-for="(partner, index) in partners" :key="index" class="partner-card">
          <div class="partner-abbr">{{ partner.abbr }}</div>
          <div class="partner-name">{{ partner.name }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.partner-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-level1);
  border: 1px solid var(--border);
  transition: all var(--transition-fast);
  cursor: default;
}

.partner-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-level2);
  border-color: var(--primary-600/30);
}

.partner-abbr {
  font-size: var(--text-heading-lg);
  font-weight: var(--font-bold);
  color: var(--primary-600);
  margin-bottom: var(--space-2);
  transition: color var(--transition-fast);
}

.partner-card:hover .partner-abbr {
  color: var(--primary-700);
}

.partner-name {
  font-size: var(--text-caption);
  color: var(--muted-500);
  text-align: center;
  line-height: var(--leading-normal);
}
</style>
