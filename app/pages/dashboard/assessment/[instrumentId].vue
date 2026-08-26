<script setup lang="ts">
/**
 * The authoring screen for one instrument (#54).
 *
 * Shape settled in #50: **Variant A's ledger as the primary view, B's dimension matrix as a
 * second, C's review screen on publish.** Three tabs over one selected version.
 *
 * The version selector defaults to the instrument's open version, because #49's partial unique
 * index guarantees at most one `draft`/`review` version per instrument — so "the draft" is
 * unambiguous and does not need choosing. A `published` or `retired` version can still be selected
 * and renders read-only from its snapshot.
 *
 * This page owns every write. The components emit intent and stay server-free, which is what keeps
 * them mountable in a component test.
 */
import type { ComponentPublicInstance } from 'vue'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ItemLedger from '@/components/assessment/ItemLedger.vue'
import DimensionMatrix from '@/components/assessment/DimensionMatrix.vue'
import PublishReview from '@/components/assessment/PublishReview.vue'
import BankEditor from '@/components/assessment/BankEditor.vue'
import {
  parseBulkPaste,
  type Dimension,
  type DimensionKind,
  type VersionDetail,
  type VersionDiff,
} from '@/lib/assessment-authoring'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

/**
 * The fetcher every call on this page uses.
 *
 * `useRequestFetch()` rather than a bare `$fetch`, and that is load-bearing rather than stylistic:
 * during SSR it forwards the incoming request's headers, so the session cookie reaches the API.
 * With a bare `$fetch` the server-side read of `/api/v1/assessment/versions/{id}` arrived
 * unauthenticated, came back 401, and the screen rendered "versi tidak dapat dimuat" while the
 * selector happily showed v1. `useFetch` does this forwarding on its own, which is why the
 * instrument read worked and these two did not. On the client it is plain `$fetch`.
 *
 * The cast drops Nuxt's literal-route inference. Every write below targets a path with a parameter
 * in the middle (`/items/{id}/dimensions`), and that made the typed-route generic recurse until tsc
 * reported "Excessive stack depth comparing types". One cast in one place, so the opt-out is
 * visible rather than repeated at nine call sites; response shapes are still declared per call.
 */
type ApiFetch = <T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>
const api = useRequestFetch() as unknown as ApiFetch

const route = useRoute()
const instrumentId = computed(() => String(route.params.instrumentId))

interface InstrumentPayload {
  instrument: { id: string; code: string; name: string }
  versions: {
    id: string
    versionNo: number
    status: 'draft' | 'review' | 'published' | 'retired'
    sourceVersionId: string | null
  }[]
  items: { id: string; code: string; stem: string; scaleId: string }[]
  dimensions: Dimension[]
  scales: { id: string; code: string; name: string; points: unknown }[]
}

const {
  data: instrumentData,
  pending: instrumentPending,
  error: instrumentError,
  refresh: refreshInstrument,
} = await useFetch<InstrumentPayload>(
  () => `/api/v1/assessment/instruments/${instrumentId.value}`,
  { retry: false }
)

useHead({
  title: () =>
    `${instrumentData.value?.instrument.code ?? 'Instrumen'} · Assessment configuration · Lab Admin`,
})

const versions = computed(() => instrumentData.value?.versions ?? [])
const dimensions = computed(() => instrumentData.value?.dimensions ?? [])
const scaleCodes = computed(() => (instrumentData.value?.scales ?? []).map((s) => s.code))
const scaleIdByCode = computed(
  () => new Map((instrumentData.value?.scales ?? []).map((s) => [s.code, s.id]))
)

/** #49: at most one open version per instrument, so this is unambiguous. */
const openVersion = computed(
  () => versions.value.find((v) => v.status === 'draft' || v.status === 'review') ?? null
)

/**
 * The version on screen: an explicit choice wins, otherwise the open version, otherwise the newest.
 *
 * A `computed`, not a ref assigned by a `watchEffect`. The watcher version left the screen saying
 * "no versions" while the selector showed v1 — in an async `setup()` a watcher created after an
 * `await` is not tracked the way one created before it is, so the data composable below saw a null
 * id on its first and only run. A computed has no ordering to get wrong.
 */
