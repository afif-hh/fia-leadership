<script setup lang="ts">
const isMobileMenuOpen = ref(false)

const navLinks = [
  { label: 'Beranda', href: '/' },
  { label: 'Tentang', href: '/tentang' },
  { label: 'Program', href: '/program' },
  { label: 'Penelitian', href: '/penelitian' },
  { label: 'Kegiatan', href: '/kegiatan' },
  { label: 'Knowledge Center', href: '/knowledge-center' },
  { label: 'Mitra', href: '/mitra' },
  { label: 'Kontak', href: '/kontak' },
]

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Skip to Content Link -->
    <a href="#main-content" class="skip-to-content">
      Lewati ke konten utama
    </a>

    <!-- Header -->
    <header class="sticky top-0 z-50 bg-surface border-b border-border shadow-level1">
      <nav aria-label="Navigasi utama" class="container mx-auto px-4 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2 text-ink-900 font-bold text-heading-md">
            <span aria-hidden="true" class="text-primary-600">FIA</span>
            <span>Leadership Lab</span>
          </NuxtLink>

          <!-- Desktop Navigation -->
          <div class="hidden lg:flex items-center gap-6">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.href"
              :to="link.href"
              class="text-body-md font-semibold text-body-700 hover:text-primary-600 transition-colors"
            >
              {{ link.label }}
            </NuxtLink>
          </div>

          <!-- Desktop Actions -->
          <div class="hidden lg:flex items-center gap-4">
            <UiThemeToggle />
            <NuxtLink
              to="/asesmen"
              class="btn-primary"
            >
              Mulai Asesmen
            </NuxtLink>
          </div>

          <!-- Mobile Menu Button -->
          <button
            class="lg:hidden p-2 rounded-md text-body-700 hover:bg-surface-sunken"
            :aria-expanded="isMobileMenuOpen"
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
            @click="toggleMobileMenu"
          >
            <svg
              v-if="!isMobileMenuOpen"
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <svg
              v-else
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Mobile Menu -->
        <div
          v-if="isMobileMenuOpen"
          id="mobile-menu"
          class="lg:hidden border-t border-border py-4"
        >
          <div class="flex flex-col gap-4">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.href"
              :to="link.href"
              class="text-body-md font-semibold text-body-700 hover:text-primary-600 py-2"
              @click="closeMobileMenu"
            >
              {{ link.label }}
            </NuxtLink>
            <div class="flex items-center gap-4 mt-4 pt-4 border-t border-border">
              <UiThemeToggle />
              <NuxtLink
                to="/asesmen"
                class="btn-primary flex-1"
                @click="closeMobileMenu"
              >
                Mulai Asesmen
              </NuxtLink>
            </div>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main Content -->
    <main id="main-content" class="flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-surface-sunken border-t border-border">
      <div class="container mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <!-- Brand -->
          <div class="lg:col-span-2">
            <h2 class="text-heading-md font-bold text-ink-900 mb-4">
              FIA Leadership Lab
            </h2>
            <p class="text-body-md text-body-700 mb-4 max-w-md">
              Platform asesmen kepemimpinan untuk Fakultas Ilmu Administrasi,
              Universitas Brawijaya. Assess. Develop. Simulate. Lead.
            </p>
            <div class="flex gap-4">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-500 hover:text-primary-600 transition-colors"
                aria-label="Twitter"
              >
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-500 hover:text-primary-600 transition-colors"
                aria-label="LinkedIn"
              >
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                class="text-muted-500 hover:text-primary-600 transition-colors"
                aria-label="Instagram"
              >
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
            </div>
          </div>

          <!-- Quick Links -->
          <div>
            <h3 class="text-heading-sm font-semibold text-ink-900 mb-4">
              Tautan Cepat
            </h3>
            <ul class="space-y-2">
              <li>
                <NuxtLink to="/tentang" class="text-body-sm text-body-700 hover:text-primary-600 transition-colors">
                  Tentang Kami
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/program" class="text-body-sm text-body-700 hover:text-primary-600 transition-colors">
                  Program
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/penelitian" class="text-body-sm text-body-700 hover:text-primary-600 transition-colors">
                  Penelitian
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/knowledge-center" class="text-body-sm text-body-700 hover:text-primary-600 transition-colors">
                  Knowledge Center
                </NuxtLink>
              </li>
            </ul>
          </div>

          <!-- Contact -->
          <div>
            <h3 class="text-heading-sm font-semibold text-ink-900 mb-4">
              Hubungi Kami
            </h3>
            <ul class="space-y-2">
              <li class="text-body-sm text-body-700">
                Fakultas Ilmu Administrasi
              </li>
              <li class="text-body-sm text-body-700">
                Universitas Brawijaya
              </li>
              <li class="text-body-sm text-body-700">
                Jl. Veteran No. 1, Malang 65145
              </li>
              <li>
                <a href="mailto:leadership@ub.ac.id" class="text-body-sm text-primary-600 hover:text-primary-700 transition-colors">
                  leadership@ub.ac.id
                </a>
              </li>
            </ul>
          </div>
        </div>

        <!-- Bottom Bar -->
        <div class="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p class="text-caption text-muted-500">
            &copy; {{ new Date().getFullYear() }} FIA Leadership Lab. All rights reserved.
          </p>
          <div class="flex gap-6">
            <NuxtLink to="/privacy" class="text-caption text-muted-500 hover:text-primary-600 transition-colors">
              Kebijakan Privasi
            </NuxtLink>
            <NuxtLink to="/accessibility" class="text-caption text-muted-500 hover:text-primary-600 transition-colors">
              Pernyataan Aksesibilitas
            </NuxtLink>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.skip-to-content {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--primary-600);
  color: var(--on-primary);
  padding: var(--space-2) var(--space-4);
  z-index: 100;
  text-decoration: none;
  font-weight: var(--font-semibold);
  border-radius: 0 0 var(--radius-md) 0;
  transition: top var(--transition-fast);
}

.skip-to-content:focus {
  top: 0;
}
</style>
