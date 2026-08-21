<script setup lang="ts">
const modules = [
  { title: 'Komunikasi Efektif', description: 'Teknik komunikasi persuasif dan aktif dalam konteks kepemimpinan.' },
  { title: 'Pengambilan Keputusan', description: 'Framework analisis dan pengambilan keputusan strategis.' },
  { title: 'Manajemen Konflik', description: 'Strategi resolusi konflik dan negosiasi konstruktif.' },
  { title: 'Emotional Intelligence', description: 'Pengelolaan emosi diri dan empati dalam kepemimpinan.' },
  { title: 'Team Building', description: 'Membangun dan memimpin tim yang efektif dan kolaboratif.' },
  { title: 'Strategic Thinking', description: 'Berpikir strategis dan perencanaan jangka panjang.' },
  { title: 'Change Management', description: 'Mengelola perubahan dan transformasi organisasi.' },
  { title: 'Ethical Leadership', description: 'Kepemimpinan beretika dan tanggung jawab sosial.' },
]
</script>

<template>
  <section class="section" aria-labelledby="academy-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="academy-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Academy
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Delapan modul pembelajaran komprehensif untuk mengembangkan kompetensi kepemimpinan Anda.
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <article v-for="(module, index) in modules" :key="index" class="card group module-card">
          <div class="module-number" aria-hidden="true">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <h3 class="text-heading-sm font-semibold text-ink-900 mb-2">{{ module.title }}</h3>
          <p class="text-body-sm text-body-700">{{ module.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.module-card {
  position: relative;
  overflow: hidden;
}

.module-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: var(--primary-600/10);
  color: var(--primary-600);
  font-size: var(--text-heading-md);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-4);
  transition: all var(--transition-fast);
}

.group:hover .module-number {
  background: var(--primary-600);
  color: var(--on-primary);
  transform: scale(1.05);
}
</style>