const chosenVersionId = ref<string | null>(null)
const selectedVersionId = computed(
  () => chosenVersionId.value ?? openVersion.value?.id ?? versions.value.at(-1)?.id ?? null
)

/**
 * `useAsyncData` rather than `useFetch`: the id can legitimately be absent, and
 * `useFetch(..., { immediate: false, watch: [selectedVersionId] })` never fetched at all — the
 * default id is set during setup, so `watch` saw no change. Returning `null` for a null id keeps
 * the absent case explicit instead of requesting `/versions/null`.
 */
const {
  data: versionData,
  pending: versionPending,
  refresh: refreshVersion,
} = await useAsyncData(
  `assessment-version-${instrumentId.value}`,
  () =>
    selectedVersionId.value
      ? api<VersionDetail>(`/api/v1/assessment/versions/${selectedVersionId.value}`)
      : Promise.resolve(null),
  { watch: [selectedVersionId] }
)

const { data: diffData, refresh: refreshDiff } = await useAsyncData(
  `assessment-diff-${instrumentId.value}`,
  () =>
    selectedVersionId.value
      ? api<VersionDiff>(`/api/v1/assessment/versions/${selectedVersionId.value}/diff`)
      : Promise.resolve(null),
  { watch: [selectedVersionId] }
)

const version = computed(() => versionData.value ?? null)
const items = computed(() => version.value?.items ?? [])
const frozen = computed(() => version.value?.frozen ?? false)

type Tab = 'ledger' | 'matrix' | 'bank' | 'review'
const tab = ref<Tab>('ledger')
const TABS: { id: Tab; label: string }[] = [
  { id: 'ledger', label: 'Item' },
  { id: 'matrix', label: 'Matriks dimensi' },
  // Instrument-level, so it stays available even on a frozen version — the bank is never frozen
  // (#47), and a published version keeps its own snapshot.
  { id: 'bank', label: 'Skala & dimensi' },
  { id: 'review', label: 'Tinjau & publish' },
]
const visibleTabs = computed(() => (frozen.value ? TABS.filter((t) => t.id !== 'review') : TABS))

/**
 * The keyboard half of `role="tablist"`, per the APG pattern: arrows move and select, Home and End
 * jump to the ends, and focus follows selection so the matching panel is what a screen reader
 * reads next. Tab itself leaves the strip, which is what the roving `tabindex` is for.
 */
const tabRefs = new Map<Tab, HTMLElement>()
function setTabRef(id: Tab, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) tabRefs.set(id, el)
  else tabRefs.delete(id)
}

function onTabKeydown(event: KeyboardEvent) {
  const order = visibleTabs.value.map((entry) => entry.id)
  const current = order.indexOf(tab.value)
  if (current === -1) return

  let next: number | null = null
  if (event.key === 'ArrowRight') next = (current + 1) % order.length
  else if (event.key === 'ArrowLeft') next = (current - 1 + order.length) % order.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = order.length - 1
  if (next === null) return

  event.preventDefault()
  const id = order[next]
  if (!id) return
  tab.value = id
  nextTick(() => tabRefs.get(id)?.focus())
}

/**
 * An instrument with no scale cannot hold an item at all, so the screen opens on the tab that
 * unblocks that rather than on an inert ledger.
 */
const bankIncomplete = computed(
  () => !instrumentPending.value && (!scaleCodes.value.length || !dimensions.value.length)
)

watchEffect(() => {
  if (frozen.value && tab.value === 'review') tab.value = 'ledger'
})

/* ------------------------------------------------------------------------------------ writes --- */

const actionError = ref('')
const busy = ref(false)

/** Every write funnels through here so error handling and refresh are not re-implemented per
 * action, and so a failed write always leaves a stated reason on screen. */
async function run(action: () => Promise<unknown>, failure: string) {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await Promise.all([refreshVersion(), refreshDiff(), refreshInstrument()])
  } catch {
    actionError.value = failure
  } finally {
    busy.value = false
  }
}

const patchVersion = (body: Record<string, unknown>) =>
  api(`/api/v1/assessment/versions/${selectedVersionId.value}`, { method: 'PATCH', body })

