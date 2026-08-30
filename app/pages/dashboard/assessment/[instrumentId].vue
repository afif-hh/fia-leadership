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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DataCard from '@/components/dashboard/DataCard.vue'
import ItemLedger from '@/components/assessment/ItemLedger.vue'
import DimensionMatrix from '@/components/assessment/DimensionMatrix.vue'
import PublishReview from '@/components/assessment/PublishReview.vue'
import BankEditor from '@/components/assessment/BankEditor.vue'
import TranslationEditor from '@/components/assessment/TranslationEditor.vue'
import type { InstrumentTranslations } from '@/components/assessment/TranslationEditor.vue'
import {
  BASE_CONTENT_LOCALE,
  TRANSLATABLE_LOCALES,
  type TranslatableLocale,
} from '@/lib/content-locale'
import {
  parseBulkPaste,
  type Dimension,
  type DimensionKind,
  type VersionDetail,
  type VersionDiff,
} from '@/lib/assessment-authoring'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { messageFor } = useApiError()

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
  // The **base** locale, not the reader's. This screen edits the source text; showing a resolved
  // English rendering here would mean typing a correction into a translation and expecting the
  // original to change. The chrome around it is still in the reader's language.
  { retry: false, query: { locale: BASE_CONTENT_LOCALE } }
)

useHead(() => ({
  title: t('authoring.instrument.title', {
    code: instrumentData.value?.instrument.code ?? t('authoring.instrument.fallbackCode'),
  }),
}))

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
      ? api<VersionDetail>(
          `/api/v1/assessment/versions/${selectedVersionId.value}?locale=${BASE_CONTENT_LOCALE}`
        )
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

type Tab = 'ledger' | 'matrix' | 'bank' | 'translation' | 'review'
const tab = ref<Tab>('ledger')
// Instrument-level, so `bank` stays available even on a frozen version — the bank is never frozen
// (#47), and a published version keeps its own snapshot.
const TABS: Tab[] = ['ledger', 'matrix', 'bank', 'translation', 'review']
const visibleTabs = computed(() =>
  (frozen.value ? TABS.filter((id) => id !== 'review') : TABS).map((id) => ({
    id,
    label: t(`authoring.instrument.tab.${id}`),
  }))
)

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

/** What a write to the version or the bank invalidates. */
const refreshVersionViews = () =>
  Promise.all([refreshVersion(), refreshDiff(), refreshInstrument()])

/**
 * Every write funnels through here so error handling and refresh are not re-implemented per
 * action, and so a failed write always leaves a stated reason on screen.
 *
 * `failureKey` names a message rather than being one. The server's stable error codes are rendered
 * from `errors.*` by `useApiError`, which is what lets one refusal read as itself in either
 * language instead of collapsing into a generic sentence.
 *
 * `refresh` is a parameter rather than a fixed list because a translation write invalidates a
 * different read from a version write. Passing it makes each call site say what its write affects,
 * which is the part a second copy of this function would have hidden.
 */
async function run(
  action: () => Promise<unknown>,
  failureKey: string,
  refresh: () => Promise<unknown> = refreshVersionViews
) {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await refresh()
  } catch (error) {
    actionError.value = messageFor(error, failureKey)
  } finally {
    busy.value = false
  }
}

const patchVersion = (body: Record<string, unknown>) =>
  api(`/api/v1/assessment/versions/${selectedVersionId.value}`, { method: 'PATCH', body })

/** Creates the bank item and selects it into the open version in one request, so a failure cannot
 * leave an item that belongs to no version with its code already taken. */
function createAndSelect(input: { code: string; stem: string; scaleId: string; position: number }) {
  return api<{ itemId: string }>(`/api/v1/assessment/instruments/${instrumentId.value}/items`, {
    method: 'POST',
    body: {
      code: input.code,
      stem: input.stem,
      scaleId: input.scaleId,
      addTo: { versionId: selectedVersionId.value, position: input.position },
    },
  })
}

function onAppendItem(input: { code: string; stem: string; scaleCode: string }) {
  run(async () => {
    const scaleId = scaleIdByCode.value.get(input.scaleCode)
    if (!scaleId) throw new Error('unknown scale')
    await createAndSelect({
      code: input.code,
      stem: input.stem,
      scaleId,
      position: items.value.length,
    })
  }, 'authoring.instrument.failure.appendItem')
}

