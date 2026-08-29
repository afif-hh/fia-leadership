<script setup lang="ts">
/**
 * PROTOTYPE — variant C: blocks of 3 items, directional between blocks.
 *
 * A hybrid of A and B: several items per screen (less pagination than A, less scroll-hunting
 * than B), but still a "page" the student advances through, so focus moves to the block heading
 * on every change (SC 2.4.3), same as A. One shared saved line per block instead of per item —
 * quieter than B when several answers land close together. Answers live in one reactive object
 * for the whole session, so navigating blocks (forward or back) never touches what is already
 * answered.
 */
import { fakeItems, fakeResumedAnswers } from '@/lib/prototype/answering-screen-data'

const BLOCK_SIZE = 3
const blocks = computed(() => {
  const chunks: (typeof fakeItems)[] = []
  for (let i = 0; i < fakeItems.length; i += BLOCK_SIZE) chunks.push(fakeItems.slice(i, i + BLOCK_SIZE))
  return chunks
})

const answers = reactive<Record<string, number>>({ ...fakeResumedAnswers })
const savedAt = ref<number | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | undefined

const firstUnansweredBlock = blocks.value.findIndex((block) =>
  block.some((item) => !(item.id in answers))
)
const blockIndex = ref(firstUnansweredBlock === -1 ? 0 : firstUnansweredBlock)
const resumedAt = blockIndex.value

const currentBlock = computed(() => blocks.value[blockIndex.value]!)
const isLastBlock = computed(() => blockIndex.value === blocks.value.length - 1)
const blockComplete = computed(() => currentBlock.value.every((item) => item.id in answers))

const blockRef = ref<HTMLElement | null>(null)

function onSelect() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    savedAt.value = Date.now()
  }, 500)
}

async function go(delta: number) {
  blockIndex.value = Math.min(Math.max(blockIndex.value + delta, 0), blocks.value.length - 1)
  savedAt.value = null
  await nextTick()
  blockRef.value?.focus()
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <div class="px-space-4 pt-space-6 pb-space-2 max-w-lg w-full mx-auto">
      <ol class="flex items-center gap-space-2" aria-label="Kemajuan asesmen">
        <li v-for="(_, i) in blocks" :key="i" class="flex-1">
          <div
            class="h-2 rounded-full"
            :class="
              i < blockIndex ? 'bg-success-700' : i === blockIndex ? 'bg-primary-600' : 'bg-surface-sunken'
            "
          />
        </li>
      </ol>
      <p class="text-caption text-muted-500 mt-space-2">
        Bagian {{ blockIndex + 1 }} dari {{ blocks.length }} — pertanyaan
        {{ currentBlock[0]!.position + 1 }}–{{ currentBlock[currentBlock.length - 1]!.position + 1 }}
        dari {{ fakeItems.length }}
      </p>
      <p v-if="blockIndex === resumedAt && resumedAt > 0" class="text-caption text-muted-500">
        Melanjutkan dari bagian terakhir yang belum lengkap.
      </p>
    </div>

    <main
      ref="blockRef"
      tabindex="-1"
      class="flex-1 px-space-4 py-space-4 max-w-lg w-full mx-auto outline-none flex flex-col gap-space-8"
    >
      <fieldset v-for="fitem in currentBlock" :key="fitem.id">
        <legend class="text-body-lg font-semibold text-ink-900 mb-space-3 text-left">
          {{ fitem.stemSnapshot }}
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
              @change="onSelect"
            >
            <span class="text-body-md text-body-700">{{ point.label }}</span>
          </label>
        </div>
      </fieldset>

      <p class="text-caption text-muted-600 h-4" role="status">
        {{ savedAt ? 'Tersimpan' : '' }}
      </p>
    </main>

    <!-- pb-space-24 rather than pb-space-6: clears the throwaway PrototypeSwitcher pill, which
         is fixed at the bottom of the viewport and would otherwise sit on top of these buttons. -->
    <div class="px-space-4 pb-space-24 max-w-lg w-full mx-auto flex gap-space-3">
      <button
        type="button"
        class="h-11 px-space-6 rounded-md border border-border-strong text-body-md font-semibold text-ink-900 disabled:opacity-40"
        :disabled="blockIndex === 0"
        @click="go(-1)"
      >
        Kembali
      </button>
      <button
        v-if="!isLastBlock"
        type="button"
        class="flex-1 h-11 px-space-6 rounded-md bg-primary-600 text-on-primary text-body-md font-semibold disabled:opacity-40"
        :disabled="!blockComplete"
        @click="go(1)"
      >
        Lanjut
      </button>
      <button
        v-else
        type="button"
        class="flex-1 h-11 px-space-6 rounded-md bg-primary-600 text-on-primary text-body-md font-semibold disabled:opacity-40"
        :disabled="!blockComplete"
      >
        Selesai
      </button>
    </div>
  </div>
</template>
