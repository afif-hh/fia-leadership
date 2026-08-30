<script setup lang="ts">
/**
 * The student assessment shell (#61) — deliberately not the `dashboard` layout.
 *
 * `/dashboard` is the staff surface: it carries a sidebar of Lab Admin navigation a student has
 * no access to, so reusing it would mean rendering links that 403 on click. This is a narrow
 * column with a single heading, which is also what the answering screen wants (#60).
 */
const title = 'Asesmen Kepemimpinan'
</script>

<template>
  <div class="bg-background min-h-screen">
    <a href="#assessment-main" class="skip-to-content">Lompat ke konten utama</a>

    <header class="border-border bg-surface border-b">
      <div class="mx-auto flex h-16 max-w-3xl items-center px-space-4">
        <NuxtLink to="/assessment" class="text-ink-900 text-heading-sm font-semibold no-underline">
          {{ title }}
        </NuxtLink>
      </div>
    </header>

    <main id="assessment-main" tabindex="-1" class="mx-auto max-w-3xl px-space-4 py-space-8">
      <slot />
    </main>
  </div>
</template>
