<script setup lang="ts">
const { theme, toggleTheme, resolvedTheme } = useTheme()

const themeLabels = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System theme',
}

const getLabel = () => {
  return themeLabels[theme.value]
}
</script>

<template>
  <button
    :aria-label="`Current theme: ${getLabel()}. Click to cycle through themes.`"
    :title="getLabel()"
    class="theme-toggle"
    @click="toggleTheme"
  >
    <span class="sr-only">{{ getLabel() }}</span>
    <!-- Sun icon for light mode -->
    <svg v-if="resolvedTheme === 'light'" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
    <!-- Moon icon for dark mode -->
    <svg v-else-if="resolvedTheme === 'dark'" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
    <!-- Monitor icon for system theme -->
    <svg v-else class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.theme-toggle:hover {
  background: var(--surface-sunken);
  border-color: var(--border-strong);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--ring-focus);
  outline-offset: 2px;
}

.icon {
  width: 20px;
  height: 20px;
  color: var(--body-700);
  transition: color var(--transition-fast);
}

.theme-toggle:hover .icon {
  color: var(--primary-600);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
