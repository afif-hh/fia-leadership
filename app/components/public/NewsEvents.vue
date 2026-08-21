<script setup lang="ts">
const news = [
  { date: '15 Agustus 2024', title: 'Workshop Kepemimpinan untuk Mahasiswa Baru', excerpt: 'Pelatihan intensif 3 hari untuk 200 mahasiswa baru FIA UB tentang fondasi kepemimpinan.' },
  { date: '10 Agustus 2024', title: 'Penelitian Baru: Kepemimpinan Digital', excerpt: 'Tim riset FIA Leadership Lab menerbitkan paper tentang adaptasi gaya kepemimpinan di era digital.' },
  { date: '5 Agustus 2024', title: 'Kerjasama dengan ITB', excerpt: 'MoU ditandatangani untuk pengembangan bersama instrumen asesmen kepemimpinan nasional.' },
]
</script>

<template>
  <section class="section" aria-labelledby="news-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="news-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Berita & Kegiatan
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Informasi terkini tentang kegiatan dan pencapaian FIA Leadership Lab.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article v-for="(item, index) in news" :key="index" class="card group news-card">
          <time class="news-date">{{ item.date }}</time>
          <h3 class="text-heading-md font-semibold text-ink-900 mb-3 group-hover:text-primary-600 transition-colors">
            {{ item.title }}
          </h3>
          <p class="text-body-md text-body-700 mb-4">{{ item.excerpt }}</p>
          <NuxtLink :to="`/berita/${index + 1}`" class="news-link">
            <span>Baca Selengkapnya</span>
            <svg class="arrow-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </NuxtLink>
        </article>
      </div>
      <div class="text-center mt-12">
        <NuxtLink to="/berita" class="btn-secondary">Lihat Semua Berita</NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.news-card {
  display: flex;
  flex-direction: column;
}

.news-date {
  font-size: var(--text-caption);
  color: var(--muted-500);
  margin-bottom: var(--space-2);
}

.news-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-body-sm);
  font-weight: var(--font-semibold);
  color: var(--primary-600);
  transition: all var(--transition-fast);
  margin-top: auto;
}

.news-link:hover {
  color: var(--primary-700);
  gap: var(--space-3);
}

.arrow-icon {
  width: 16px;
  height: 16px;
  transition: transform var(--transition-fast);
}

.news-link:hover .arrow-icon {
  transform: translateX(2px);
}
</style>
