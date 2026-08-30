<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

const navLinks = [
  { key: 'knowledgeCenter', href: '/knowledge-center' },
  { key: 'programs', href: '/program' },
  { key: 'research', href: '/penelitian' },
] as const
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Skip to Content Link -->
    <a href="#main-content" class="skip-to-content">
      {{ t('common.skipToContent') }}
    </a>

    <!-- Header -->
    <nav
      class="bg-surface-container-lowest font-body-md text-body-md fixed top-0 w-full z-50 border-b border-border"
    >
      <div class="flex justify-between items-center h-16 max-w-7xl mx-auto px-margin-page">
        <!-- Logo -->
        <NuxtLink
          :to="localePath('/')"
          class="font-display-md text-display-md font-bold text-primary-700 flex items-center gap-space-2"
        >
          <span class="material-symbols-outlined fill text-primary-500" style="font-size: 32px"
            >account_balance</span
          >
          <span>{{ t('nav.brand') }}</span>
        </NuxtLink>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex items-center gap-space-6">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.href"
            :to="localePath(link.href)"
            class="text-body-700 hover:text-primary-700 transition-colors duration-200"
          >
            {{ t(`nav.${link.key}`) }}
          </NuxtLink>
        </div>

        <!-- Desktop Actions -->
        <div class="flex items-center gap-space-2">
          <LanguageSwitcher />
          <NuxtLink
            :to="localePath('/asesmen')"
            class="bg-primary-700 text-on-primary px-space-4 h-[40px] rounded hover:bg-primary-500 transition-colors duration-200 font-label-mono text-label-mono flex items-center justify-center cursor-pointer active:opacity-80 transition-opacity"
          >
            {{ t('nav.portalLogin') }}
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main
      id="main-content"
      class="flex-grow pt-[80px] pb-space-12 flex flex-col gap-space-12 max-w-7xl mx-auto w-full px-margin-page"
    >
      <slot />
    </main>

    <!-- Footer -->
    <footer
      class="bg-on-secondary-fixed text-surface-container-lowest font-body-md text-body-md w-full py-space-12 mt-auto"
    >
      <div
        class="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto px-margin-page space-y-space-6 md:space-y-0"
      >
        <div class="flex flex-col items-center md:items-start gap-space-2">
          <span class="font-heading-lg text-heading-lg text-surface-container-lowest">{{
            t('nav.brand')
          }}</span>
          <span class="text-surface-container-high text-sm">{{
            t('footer.copyright', { year: new Date().getFullYear() })
          }}</span>
        </div>
        <div class="flex flex-wrap justify-center gap-space-6">
          <NuxtLink
            :to="localePath('/kontak')"
            class="text-surface-container-high hover:text-primary-fixed-dim hover:underline transition-all cursor-pointer"
            >{{ t('footer.contact') }}</NuxtLink
          >
          <NuxtLink
            :to="localePath('/privacy')"
            class="text-surface-container-high hover:text-primary-fixed-dim hover:underline transition-all cursor-pointer"
            >{{ t('footer.privacy') }}</NuxtLink
          >
          <a
            href="https://admin.ub.ac.id"
            target="_blank"
            rel="noopener noreferrer"
            class="text-surface-container-high hover:text-primary-fixed-dim hover:underline transition-all cursor-pointer"
            >{{ t('footer.institutional') }}</a
          >
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