function onAppendItem(input: { code: string; stem: string; scaleCode: string }) {
  run(async () => {
    const scaleId = scaleIdByCode.value.get(input.scaleCode)
    if (!scaleId) throw new Error('unknown scale')
    const created = await api<{ itemId: string }>(
      `/api/v1/assessment/instruments/${instrumentId.value}/items`,
      { method: 'POST', body: { code: input.code, stem: input.stem, scaleId } }
    )
    await patchVersion({ op: 'addItem', itemId: created.itemId, position: items.value.length })
  }, 'Item gagal ditambahkan. Kode mungkin sudah dipakai pada instrumen ini.')
}

function onRemoveItem(itemId: string) {
  run(() => patchVersion({ op: 'removeItem', itemId }), 'Item gagal dihapus dari versi ini.')
}

function onToggleReverse(itemId: string, reverseCoded: boolean) {
  run(
    () => patchVersion({ op: 'setReverseCoded', itemId, reverseCoded }),
    'Reverse-coding gagal diubah.'
  )
}

function onSetDimensions(itemId: string, dimensionIds: string[]) {
  // The bank owns item↔dimension mapping, so this is a bank write rather than a version write —
  // which is also why it affects every open version referencing the item, by design (#47).
  run(
    () =>
      api(`/api/v1/assessment/items/${itemId}/dimensions`, {
        method: 'PUT',
        body: { dimensionIds },
      }),
    'Pemetaan dimensi gagal disimpan.'
  )
}

