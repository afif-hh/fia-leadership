<script setup lang="ts">
/**
 * PROTOTYPE — variant B: one long page, every item at once, free navigation.
 *
 * No pagination, so no SC 2.4.3 focus-move — instead the resumed session scrolls to the first
 * unanswered item on mount. A jump map lets the student move to any item in any order. Saves are
 * announced through one shared `role="status"` region (deduped) so a screen reader doesn't hear
 * eight separate "Tersimpan" announcements if the student answers quickly; the sticky bottom bar
 * never sits under the currently-focused field (scroll-padding-bottom keeps it clear per 2.4.11).
 */
import { fakeItems, fakeResumedAnswers } from '@/lib/prototype/answering-screen-data'

const answers = reactive<Record<string, number>>({ ...fakeResumedAnswers })
const savedIds = reactive(new Set<string>())
const liveMessage = ref('')
let liveTimer: ReturnType<typeof setTimeout> | undefined
let announceTimer: ReturnType<typeof setTimeout> | undefined

const answeredCount = computed(() => Object.keys(answers).length)
const firstUnansweredId = computed(
  () => fakeItems.find((item) => !(item.id in answers))?.id ?? null
)

function onSelect(itemId: string) {
  if (liveTimer) clearTimeout(liveTimer)
  liveTimer = setTimeout(() => savedIds.add(itemId), 500)
  if (announceTimer) clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    liveMessage.value = `Jawaban tersimpan. ${answeredCount.value} dari ${fakeItems.length} terjawab.`
  }, 600)
}

function jumpTo(itemId: string) {
  document.getElementById(`field-${itemId}`)?.scrollIntoView({ block: 'center' })
}

onMounted(() => {
  const target = firstUnansweredId.value
  if (target) {
    // A resumed session lands here already scrolled — no animation, this isn't a fresh action.
    document.getElementById(`field-${target}`)?.scrollIntoView({ block: 'center' })
  }
})
</script>

<template>
  <div class="min-h-screen bg-background pb-space-40" style="scroll-padding-bottom: 8rem">
    <div aria-live="polite" role="status" class="sr-only">{{ liveMessage }}</div>

    <header class="px-space-4 pt-space-6 pb-space-4 max-w-2xl w-full mx-auto">
      <h1 class="text-heading-md font-semibold text-ink-900">Asesmen Gaya Kepemimpinan</h1>
      <p class="text-body-sm text-muted-500 mt-space-1">
        {{ answeredCount }} dari {{ fakeItems.length }} pertanyaan terjawab. Jawab dengan urutan
        bebas — kemajuan disimpan otomatis.
      </p>
      <div class="flex flex-wrap gap-space-2 mt-space-3">
        <button
          v-for="i in fakeItems"
          :key="i.id"
          type="button"
          class="size-9 rounded-full border text-body-sm font-semibold grid place-items-center"
          :class="
            i.id in answers
              ? 'bg-primary-600 text-on-primary border-primary-600'
              : 'border-border-strong text-body-700'
          "
          :aria-label="`Ke pertanyaan ${i.position + 1}${i.id in answers ? ', sudah terjawab' : ', belum terjawab'}`"
          @click="jumpTo(i.id)"
        >
          {{ i.position + 1 }}
        </button>
      </div>
    </header>

    <main class="px-space-4 max-w-2xl w-full mx-auto flex flex-col gap-space-8">
      <fieldset
        v-for="fitem in fakeItems"
        :id="`field-${fitem.id}`"
        :key="fitem.id"
        class="scroll-mt-6"
      >
        <legend class="text-body-lg font-semibold text-ink-900 mb-space-3 text-left">
          {{ fitem.position + 1 }}. {{ fitem.stemSnapshot }}
        </legend>
        <div class="flex flex-col gap-space-2">
          <label
            v-for="point in fitem.scalePointsSnapshot"
            :key="point.value"
            class="flex items-center gap-space-3 min-h-11 px-space-4 py-space-2 rounded-lg border border-border cursor-pointer has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600/5"
          >
            <input
              v-model="answers[fitem.id]"
              type="radio"
              :name="`item-${fitem.id}`"
              :value="point.value"
              class="size-5 accent-primary-600 shrink-0"
              @change="onSelect(fitem.id)"
            >
            <span class="text-body-md text-body-700">{{ point.label }}</span>
          </label>
        </div>
        <p class="text-caption text-muted-600 mt-space-2 h-4">
          {{ savedIds.has(fitem.id) ? 'Tersimpan' : '' }}
        </p>
      </fieldset>
    </main>

    <!-- bottom-16 rather than bottom-0: leaves the throwaway PrototypeSwitcher pill, fixed at
         the very bottom of the viewport, room to sit below this bar instead of on top of it. -->
    <div
      class="fixed bottom-16 inset-x-0 bg-surface border-t border-border px-space-4 py-space-3 flex items-center justify-between shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
    >
      <span class="text-body-sm text-muted-500">{{ answeredCount }}/{{ fakeItems.length }}</span>
      <button
        type="button"
        class="h-11 px-space-6 rounded-md bg-primary-600 text-on-primary text-body-md font-semibold disabled:opacity-40"
        :disabled="answeredCount < fakeItems.length"
      >
        Kirim Jawaban
      </button>
    </div>
  </div>
</template>
