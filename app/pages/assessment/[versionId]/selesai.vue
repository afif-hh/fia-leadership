<script setup lang="ts">
/**
 * The screen after submit (#62). A plain confirmation, and deliberately nothing more.
 *
 * Four things are absent on purpose, each decided rather than forgotten:
 *
 * - **No score disclaimer.** kdpgk-v1.md requires it on every *output*; this page renders no
 *   number, so there is nothing for it to guard against.
 * - **No committed timeline.** The promise is passive. Neither the scoring engine (#70) nor any
 *   notification service (#74) exists, and a promise the product cannot keep is worse than none.
 * - **No onward links.** Modules, simulations and development goals are not built; a link to
 *   nothing is worse than no link.
 * - **No re-read of the answers.** A raw Likert response set means little without a score, so
 *   reviewing it belongs to the result-page effort, which is out of this map's scope.
 */
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'assessment', middleware: 'auth' })
useHead({ title: 'Terkirim · Asesmen' })
</script>

<template>
  <div class="flex flex-col items-start gap-space-6">
    <h1 class="text-ink-900 text-heading-lg font-semibold">Jawabanmu sudah terkirim</h1>

    <p class="text-body-700 text-body-md">
      Jawabanmu sudah tersimpan. Hasil akan tersedia di sini nanti — cek kembali secara berkala.
    </p>

    <Button as="a" href="/assessment">Kembali ke Daftar Asesmen</Button>
  </div>
</template>
