<script setup lang="ts">
const assessments = [
  { badge: 'KDPGK', title: 'Instrumen KDPGK', description: 'Instrumen psikometrik untuk mengukur dimensi kepemimpinan dengan validitas dan reliabilitas tinggi.' },
  { badge: '360°', title: 'Feedback 360 Derajat', description: 'Umpan balik komprehensif dari berbagai sudut pandang: diri sendiri, rekan, atasan, dan bawahan.' },
  { badge: 'Potensi', title: 'Asesmen Potensi', description: 'Identifikasi bakat dan potensi kepemimpinan yang belum teroptimalkan.' },
  { badge: 'Gaya', title: 'Gaya Kepemimpinan', description: 'Analisis preferensi gaya kepemimpinan dalam berbagai konteks situasional.' },
]
</script>

<template>
  <section class="section" aria-labelledby="assessment-heading">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="text-center mb-12 lg:mb-16">
        <h2 id="assessment-heading" class="text-display-md lg:text-display-lg font-bold text-ink-900 mb-4">
          Portfolio Asesmen
        </h2>
        <p class="text-body-lg text-body-700 max-w-2xl mx-auto">
          Berbagai instrumen asesmen komprehensif untuk memahami profil kepemimpinan Anda.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <article v-for="(assessment, index) in assessments" :key="index" class="card">
          <div class="flex items-start gap-4">
            <span class="badge badge-primary flex-shrink-0">{{ assessment.badge }}</span>
            <div>
              <h3 class="text-heading-md font-semibold text-ink-900 mb-2">{{ assessment.title }}</h3>
              <p class="text-body-md text-body-700">{{ assessment.description }}</p>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
