<script setup lang="ts">
/**
 * The student's assessment list (#61). Version-oriented, because completion and eligibility are
 * version-specific — not a catalogue of instruments.
 *
 * Consent state is deliberately absent from every row: it is recorded per policy document, not
 * per assessment, so every row would carry the same value (#59). The gate lives on `start`.
 */
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

definePageMeta({ layout: 'assessment', middleware: 'auth' })
useHead({ title: 'Asesmen · FIA Leadership Lab' })

interface TakeableVersion {
  versionId: string
  instrumentName: string
  description: string | null
  versionNo: number
  itemCount: number
  state: 'available' | 'in_progress' | 'submitted'
  retired: boolean
}

const { data, pending, error } = await useFetch<{ versions: TakeableVersion[] }>(
  '/api/v1/assessment/takeable',
  { key: 'assessment-takeable', retry: false }
)

const versions = computed(() => data.value?.versions ?? [])
</script>

<template>
  <div class="flex flex-col gap-space-6">
    <h1 class="text-ink-900 text-heading-lg font-semibold">Asesmen</h1>

    <p v-if="error" class="text-destructive text-body-sm" role="alert">
      Tidak dapat memuat daftar asesmen. Coba muat ulang halaman ini.
    </p>

    <div v-else-if="pending" class="flex flex-col gap-space-3">
      <Skeleton v-for="n in 2" :key="n" class="h-24 rounded-lg" />
    </div>

    <!-- The empty state must not hint at authoring or admin actions (#61). -->
    <p v-else-if="!versions.length" class="text-muted-600 text-body-md">
      Belum ada asesmen yang tersedia saat ini. Coba cek lagi nanti.
    </p>

    <ul v-else class="flex list-none flex-col gap-space-4 p-0">
      <li
        v-for="version in versions"
        :key="version.versionId"
        class="border-border bg-surface flex flex-col gap-space-3 rounded-lg border p-space-6"
      >
        <div class="flex flex-col gap-space-1">
          <h2 class="text-ink-900 text-heading-sm font-semibold">
            {{ version.instrumentName }}
          </h2>
          <p v-if="version.description" class="text-body-700 text-body-sm">
            {{ version.description }}
          </p>
          <!-- Item count, but no time estimate: the product has not defined one, and there is no
               session time limit to derive one from (#61). -->
          <p class="text-muted-600 text-body-sm">
            Versi {{ version.versionNo }} · {{ version.itemCount }} pertanyaan
          </p>
        </div>

        <div>
          <Button
            v-if="version.state === 'available'"
            as="a"
            :href="`/assessment/${version.versionId}/consent`"
          >
            Mulai
          </Button>

          <Button
            v-else-if="version.state === 'in_progress'"
            as="a"
            :href="`/assessment/${version.versionId}/consent`"
          >
            Lanjutkan
          </Button>

          <!-- Static, not a link: there is nothing behind it to open, because a submitted session
               has no answer re-read and no result page yet (#62). -->
          <span v-else class="text-success-700 text-body-sm font-semibold">Selesai</span>
        </div>
      </li>
    </ul>
  </div>
</template>
