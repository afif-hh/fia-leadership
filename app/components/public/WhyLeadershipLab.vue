<script setup lang="ts">
const valueProps = [
  {
    icon: 'chart',
    title: 'Asesmen Berbasis Bukti',
    description: 'Skor deterministik yang transparan, auditable, dan dapat diverifikasi. Tidak ada subjektivitas, hanya data.',
  },
  {
    icon: 'target',
    title: 'Pengembangan Terpersonalisasi',
    description: 'Profil kepemimpinan longitudinal yang berkembang bersama Anda. Rekomendasi tindak lanjut yang spesifik dan terukur.',
  },
  {
    icon: 'handshake',
    title: 'Simulasi Praktis',
    description: 'Latih kemampuan kepemimpinan dalam skenario nyata. Dari diskusi kelompok hingga pengambilan keputusan strategis.',
  },
]
</script>

<template>
  <section class="section" aria-labelledby="why-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <!-- Section Header -->
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="why-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Mengapa Leadership Lab?
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Pendekatan komprehensif untuk mengembangkan potensi kepemimpinan mahasiswa
          dengan pendekatan data-driven dan evidence-based.
        </p>
      </div>

      <!-- Value Propositions Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article
          v-for="(prop, index) in valueProps"
          :key="index"
          class="card group"
        >
          <div class="icon-wrapper mb-4" aria-hidden="true">
            <svg v-if="prop.icon === 'chart'" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <svg v-else-if="prop.icon === 'target'" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
            </svg>
            <svg v-else-if="prop.icon === 'handshake'" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 class="text-heading-md font-semibold text-ink-900 mb-3">
            {{ prop.title }}
          </h3>
          <p class="text-body-md text-body-700">
            {{ prop.description }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: var(--primary-600/10);
  color: var(--primary-600);
  transition: all var(--transition-fast);
}

.group:hover .icon-wrapper {
  background: var(--primary-600);
  color: var(--on-primary);
  transform: scale(1.05);
}

.icon {
  width: 24px;
  height: 24px;
}
</style>
