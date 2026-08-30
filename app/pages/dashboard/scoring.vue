<script setup lang="ts">
/**
 * Scoring configuration — the last clause of FR-004, and the surface the dashboard rail has
 * carried as "Nanti" since #22.
 *
 * Maps to the **Scoring Rules** row of rbac.md, whose two cells belong to two different roles:
 * Lab Admin `Draft`, Academic Lead `Approve`. That split is what `/CLAUDE.md` rule 1 rests on, so
 * this page renders both halves and lets the server refuse whichever the viewer does not hold. The
 * buttons are not a permission check — hiding one would be convenience, and the route is the
 * boundary (CLAUDE.md rule 6).
 *
 * There is deliberately **no edit form for an existing scoring version.** An approved one is
 * frozen by trigger, and a draft's weights are written with it in one transaction; a change means
 * a new draft. Offering an edit box that the API has no endpoint for would be a lie in the shape
 * of a form.
 */
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, te, locale } = useI18n()

useHead(() => ({ title: t('authoring.scoring.title') }))

interface Instrument {
  id: string
  code: string
  name: string
}

interface Dimension {
  id: string
  code: string
  name: string
  kind: 'domain' | 'style' | 'axis'
}

interface Version {
  id: string
  versionNo: number
  status: 'draft' | 'review' | 'published' | 'retired'
}

interface ScoringVersion {
  id: string
  scoringNo: number
  status: 'draft' | 'approved' | 'retired'
  bands: { code: string; min: number }[]
  weights: { dimensionId: string; dimensionCode: string; weight: number }[]
}

/**
 * The viewer's roles, used only to decide which half of the workflow to render.
 *
 * A projection of the access matrix, the same way the dashboard rail is — not a permission check.
 * The server refuses whichever action the viewer does not hold regardless, and it is the only
 * thing that does (CLAUDE.md rule 6). What this buys is that an Academic Lead is not shown a
 * twenty-field form that would fail on submit every time.
 */
const { data: me } = await useFetch<{ roles: string[] }>('/api/v1/me', {
  key: 'scoring-me',
  retry: false,
})
const canDraft = computed(() => (me.value?.roles ?? []).includes('lab_admin'))
const canApprove = computed(() => (me.value?.roles ?? []).includes('academic_lead'))

const { data: instrumentList, error: instrumentsError } = await useFetch<{
  instruments: Instrument[]
}>('/api/v1/assessment/instruments', {
  key: 'scoring-instruments',
  retry: false,
  query: { locale },
})

const instruments = computed(() => instrumentList.value?.instruments ?? [])

/**
 * Seeded synchronously from the awaited list, not from a watcher.
 *
 * A watcher looked equivalent and was not: it assigns before the dependent `useFetch` below has
 * registered its own watch, so the first value counts as no change and the detail request never
 * fires — the page renders an instrument picker and nothing else. Awaiting the list first makes
 * the initial value available here, which is what lets that request be `immediate`.
 */
const instrumentId = ref(instruments.value[0]?.id ?? '')

const { data: detail, error: detailError } = await useFetch<{
  versions: Version[]
  dimensions: Dimension[]
}>(() => `/api/v1/assessment/instruments/${instrumentId.value}`, {
  key: 'scoring-instrument-detail',
  retry: false,
  query: { locale },
  immediate: Boolean(instrumentId.value),
  watch: [instrumentId],
})

/**
 * Only a published or retired version can carry a formula: the weights address the dimension codes
 * that version froze at publish, and before that there is nothing stable to address. A retired one
 * stays in the list because it still has scores to explain.
 */
const scorableVersions = computed(() =>
  (detail.value?.versions ?? []).filter((v) => v.status === 'published' || v.status === 'retired')
)
const dimensions = computed(() => detail.value?.dimensions ?? [])
const axes = computed(() => dimensions.value.filter((d) => d.kind === 'axis'))

/** Seeded synchronously for the same reason `instrumentId` is; see the note there. The watcher
 * below only handles a later change of instrument. */
const versionId = ref(scorableVersions.value[0]?.id ?? '')
watch(scorableVersions, (list) => {
  if (list.every((v) => v.id !== versionId.value)) versionId.value = list[0]?.id ?? ''
})

const {
  data: scoringData,
  pending,
  error: scoringError,
  refresh,
} = await useFetch<{ scoringVersions: ScoringVersion[] }>(
  () => `/api/v1/assessment/versions/${versionId.value}/scoring`,
  {
    key: 'scoring-versions',
    retry: false,
    immediate: Boolean(versionId.value),
    watch: [versionId],
  }
)

const scoringVersions = computed(() => scoringData.value?.scoringVersions ?? [])

/** The four band codes are ADR-010's, and this page changes thresholds rather than inventing
 * bands: a fifth band is a formula change, not a form field. */
const BAND_CODES = ['emerging', 'developing', 'established', 'advanced'] as const
const bandMinimums = ref<Record<string, number>>({
  emerging: 0,
  developing: 40,
  established: 60,
  advanced: 80,
})

