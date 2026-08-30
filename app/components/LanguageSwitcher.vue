<script setup lang="ts">
/**
 * Language switching as navigation, not as a client-side toggle.
 *
 * `switchLocalePath` resolves the *same* route in the other locale, so a student halfway through
 * an assessment stays on that assessment. A plain `setLocale()` would keep the URL — and with
 * `prefix_except_default` the URL is what the server reads on the next request, so the choice
 * would not survive a reload.
 *
 * Anchors rather than buttons, because each option is a real, shareable address. `hreflang` and
 * `aria-current` give assistive technology the language and the active state, which colour alone
 * cannot carry (WCAG 2.2 AA, 1.4.1).
 */
import { Languages } from '@lucide/vue'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const options = computed(() =>
  locales.value.map((entry) => ({
    code: entry.code,
    name: entry.name ?? entry.code,
    language: entry.language ?? entry.code,
    to: switchLocalePath(entry.code),
    current: entry.code === locale.value,
  }))
)

const currentName = computed(() => options.value.find((o) => o.current)?.name ?? locale.value)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="text-body-md hover:text-primary-700 focus-visible:ring-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      :aria-label="t('language.switch')"
    >
      <Languages class="size-4" aria-hidden="true" />
      <span>{{ currentName }}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem v-for="option in options" :key="option.code" as-child>
        <NuxtLink
          :to="option.to ?? '/'"
          :hreflang="option.language"
          :lang="option.language"
          :aria-current="option.current ? 'true' : undefined"
        >
          {{ option.name }}
        </NuxtLink>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
