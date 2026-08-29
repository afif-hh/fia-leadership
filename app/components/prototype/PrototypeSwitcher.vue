<script setup lang="ts">
/** PROTOTYPE — throwaway. Gated on dev mode by the page that mounts it. */
const props = defineProps<{
  variants: { key: string; name: string }[]
  current: string
}>()
const emit = defineEmits<{ change: [key: string] }>()

const index = computed(() => props.variants.findIndex((v) => v.key === props.current))
const currentVariant = computed(() => props.variants[index.value])

function cycle(delta: number) {
  const next = (index.value + delta + props.variants.length) % props.variants.length
  emit('change', props.variants[next]!.key)
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
  if (target?.isContentEditable) return
  if (e.key === 'ArrowLeft') cycle(-1)
  if (e.key === 'ArrowRight') cycle(1)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2 rounded-full bg-ink-900 text-white px-2 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.35)]"
  >
    <button
      type="button"
      aria-label="Varian sebelumnya"
      class="grid place-items-center size-9 rounded-full hover:bg-white/15"
      @click="cycle(-1)"
    >
      ←
    </button>
    <span class="text-xs font-semibold px-2 whitespace-nowrap">
      {{ currentVariant?.key }} — {{ currentVariant?.name }}
    </span>
    <button
      type="button"
      aria-label="Varian berikutnya"
      class="grid place-items-center size-9 rounded-full hover:bg-white/15"
      @click="cycle(1)"
    >
      →
    </button>
  </div>
</template>