const weights = ref<Record<string, number>>({})
watch(
  dimensions,
  (list) => {
    // Every dimension gets a row, defaulted to 1. A dimension the version measures but the formula
    // omits is refused by the engine, so a blank grid would only produce a confusing 422 later.
    weights.value = Object.fromEntries(list.map((d) => [d.id, weights.value[d.id] ?? 1]))
  },
  { immediate: true }
)

const taskAxisId = ref('')
const peopleAxisId = ref('')
watch(
  axes,
  (list) => {
    taskAxisId.value = list.find((d) => d.code === 'concern_for_task')?.id ?? ''
    peopleAxisId.value = list.find((d) => d.code === 'concern_for_people')?.id ?? ''
  },
  { immediate: true }
)

const creating = ref(false)
const formError = ref('')
const actionError = ref('')

const loadFailed = computed(() =>
  Boolean(instrumentsError.value || detailError.value || scoringError.value)
)

/** 403 is its own sentence; everything else falls back to the caller's. */
function messageFor(error: unknown, fallbackKey: string): string {
  const status =
    (error as { statusCode?: number; status?: number } | null)?.statusCode ??
    (error as { status?: number } | null)?.status
  return status === 403 ? t('authoring.scoring.notAllowed') : t(fallbackKey)
}

async function createDraft() {
  if (!versionId.value) return
  creating.value = true
  formError.value = ''
  try {
    await $fetch(`/api/v1/assessment/versions/${versionId.value}/scoring`, {
      method: 'POST',
      body: {
        bands: BAND_CODES.map((code) => ({ code, min: Number(bandMinimums.value[code] ?? 0) })),
        weights: dimensions.value.map((d) => ({
          dimensionId: d.id,
          weight: Number(weights.value[d.id] ?? 1),
        })),
        // Both axes or neither, which is the same pairing the CHECK holds. A grid with one
        // coordinate is not a grid.
        taskAxisDimensionId: taskAxisId.value || null,
        peopleAxisDimensionId: taskAxisId.value ? peopleAxisId.value || null : null,
      },
    })
    await refresh()
  } catch (error) {
    // The envelope's message is written for a developer. The author gets a sentence naming the
    // thing they can actually fix — and a refusal is told apart from a conflict, because
    // "you may not do this" and "something already exists" ask for different next steps.
    formError.value = messageFor(error, 'authoring.scoring.createFailed')
  } finally {
    creating.value = false
  }
}

async function act(scoringVersionId: string, action: 'approve' | 'retire') {
  actionError.value = ''
  try {
    await $fetch(`/api/v1/assessment/scoring-versions/${scoringVersionId}/${action}`, {
      method: 'POST',
    })
    await refresh()
  } catch (error) {
    actionError.value = messageFor(error, 'authoring.scoring.actionFailed')
  }
}

/**
 * The stored band table, read as a sentence.
 *
 * Translated through `bands.*` like every other code on this page and on the profile screen. It
 * printed the raw code until a review caught it, which made one column of this table the only
 * place in the product where a reader met `established` untranslated.
 */