function onMoveItem(itemId: string, direction: -1 | 1) {
  const order = items.value.map((item) => item.itemId)
  const from = order.indexOf(itemId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  order.splice(to, 0, ...order.splice(from, 1))
  run(() => patchVersion({ op: 'reorder', orderedItemIds: order }), 'Urutan gagal disimpan.')
}

async function onPublish() {
  await run(
    () => api(`/api/v1/assessment/versions/${selectedVersionId.value}/publish`, { method: 'POST' }),
    'Publish ditolak. Periksa kembali status versi dan kelengkapan snapshot.'
  )
}

function onAdvanceToReview() {
  run(
    () => api(`/api/v1/assessment/versions/${selectedVersionId.value}/review`, { method: 'POST' }),
    'Status gagal diubah ke review.'
  )
}

function onCreateScale(input: {
  code: string
  name: string
  points: { value: number; label: string }[]
}) {
  run(
    () =>
      api(`/api/v1/assessment/instruments/${instrumentId.value}/scales`, {
        method: 'POST',
        body: input,
      }),
    'Scale gagal dibuat. Periksa kode — mungkin sudah dipakai pada instrumen ini.'
  )
}

function onCreateDimension(input: { code: string; name: string; kind: DimensionKind }) {
  run(
    () =>
      api(`/api/v1/assessment/instruments/${instrumentId.value}/dimensions`, {
        method: 'POST',
        body: input,
      }),
    'Dimensi gagal dibuat. Periksa kode — mungkin sudah dipakai pada instrumen ini.'
  )
}

function onCreateVersion(sourceVersionId?: string) {
  run(async () => {
    const created = await api<{ version: { id: string } }>(
      `/api/v1/assessment/instruments/${instrumentId.value}/versions`,
      { method: 'POST', body: sourceVersionId ? { sourceVersionId } : {} }
    )
    chosenVersionId.value = created.version.id
  }, 'Versi baru gagal dibuat. Mungkin sudah ada versi draft yang terbuka.')
}

/* -------------------------------------------------------------------------------- bulk paste --- */

const pasteOpen = ref(false)
const pasteText = ref('')
const parsedPaste = computed(() => parseBulkPaste(pasteText.value))

function onBulkPaste() {
  const { rows } = parsedPaste.value
  if (!rows.length) return
  run(async () => {
    const scaleId = scaleIdByCode.value.get(scaleCodes.value[0] ?? '')
    if (!scaleId) throw new Error('no scale')
    // Sequential rather than parallel: `position` is allocated from the current length, and the
    // unique index on (version_id, position) would reject a concurrent burst.
    let position = items.value.length
    for (const row of rows) {
      const created = await api<{ itemId: string }>(
        `/api/v1/assessment/instruments/${instrumentId.value}/items`,
        { method: 'POST', body: { code: row.code, stem: row.stem, scaleId } }
      )
      await patchVersion({ op: 'addItem', itemId: created.itemId, position })
      position += 1
    }
    pasteText.value = ''
    pasteOpen.value = false
  }, 'Sebagian item gagal ditambahkan. Periksa daftar — item yang berhasil sudah tersimpan.')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p v-if="instrumentError" class="text-destructive text-sm" role="alert">
      Tidak dapat memuat instrumen ini.
    </p>

    <div v-else-if="instrumentPending" class="flex flex-col gap-2">
      <Skeleton v-for="n in 4" :key="n" class="h-12 rounded-lg" />
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-muted-foreground text-xs">
            <NuxtLink to="/dashboard/assessment" class="underline-offset-4 hover:underline">
              Assessment configuration
            </NuxtLink>
          </p>
          <h2 class="text-base font-medium">
            {{ instrumentData?.instrument.name }}
            <span class="text-muted-foreground font-mono text-xs">
              {{ instrumentData?.instrument.code }}
            </span>
          </h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="text-xs">
            <span class="sr-only">Pilih versi</span>
            <select
              :value="selectedVersionId"
              class="border-border h-8 rounded-md border bg-transparent px-2 text-xs"
              @change="chosenVersionId = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="v in versions" :key="v.id" :value="v.id">
                v{{ v.versionNo }} — {{ v.status }}
              </option>
            </select>
          </label>

          <Button v-if="!openVersion" size="sm" :disabled="busy" @click="onCreateVersion()">
            Versi baru (kosong)
          </Button>
          <Button
            v-if="!openVersion && version && frozen"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="onCreateVersion(version.id)"
          >
            Versi baru dari v{{ version.versionNo }}
          </Button>
        </div>
      </div>

      <!--
        Stated as a fact of the screen rather than as a warning (#49/#50): there can only ever be
        one open version, so the absence of a "new draft" button needs an explanation, not an error.
      -->
      <p
        v-if="openVersion && openVersion.id !== selectedVersionId"
        class="text-muted-foreground text-xs"
      >
        Versi v{{ openVersion.versionNo }} masih terbuka ({{ openVersion.status }}). Satu instrumen
        hanya boleh punya satu versi draft/review sekaligus.
      </p>

      <p v-if="actionError" class="text-destructive text-sm" role="alert">{{ actionError }}</p>

      <div v-if="versionPending && !version" class="flex flex-col gap-2">
        <Skeleton v-for="n in 3" :key="n" class="h-10 rounded-lg" />
      </div>

      <template v-else-if="version">
        <!--
          A frozen version is visibly a different kind of object from a draft (#50): it says so in
          words, not by shading. Colour alone would fail WCAG 2.2 AA and is also just easy to miss.
        -->
        <p v-if="frozen" class="border-border bg-muted rounded-md border p-2 text-sm" role="status">
          <span class="font-medium">Versi {{ version.status }} — hanya baca.</span>
          Yang tampil di bawah adalah snapshot yang dibekukan saat publish, bukan teks bank hari
          ini. Perubahan apa pun membutuhkan versi baru (FR-005).
        </p>
        <p v-else class="text-muted-foreground text-sm">
          Versi v{{ version.versionNo }} berstatus
          <span class="font-medium">{{ version.status }}</span> dan masih dapat diubah.
        </p>

        <!-- Tabs as real buttons carrying aria-selected, with the panel labelled by its tab. -->
        <!--
          An instrument with no scale cannot hold an item, and one with no dimension cannot be
          published. Said here, with the way out, rather than discovered as a disabled button.
        -->
        <p
          v-if="bankIncomplete"
          class="border-border bg-muted rounded-md border p-2 text-sm"
          role="status"
        >
          <span class="font-medium">Instrumen ini belum siap menerima item.</span>
          {{ !scaleCodes.length ? 'Belum ada scale.' : '' }}
          {{ !dimensions.length ? 'Belum ada dimensi.' : '' }}
          Buat keduanya di tab
          <button
            type="button"
            class="text-primary underline underline-offset-4"
            @click="tab = 'bank'"
          >
            Skala &amp; dimensi
          </button>.
        </p>

        <!--
          Roving tabindex: exactly one tab is in the tab order, and the arrow keys move between
          them. Declaring `role="tablist"` promises this keyboard behaviour — a screen-reader user
          who reaches the strip and presses an arrow key expects to move, and Tab to leave.
          Without it the roles describe an interaction the widget does not support.
        -->
        <div
          role="tablist"
          aria-label="Tampilan versi"
          class="border-border flex gap-1 border-b"
          @keydown="onTabKeydown"
        >
          <button
            v-for="entry in visibleTabs"
            :id="`tab-${entry.id}`"
            :key="entry.id"
            :ref="(el) => setTabRef(entry.id, el)"
            type="button"
            role="tab"
            class="rounded-t-md px-3 py-1.5 text-sm"
            :class="
              tab === entry.id
                ? 'border-foreground text-foreground border-b-2 font-medium'
                : 'text-muted-foreground'
            "
            :aria-selected="tab === entry.id"
            :aria-controls="`panel-${entry.id}`"
            :tabindex="tab === entry.id ? 0 : -1"
            @click="tab = entry.id"
          >
            {{ entry.label }}
          </button>
        </div>

        <div v-if="tab === 'ledger'" id="panel-ledger" role="tabpanel" aria-labelledby="tab-ledger">
          <ItemLedger
            :items="items"
            :dimensions="dimensions"
            :diff="diffData ?? null"
            :frozen="frozen"
            :scale-codes="scaleCodes"
            @append-item="onAppendItem"
            @remove-item="onRemoveItem"
            @toggle-reverse="onToggleReverse"
            @set-dimensions="onSetDimensions"
            @move-item="onMoveItem"
          />

          <section v-if="!frozen" class="mt-4 flex flex-col gap-2">
            <button
              type="button"
              class="text-primary self-start text-sm underline-offset-4 hover:underline"
              :aria-expanded="pasteOpen"
              aria-controls="bulk-paste"
              @click="pasteOpen = !pasteOpen"
            >
              Tempel banyak item sekaligus
            </button>
            <div v-if="pasteOpen" id="bulk-paste" class="flex flex-col gap-2">
              <label class="text-muted-foreground text-xs" for="bulk-paste-input">
                Satu item per baris, format <code>kode</code> lalu tab atau koma lalu teks item.
              </label>
              <textarea
                id="bulk-paste-input"
                v-model="pasteText"
                rows="6"
                class="border-border rounded-md border bg-transparent p-2 font-mono text-xs"
                placeholder="kd01&#9;Saya membuat keputusan tanpa berkonsultasi."
              />
              <p class="text-muted-foreground text-xs">
                {{ parsedPaste.rows.length }} baris siap ditambahkan.
                <span v-if="parsedPaste.rejectedLines.length" class="text-destructive">
                  Baris tidak terbaca: {{ parsedPaste.rejectedLines.join(', ') }}.
                </span>
              </p>
              <Button
                class="self-start"
                size="sm"
                :disabled="!parsedPaste.rows.length || busy"
                @click="onBulkPaste"
              >
                Tambahkan {{ parsedPaste.rows.length }} item
              </Button>
            </div>
          </section>
        </div>

        <div v-if="tab === 'matrix'" id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix">
          <DimensionMatrix :items="items" :dimensions="dimensions" />
        </div>

        <div v-if="tab === 'bank'" id="panel-bank" role="tabpanel" aria-labelledby="tab-bank">
          <BankEditor
            :scales="instrumentData?.scales ?? []"
            :dimensions="dimensions"
            :busy="busy"
            @create-scale="onCreateScale"
            @create-dimension="onCreateDimension"
          />
        </div>

        <div v-if="tab === 'review'" id="panel-review" role="tabpanel" aria-labelledby="tab-review">
          <div v-if="version.status === 'draft'" class="mb-4 flex items-center gap-3">
            <Button size="sm" variant="outline" :disabled="busy" @click="onAdvanceToReview">
              Ajukan ke review
            </Button>
            <p class="text-muted-foreground text-xs">
              Versi harus berstatus review sebelum dapat dipublikasikan.
            </p>
          </div>

          <PublishReview
            :version="version"
            :diff="diffData ?? null"
            :busy="busy"
            @publish="onPublish"
          />
        </div>
      </template>

      <p v-else-if="!versions.length" class="text-muted-foreground text-sm">
        Instrumen ini belum punya versi. Buat versi kosong untuk mulai memasukkan item.
      </p>

      <p v-else class="text-destructive text-sm" role="alert">Versi terpilih tidak dapat dimuat.</p>
    </template>
  </div>
</template>
