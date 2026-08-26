<script setup lang="ts">
/**
 * The review screen — Variant C's contribution, grafted onto publish (#50, #54).
 *
 * Load-bearing rather than decorative. #49 accepted in-place rewording of bank items on the
 * explicit condition that the resulting drift is visible for the Academic Lead to govern, and a
 * diff tag in a table column reading "Teks item" is visible but not sufficient: it never shows the
 * *old* wording, so it cannot support the judgement it exists to enable. This screen shows the
 * source wording above the current wording, verbatim.
 *
 * The publish action does not arm until every blocker is cleared and the author has ticked an
 * acknowledgement naming the change count. The server enforces all of this independently (#48's
 * triggers, #52's service guard); see `publishGate` in `@/lib/assessment-authoring`.
 */
import { computed, ref } from 'vue'

import { Button } from '@/components/ui/button'
import { publishGate, type VersionDetail, type VersionDiff } from '@/lib/assessment-authoring'

const props = defineProps<{
  version: VersionDetail | null
  diff: VersionDiff | null
  /** Set while the publish request is in flight, so the button cannot be pressed twice. */
  busy?: boolean
}>()

const emit = defineEmits<{ publish: [] }>()

const acknowledged = ref(false)

const gate = computed(() =>
  publishGate({ version: props.version, diff: props.diff, acknowledged: acknowledged.value })
)

/** Blockers other than the acknowledgement, which is the author's own step rather than a fault. */
const faults = computed(() => gate.value.blockers.filter((b) => b.code !== 'not-acknowledged'))

const stemChanged = computed(() => props.diff?.stemChanged ?? [])
const hasStructuralChange = computed(() => {
  const diff = props.diff
  if (!diff || diff.blank) return false
  return (
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.moved.length > 0 ||
    diff.reverseCodingChanged.length > 0
  )
})
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="publish-review-heading"
    data-testid="publish-review"
  >
    <h2 id="publish-review-heading" class="text-base font-medium">Tinjau sebelum publish</h2>

    <p v-if="!version" class="text-muted-foreground text-sm">Versi belum dimuat.</p>

    <template v-else>
      <p v-if="diff?.blank" class="text-muted-foreground text-sm">
        Versi ini tidak diturunkan dari versi lain, jadi tidak ada pembanding. Seluruh isinya baru.
      </p>

      <!-- The drift, verbatim. This block is why the review screen exists (#49). -->
      <section
        v-if="stemChanged.length"
        aria-labelledby="stem-drift-heading"
        class="flex flex-col gap-2"
      >
        <h3 id="stem-drift-heading" class="text-sm font-medium">
          Teks item yang berubah sejak versi sumber ({{ stemChanged.length }})
        </h3>
        <p class="text-muted-foreground text-xs">
          Kode item sama, tetapi kalimatnya tidak. Versi yang sudah dipublikasikan tetap menyimpan
          kalimat lamanya; yang berubah adalah apa yang ditanyakan versi ini.
        </p>
        <ul class="flex flex-col gap-3">
          <li
            v-for="change in stemChanged"
            :key="change.itemId"
            class="border-border rounded-md border p-2"
          >
            <p class="font-mono text-xs">{{ change.code }}</p>
            <!-- Labelled "Sebelum"/"Sesudah" in text. Position alone would not survive a
                 screen reader, and strikethrough alone would not survive high-contrast mode. -->
            <p class="text-muted-foreground mt-1 text-xs">Sebelum</p>
            <p class="text-sm">{{ change.before }}</p>
            <p class="text-muted-foreground mt-1 text-xs">Sesudah</p>
            <p class="text-sm font-medium">{{ change.after }}</p>
          </li>
        </ul>
      </section>

      <section
        v-if="hasStructuralChange"
        aria-labelledby="structural-heading"
        class="flex flex-col gap-1"
      >
        <h3 id="structural-heading" class="text-sm font-medium">Perubahan susunan</h3>
        <ul class="text-sm">
          <li v-for="row in diff?.added ?? []" :key="`a-${row.itemId}`">
            Ditambahkan: <span class="font-mono text-xs">{{ row.code }}</span>
          </li>
          <li v-for="row in diff?.removed ?? []" :key="`r-${row.itemId}`">
            Dihapus: <span class="font-mono text-xs">{{ row.code }}</span>
          </li>
          <li v-for="row in diff?.moved ?? []" :key="`m-${row.itemId}`">
            Dipindah: <span class="font-mono text-xs">{{ row.code }}</span> dari posisi
            {{ row.from }} ke {{ row.to }}
          </li>
          <li v-for="row in diff?.reverseCodingChanged ?? []" :key="`v-${row.itemId}`">
            Reverse-coding: <span class="font-mono text-xs">{{ row.code }}</span>
            {{ row.from ? 'ya' : 'tidak' }} → {{ row.to ? 'ya' : 'tidak' }}
          </li>
        </ul>
      </section>

      <!-- Blockers are shown before the attempt, not discovered as a failure (#50). -->
      <section
        v-if="faults.length"
        aria-labelledby="blockers-heading"
        class="border-destructive rounded-md border p-2"
        role="alert"
      >
        <h3 id="blockers-heading" class="text-destructive text-sm font-medium">
          Belum dapat dipublikasikan
        </h3>
        <ul class="text-destructive mt-1 text-sm">
          <li v-for="blocker in faults" :key="blocker.code">{{ blocker.message }}</li>
        </ul>
      </section>

      <label class="flex items-start gap-2 text-sm">
        <input
          v-model="acknowledged"
          type="checkbox"
          class="mt-1"
          data-testid="publish-acknowledge"
        >
        <!-- The acknowledgement names the count, so ticking it is a statement about something
             specific rather than a reflex (#50). -->
        <span>
          Saya sudah meninjau
          <span class="font-medium">{{ gate.changeCount }} perubahan</span>
          pada versi ini dan bertanggung jawab atas keputusannya.
        </span>
      </label>

      <div class="flex items-center gap-3">
        <Button
          :disabled="!gate.armed || busy"
          data-testid="publish-button"
          @click="emit('publish')"
        >
          {{ busy ? 'Mempublikasikan…' : 'Publish versi ini' }}
        </Button>
        <!-- Why the button is disabled, in text next to it. A disabled control with no stated
             reason is the failure this replaces. -->
        <p v-if="!gate.armed" class="text-muted-foreground text-xs">
          {{
            faults.length
              ? 'Selesaikan hal di atas lebih dulu.'
              : 'Centang konfirmasi untuk mengaktifkan publish.'
          }}
        </p>
      </div>

      <p class="text-muted-foreground text-xs">
        Setelah dipublikasikan, versi ini menjadi tidak dapat diubah (FR-005). Perubahan apa pun
        sesudahnya membutuhkan versi baru.
      </p>
    </template>
  </section>
</template>