function bandSummary(bands: ScoringVersion['bands']): string {
  return [...bands]
    .sort((a, b) => a.min - b.min)
    .map(
      (band) => `${te(`bands.${band.code}`) ? t(`bands.${band.code}`) : band.code} ≥ ${band.min}`
    )
    .join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted-foreground text-sm">{{ t('authoring.scoring.lead') }}</p>

    <p v-if="loadFailed" class="text-destructive text-sm" role="alert">
      {{ t('authoring.scoring.loadFailed') }}
    </p>

    <template v-else>
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-sm">
          {{ t('authoring.scoring.instrumentLabel') }}
          <select
            v-model="instrumentId"
            class="border-border bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option v-for="instrument in instruments" :key="instrument.id" :value="instrument.id">
              {{ instrument.name }}
            </option>
          </select>
        </label>

        <label v-if="scorableVersions.length" class="flex flex-col gap-1 text-sm">
          {{ t('authoring.scoring.versionLabel') }}
          <select
            v-model="versionId"
            class="border-border bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option v-for="version in scorableVersions" :key="version.id" :value="version.id">
              v{{ version.versionNo }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="!scorableVersions.length" class="text-muted-foreground text-sm">
        {{ t('authoring.scoring.noVersions') }}
      </p>

      <template v-else>
        <section aria-labelledby="scoring-existing-heading" class="flex flex-col gap-2">
          <h2 id="scoring-existing-heading" class="text-base font-medium">
            {{ t('authoring.scoring.existingHeading') }}
          </h2>

          <div v-if="pending" class="flex flex-col gap-2">
            <Skeleton v-for="n in 2" :key="n" class="h-12 rounded-lg" />
          </div>

          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-border border-b text-left">
                  <th scope="col" class="py-2 font-medium">{{ t('authoring.scoring.colNo') }}</th>
                  <th scope="col" class="py-2 font-medium">
                    {{ t('authoring.scoring.colStatus') }}
                  </th>
                  <th scope="col" class="py-2 font-medium">
                    {{ t('authoring.scoring.colBands') }}
                  </th>
                  <th scope="col" class="py-2 font-medium">
                    {{ t('authoring.scoring.colWeights') }}
                  </th>
                  <th scope="col" class="py-2 font-medium">
                    <span class="sr-only">{{ t('authoring.scoring.colActions') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!scoringVersions.length">
                  <td colspan="5" class="text-muted-foreground py-3">
                    {{ t('authoring.scoring.none') }}
                  </td>
                </tr>
                <tr
                  v-for="scoring in scoringVersions"
                  :key="scoring.id"
                  class="border-border border-b"
                >
                  <th scope="row" class="py-2 font-normal">{{ scoring.scoringNo }}</th>
                  <td class="py-2">{{ t(`authoring.scoring.status.${scoring.status}`) }}</td>
                  <td class="py-2 font-mono text-xs">{{ bandSummary(scoring.bands) }}</td>
                  <td class="py-2">{{ scoring.weights.length }}</td>
                  <td class="py-2 text-right">
                    <Button
                      v-if="canApprove && scoring.status === 'draft'"
                      size="sm"
                      @click="act(scoring.id, 'approve')"
                    >
                      {{ t('authoring.scoring.approve') }}
                    </Button>
                    <Button
                      v-else-if="canApprove && scoring.status === 'approved'"
                      size="sm"
                      variant="outline"
                      @click="act(scoring.id, 'retire')"
                    >
                      {{ t('authoring.scoring.retire') }}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-muted-foreground text-xs">{{ t('authoring.scoring.approvalWarning') }}</p>
          <p v-if="actionError" class="text-destructive text-xs" role="alert">{{ actionError }}</p>
        </section>

        <section
          v-if="canDraft"
          aria-labelledby="scoring-draft-heading"
          class="flex flex-col gap-4"
        >
          <h2 id="scoring-draft-heading" class="text-base font-medium">
            {{ t('authoring.scoring.draftHeading') }}
          </h2>
          <p class="text-muted-foreground text-sm">{{ t('authoring.scoring.draftNote') }}</p>

          <fieldset class="flex flex-col gap-2">
            <legend class="pb-1 text-sm font-medium">
              {{ t('authoring.scoring.bandsHeading') }}
            </legend>
            <div class="flex flex-wrap gap-3">
              <label v-for="code in BAND_CODES" :key="code" class="flex flex-col gap-1 text-xs">
                {{ t(`bands.${code}`) }}
                <Input
                  v-model.number="bandMinimums[code]"
                  type="number"
                  min="0"
                  max="100"
                  :aria-label="t('authoring.scoring.bandMinLabel', { band: t(`bands.${code}`) })"
                  class="h-9 w-24"
                />
              </label>
            </div>
          </fieldset>

          <fieldset class="flex flex-col gap-2">
            <legend class="pb-1 text-sm font-medium">
              {{ t('authoring.scoring.weightsHeading') }}
            </legend>
            <p class="text-muted-foreground text-xs">{{ t('authoring.scoring.weightHint') }}</p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label
                v-for="dimension in dimensions"
                :key="dimension.id"
                class="flex items-center justify-between gap-2 text-xs"
              >
                <span>{{ dimension.name }}</span>
                <Input
                  v-model.number="weights[dimension.id]"
                  type="number"
                  min="0"
                  step="0.1"
                  :aria-label="t('authoring.scoring.weightLabel', { dimension: dimension.name })"
                  class="h-9 w-20"
                />
              </label>
            </div>
          </fieldset>

          <fieldset v-if="axes.length" class="flex flex-wrap gap-4">
            <legend class="pb-1 text-sm font-medium">Blake-Mouton</legend>
            <label class="flex flex-col gap-1 text-xs">
              {{ t('authoring.scoring.taskAxisLabel') }}
              <select
                v-model="taskAxisId"
                class="border-border bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="">{{ t('authoring.scoring.axisNone') }}</option>
                <option v-for="axis in axes" :key="axis.id" :value="axis.id">
                  {{ axis.name }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
              {{ t('authoring.scoring.peopleAxisLabel') }}
              <select
                v-model="peopleAxisId"
                class="border-border bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="">{{ t('authoring.scoring.axisNone') }}</option>
                <option v-for="axis in axes" :key="axis.id" :value="axis.id">
                  {{ axis.name }}
                </option>
              </select>
            </label>
          </fieldset>

          <div class="flex items-center gap-3">
            <Button :disabled="creating || !dimensions.length" @click="createDraft">
              {{ creating ? t('authoring.scoring.submitting') : t('authoring.scoring.submit') }}
            </Button>
            <p v-if="formError" class="text-destructive text-xs" role="alert">{{ formError }}</p>
          </div>
        </section>

        <p v-else class="text-muted-foreground text-sm">
          {{ t('authoring.scoring.draftElsewhere') }}
        </p>
      </template>
    </template>
  </div>
</template>
