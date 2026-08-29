<script setup lang="ts">
/**
 * PROTOTYPE — variant A: one item per screen, strictly directional.
 *
 * Answers to the ticket's open questions, this variant's way: a resumed session opens on the
 * first unanswered item; focus moves to the screen container (not the first radio) on every
 * page change, per the WCAG decision on #63; Back is always enabled and never clears an answer;
 * the saved indicator is a debounced, polite `role="status"` line, not attached to any one input.
 */
import { fakeItems, fakeResumedAnswers } from '@/lib/prototype/answering-screen-data'

const answers = reactive<Record<string, number>>({ ...fakeResumedAnswers })
const savedIds = reactive(new Set<string>())
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const firstUnanswered = fakeItems.findIndex((item) => !(item.id in answers))
const index = ref(firstUnanswered === -1 ? 0 : firstUnanswered)
const resumedAt = index.value

const item = computed(() => fakeItems[index.value]!)
const isLast = computed(() => index.value === fakeItems.length - 1)
const canAdvance = computed(() => item.value.id in answers)

const screenRef = ref<HTMLElement | null>(null)

function onSelect(itemId: string) {
  const existing = timers.get(itemId)
  if (existing) clearTimeout(existing)
  savedIds.delete(itemId)
  timers.set(
    itemId,
    setTimeout(() => savedIds.add(itemId), 500)
  )
}

async function go(delta: number) {
  index.value = Math.min(Math.max(index.value + delta, 0), fakeItems.length - 1)
  await nextTick()
  screenRef.value?.focus()
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <div class="px-space-4 pt-space-6 pb-space-2 max-w-md w-full mx-auto">
      <p class="text-caption text-muted-500 mb-space-2">
        Pertanyaan {{ index + 1 }} dari {{ fakeItems.length }}
      </p>
      <div class="h-2 rounded-full bg-surface-sunken overflow-hidden" aria-hidden="true">
        <div
          class="h-full bg-primary-600 transition-[width] duration-300"
          :style="{ width: `${((index + 1) / fakeItems.length) * 100}%` }"
        />
      </div>
      <p v-if="index === resumedAt && resumedAt > 0" class="text-caption text-muted-500 mt-space-2">
        Melanjutkan dari pertanyaan terakhir yang belum terjawab.
      </p>
    </div>

    <main
      ref="screenRef"
      tabindex="-1"
      class="flex-1 px-space-4 py-space-6 max-w-md w-full mx-auto outline-none"
    >
      <fieldset :key="item.id">
        <legend class="text-body-lg font-semibold text-ink-900 mb-space-4 text-left">
          {{ item.stemSnapshot }}
        </legend>
        <div class="flex flex-col gap-space-2">
          <label
            v-for="point in item.scalePointsSnapshot"
            :key="point.value"
            class="flex items-center gap-space-3 min-h-11 px-space-4 py-space-2 rounded-lg border border-border cursor-pointer has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600/5"
          >
            <input
              v-model="answers[item.id]"
              type="radio"
              :name="`item-${item.id}`"
              :value="point.value"
              class="size-5 accent-primary-600 shrink-0"
              @change="onSelect(item.id)"
            >
            <span class="text-body-md text-body-700">{{ point.label }}</span>
          </label>
        </div>
      </fieldset>

      <p class="text-caption text-muted-600 mt-space-4 h-4" role="status">
        {{ savedIds.has(item.id) ? 'Tersimpan' : '' }}
      </p>
    </main>

    <!-- pb-space-24 rather than pb-space-6: clears the throwaway PrototypeSwitcher pill, which
         is fixed at the bottom of the viewport and would otherwise sit on top of these buttons. -->
    <div class="px-space-4 pb-space-24 max-w-md w-full mx-auto flex gap-space-3">
      <button
        type="button"
        class="h-11 px-space-6 rounded-md border border-border-strong text-body-md font-semibold text-ink-900 disabled:opacity-40"
        :disabled="index === 0"
        @click="go(-1)"
      >
        Kembali
      </button>
      <button
        v-if="!isLast"
        type="button"
        class="flex-1 h-11 px-space-6 rounded-md bg-primary-600 text-on-primary text-body-md font-semibold disabled:opacity-40"
        :disabled="!canAdvance"
        @click="go(1)"
      >
        Lanjut
      </button>
      <button
        v-else
        type="button"
        class="flex-1 h-11 px-space-6 rounded-md bg-primary-600 text-on-primary text-body-md font-semibold disabled:opacity-40"
        :disabled="!canAdvance"
      >
        Selesai
      </button>
    </div>
  </div>
</template>