function onRemoveItem(itemId: string) {
  run(() => patchVersion({ op: 'removeItem', itemId }), 'authoring.instrument.failure.removeItem')
}

function onToggleReverse(itemId: string, reverseCoded: boolean) {
  run(
    () => patchVersion({ op: 'setReverseCoded', itemId, reverseCoded }),
    'authoring.instrument.failure.toggleReverse'
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
    'authoring.instrument.failure.setDimensions'
  )
}

function onMoveItem(itemId: string, direction: -1 | 1) {
  const order = items.value.map((item) => item.itemId)
  const from = order.indexOf(itemId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  order.splice(to, 0, ...order.splice(from, 1))
  run(
    () => patchVersion({ op: 'reorder', orderedItemIds: order }),
    'authoring.instrument.failure.reorder'
  )
}

async function onPublish() {
  await run(
    () => api(`/api/v1/assessment/versions/${selectedVersionId.value}/publish`, { method: 'POST' }),
    'authoring.instrument.failure.publish'
  )
}

function onAdvanceToReview() {
  run(
    () => api(`/api/v1/assessment/versions/${selectedVersionId.value}/review`, { method: 'POST' }),
    'authoring.instrument.failure.review'
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
    'authoring.instrument.failure.createScale'
  )
}

function onCreateDimension(input: { code: string; name: string; kind: DimensionKind }) {
  run(
    () =>
      api(`/api/v1/assessment/instruments/${instrumentId.value}/dimensions`, {
        method: 'POST',
        body: input,
      }),
    'authoring.instrument.failure.createDimension'
  )
}

function onCreateVersion(sourceVersionId?: string) {
  run(async () => {
    const created = await api<{ version: { id: string } }>(
      `/api/v1/assessment/instruments/${instrumentId.value}/versions`,
      { method: 'POST', body: sourceVersionId ? { sourceVersionId } : {} }
    )
    chosenVersionId.value = created.version.id
  }, 'authoring.instrument.failure.createVersion')
}

/* ------------------------------------------------------------------------------ translation --- */

/**
 * The target language of the translation tab. A separate piece of state from the UI locale on
 * purpose: an author working in the Indonesian interface is the ordinary case for producing the
 * English rendering, and tying the two together would make that impossible.
 */
const translationLocale = ref<TranslatableLocale>(TRANSLATABLE_LOCALES[0])

const { data: translationData, refresh: refreshTranslations } = await useAsyncData(
  `assessment-translations-${instrumentId.value}`,
  () =>
    api<InstrumentTranslations>(
      `/api/v1/assessment/instruments/${instrumentId.value}/translations/${translationLocale.value}`
    ),
  { watch: [translationLocale] }
)

function onSaveItemTranslation(input: { itemId: string; stem: string }) {
  void run(
    () =>
      api(`/api/v1/assessment/items/${input.itemId}/translations/${translationLocale.value}`, {
        method: 'PUT',
        body: { stem: input.stem },
      }),
    'authoring.instrument.failure.saveTranslation',
    refreshTranslations
  )
}

function onSaveScaleTranslation(input: {
  scaleId: string
  name: string
  points: { value: number; label: string }[]
}) {
  void run(
    () =>
      api(`/api/v1/assessment/scales/${input.scaleId}/translations/${translationLocale.value}`, {
        method: 'PUT',
        body: { name: input.name, points: input.points },
      }),
    'authoring.instrument.failure.saveTranslation',
    refreshTranslations
  )
}

function onSaveDimensionTranslation(input: { dimensionId: string; name: string }) {
  void run(
    () =>
      api(
        `/api/v1/assessment/dimensions/${input.dimensionId}/translations/${translationLocale.value}`,
        { method: 'PUT', body: { name: input.name, description: null } }
      ),
    'authoring.instrument.failure.saveTranslation',
    refreshTranslations
  )
}

function onSaveInstrumentTranslation(input: { name: string }) {
  void run(
    () =>
      api(
        `/api/v1/assessment/instruments/${instrumentId.value}/translations/${translationLocale.value}`,
        { method: 'PUT', body: { name: input.name, description: null } }
      ),
    'authoring.instrument.failure.saveTranslation',
    // Also the instrument read: the heading above this tab renders the instrument's name, so a
    // write that changes it must not leave the heading showing the previous one.
    () => Promise.all([refreshTranslations(), refreshInstrument()])
  )
}

/* -------------------------------------------------------------------------------- bulk paste --- */

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
    //
    // One request per row, each atomic in itself. A paste is still not atomic as a whole — row 8
    // failing leaves rows 1-7 saved — but each saved row is now a complete, selected item rather
    // than an orphaned bank entry holding its code hostage, so re-pasting the remainder works.
    // The message below says exactly that, because partial success is the honest outcome here.
    let position = items.value.length
    let done = 0
    try {
      for (const row of rows) {
        await createAndSelect({ code: row.code, stem: row.stem, scaleId, position })
        position += 1
        done += 1
      }
    } catch (error) {
      if (done > 0) {
        // Keep the unsaved remainder in the box so it can be corrected and re-pasted.
        pasteText.value = rows
          .slice(done)
          .map((row) => `${row.code}\t${row.stem}`)
          .join('\n')
      }
      throw error
    }
    pasteText.value = ''
  }, 'authoring.instrument.failure.bulkPaste')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Alert v-if="instrumentError" variant="destructive">
      <AlertTitle>{{ t('authoring.instrument.loadFailed') }}</AlertTitle>
    </Alert>

    <div v-else-if="instrumentPending" class="flex flex-col gap-2">
      <Skeleton v-for="n in 4" :key="n" class="h-12 rounded-lg" />
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-muted-foreground text-xs">
            <NuxtLink
              :to="localePath('/dashboard/assessment')"
              class="underline-offset-4 hover:underline"
            >
              {{ t('dashboard.nav.assessment-config') }}
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
          <Select
            :model-value="selectedVersionId ?? undefined"
            @update:model-value="chosenVersionId = String($event)"
          >
            <SelectTrigger size="sm" :aria-label="t('authoring.instrument.chooseVersion')">
              <SelectValue :placeholder="t('authoring.instrument.chooseVersion')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="v in versions" :key="v.id" :value="v.id">
                  v{{ v.versionNo }} — {{ t(`authoring.status.${v.status}`) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button v-if="!openVersion" size="sm" :disabled="busy" @click="onCreateVersion()">
            {{ t('authoring.instrument.newEmptyVersion') }}
          </Button>
          <Button
            v-if="!openVersion && version && frozen"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="onCreateVersion(version.id)"
          >
            {{ t('authoring.instrument.newVersionFrom', { version: version.versionNo }) }}
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
        {{
          t('authoring.instrument.openElsewhere', {
            version: openVersion.versionNo,
            status: t(`authoring.status.${openVersion.status}`),
          })
        }}
      </p>

      <Alert v-if="actionError" variant="destructive">
        <AlertTitle>{{ actionError }}</AlertTitle>
      </Alert>

      <div v-if="versionPending && !version" class="flex flex-col gap-2">
        <Skeleton v-for="n in 3" :key="n" class="h-10 rounded-lg" />
      </div>

      <template v-else-if="version">
        <!--
          A frozen version is visibly a different kind of object from a draft (#50): it says so in
          words, not by shading. Colour alone would fail WCAG 2.2 AA and is also just easy to miss.
        -->
        <Alert v-if="frozen" role="status">
          <AlertTitle>
            {{
              t('authoring.instrument.readOnly', {
                status: t(`authoring.status.${version.status}`),
              })
            }}
          </AlertTitle>
          <AlertDescription>{{ t('authoring.instrument.snapshotNotice') }}</AlertDescription>
        </Alert>
        <i18n-t
          v-else
          keypath="authoring.instrument.editable"
          tag="p"
          class="text-muted-foreground text-sm"
          scope="global"
        >
          <template #version>v{{ version.versionNo }}</template>
          <template #status>
            <Badge variant="secondary">{{ t(`authoring.status.${version.status}`) }}</Badge>
          </template>
        </i18n-t>

        <!--
          An instrument with no scale cannot hold an item, and one with no dimension cannot be
          published. Said here, with the way out, rather than discovered as a disabled button.
        -->
        <Alert v-if="bankIncomplete" role="status">
          <AlertTitle>{{ t('authoring.instrument.notReady') }}</AlertTitle>
          <AlertDescription>
            {{ !scaleCodes.length ? t('authoring.instrument.noScaleYet') : '' }}
            {{ !dimensions.length ? t('authoring.instrument.noDimensionYet') : '' }}
            <i18n-t keypath="authoring.instrument.createBothIn" scope="global">
              <template #tab>
                <Button variant="link" size="xs" class="px-0" @click="tab = 'bank'">
                  {{ t('authoring.instrument.tab.bank') }}
                </Button>
              </template>
            </i18n-t>
          </AlertDescription>
        </Alert>

        <!--
          reka-ui's Tabs is the APG tablist: roving tabindex, arrows to move, Home/End to the ends,
          focus following selection, and `aria-controls`/`aria-labelledby` wired between trigger and
          panel. That behaviour used to be forty lines of key handling and a ref map here, and
          promising `role="tablist"` obliges us to it either way.
        -->
        <Tabs v-model="tab">
          <TabsList :aria-label="t('authoring.instrument.tablistLabel')">
            <TabsTrigger v-for="entry in visibleTabs" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" class="flex flex-col gap-4">
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

            <DataCard v-if="!frozen" :title="t('authoring.instrument.bulkPasteToggle')" :level="3">
              <template #description>
                <i18n-t keypath="authoring.instrument.bulkPasteHint" scope="global">
                  <template #code
                    ><code>{{ t('authoring.bank.code').toLowerCase() }}</code></template
                  >
                </i18n-t>
              </template>

              <Field>
                <FieldLabel for="bulk-paste-input" class="sr-only">
                  {{ t('authoring.instrument.bulkPasteToggle') }}
                </FieldLabel>
                <Textarea
                  id="bulk-paste-input"
                  v-model="pasteText"
                  rows="6"
                  class="font-mono text-xs"
                  placeholder="kd01&#9;Saya membuat keputusan tanpa berkonsultasi."
                />
                <FieldDescription>
                  {{ t('authoring.instrument.bulkPasteReady', parsedPaste.rows.length) }}
                  <span v-if="parsedPaste.rejectedLines.length" class="text-destructive">
                    {{
                      t('authoring.instrument.bulkPasteRejected', {
                        lines: parsedPaste.rejectedLines.join(', '),
                      })
                    }}
                  </span>
                </FieldDescription>
              </Field>

              <template #footer>
                <Button size="sm" :disabled="!parsedPaste.rows.length || busy" @click="onBulkPaste">
                  {{ t('authoring.instrument.bulkPasteSubmit', parsedPaste.rows.length) }}
                </Button>
              </template>
            </DataCard>
          </TabsContent>

          <TabsContent value="matrix">
            <DimensionMatrix :items="items" :dimensions="dimensions" />
          </TabsContent>

          <TabsContent value="bank">
            <BankEditor
              :scales="instrumentData?.scales ?? []"
              :dimensions="dimensions"
              :busy="busy"
              @create-scale="onCreateScale"
              @create-dimension="onCreateDimension"
            />
          </TabsContent>

          <TabsContent value="translation">
            <TranslationEditor
              :locale="translationLocale"
              :instrument="instrumentData?.instrument ?? null"
              :items="items"
              :scales="instrumentData?.scales ?? []"
              :dimensions="dimensions"
              :translations="translationData ?? null"
              :busy="busy"
              @select-locale="translationLocale = $event"
              @save-item="onSaveItemTranslation"
              @save-scale="onSaveScaleTranslation"
              @save-dimension="onSaveDimensionTranslation"
              @save-instrument="onSaveInstrumentTranslation"
            />
          </TabsContent>

          <TabsContent value="review" class="flex flex-col gap-4">
            <div v-if="version.status === 'draft'" class="flex items-center gap-3">
              <Button size="sm" variant="outline" :disabled="busy" @click="onAdvanceToReview">
                {{ t('authoring.instrument.advanceToReview') }}
              </Button>
              <p class="text-muted-foreground text-xs">
                {{ t('authoring.publish.blocker.wrong-status') }}
              </p>
            </div>

            <PublishReview
              :version="version"
              :diff="diffData ?? null"
              :busy="busy"
              @publish="onPublish"
            />
          </TabsContent>
        </Tabs>
      </template>

      <p v-else-if="!versions.length" class="text-muted-foreground text-sm">
        {{ t('authoring.instrument.noVersions') }}
      </p>

      <Alert v-else variant="destructive">
        <AlertTitle>{{ t('authoring.instrument.versionLoadFailed') }}</AlertTitle>
      </Alert>
    </template>
  </div>
</template>
