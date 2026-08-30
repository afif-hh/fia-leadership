<script setup lang="ts">
import { footerLinks, navLinks } from '@/lib/public-nav'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Skip to Content Link -->
    <a href="#main-content" class="skip-to-content"> Skip to main content </a>

    <!-- Header -->
    <nav
      class="bg-surface-container-lowest font-body-md text-body-md fixed top-0 w-full z-50 border-b border-border"
    >
      <div class="flex justify-between items-center h-16 max-w-7xl mx-auto px-margin-page">
        <!-- Logo -->
        <NuxtLink
          to="/"
          class="font-display-md text-display-md font-bold text-primary-700 flex items-center gap-space-2"
        >
          <span class="material-symbols-outlined fill text-primary-500" style="font-size: 32px"
            >account_balance</span
          >
          <span>FIA Leadership Lab</span>
        </NuxtLink>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex items-center gap-space-6">
          <PublicPlannedLink
            v-for="link in navLinks"
            :key="link.label"
            :to="link.to"
            class="text-body-700 hover:text-primary-700 transition-colors duration-200 inline-flex items-center"
          >
            {{ link.label }}
          </PublicPlannedLink>
        </div>

        <!-- Desktop Actions -->
        <div class="flex items-center">
          <NuxtLink
            to="/sign-in"
            class="bg-primary-700 text-on-primary px-space-4 h-[40px] rounded hover:bg-primary-500 transition-colors duration-200 font-label-mono text-label-mono flex items-center justify-center cursor-pointer active:opacity-80 transition-opacity"
          >
            Portal Login
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
          <span class="font-heading-lg text-heading-lg text-surface-container-lowest"
            >FIA Leadership Lab</span
          >
          <span class="text-surface-container-high text-sm"
            >&copy; {{ new Date().getFullYear() }} FIA Leadership Lab. Universitas Brawijaya (UB)
            Affiliated.</span
          >
        </div>
        <div class="flex flex-wrap justify-center gap-space-6">
          <PublicPlannedLink
            v-for="link in footerLinks"
            :key="link.label"
            :to="link.to"
            class="text-surface-container-high hover:text-primary-fixed-dim hover:underline transition-all cursor-pointer inline-flex items-center"
          >
            {{ link.label }}
          </PublicPlannedLink>
          <a
            href="https://admin.ub.ac.id"
            target="_blank"
            rel="noopener noreferrer"
            class="text-surface-container-high hover:text-primary-fixed-dim hover:underline transition-all cursor-pointer"
            >Institutional Site</a
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
