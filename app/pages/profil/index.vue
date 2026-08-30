<script setup lang="ts">
/**
 * The student's leadership profile — the first screen in this product that shows a score.
 *
 * Everything here is rendered as text and tables, and that is the deliverable rather than a
 * placeholder for a chart. `kdpgk-v1.md` requires a text equivalent for every visual, and
 * WCAG 2.2 AA means the table is the accessible artefact a radar chart would have to be
 * *accompanied* by. The chart belongs to the Leadership Profile effort; the numbers do not depend
 * on it, and a student can read their whole result without one.
 *
 * The disclaimer is not optional decoration. `kdpgk-v1.md` requires it on every output, and while
 * `validity-log.md` holds KDPGK v1 at `draft` it also has to say that the instrument is
 * unvalidated — so the copy says both, once, above the numbers rather than in a footnote below
 * them.
 *
 * Dimension, band and quadrant names are rendered here from `i18n/locales/`, never sent by the
 * API. The report stores codes, so a translation added later cannot appear to change a frozen
 * result (ADR-009).
 */
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface DimensionScore {
  code: string
  score: number
}

interface ScoreReport {
  assessmentVersionId: string
  scoringVersionId: string
  overall: { score: number; band: string }
  domains: DimensionScore[]
  styles: DimensionScore[]
  dominant: { primary: string; secondary: string | null; hybrid: boolean }
  grid: { task: number; people: number; quadrant: string } | null
  strengths: string[]
  developmentPriorities: string[]
}

interface ProfileResponse {
  profile: {
    snapshotId: string
    scoreRunId: string
    createdAt: string
    assessmentVersionId: string
    scoringVersionId: string
    report: ScoreReport
  } | null
  assessment: { instrumentName: string; versionNo: number } | null
  awaitingScore: boolean
}

definePageMeta({ layout: 'assessment', middleware: 'auth' })

const { t, te, locale } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('profile.title') }))

const { data, pending, error } = await useFetch<ProfileResponse>('/api/v1/profiles/me', {
  key: 'profile-me',
  retry: false,
})

const report = computed(() => data.value?.profile?.report ?? null)

/**
 * An unknown code renders as itself rather than as a missing-key string, which is what a dimension
 * added to an instrument before its translation lands should look like. The alternative shows the
 * student a blank cell where a score has a name.
 */
function dimensionName(code: string): string {
  return te(`dimensions.${code}`) ? t(`dimensions.${code}`) : code
}

function bandName(code: string): string {
  return te(`bands.${code}`) ? t(`bands.${code}`) : code
}

function quadrantName(code: string): string {
  return te(`quadrants.${code}`) ? t(`quadrants.${code}`) : code
}

const scoredAt = computed(() => {
  const iso = data.value?.profile?.createdAt
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso))
})
</script>

<template>
  <div class="flex flex-col gap-space-8">
    <h1 class="text-ink-900 text-heading-lg font-semibold">{{ t('profile.heading') }}</h1>

    <div v-if="pending" class="flex flex-col gap-space-4">
      <Skeleton class="h-24 rounded-xl" />
      <Skeleton class="h-64 rounded-xl" />
    </div>

    <p v-else-if="error" class="text-body-700 text-body-md">{{ t('profile.loadFailed') }}</p>

    <template v-else-if="!report">
      <p class="text-body-700 text-body-md">
        {{ data?.awaitingScore ? t('profile.pending') : t('profile.empty') }}
      </p>
      <Button as="a" :href="localePath('/assessment')">{{ t('profile.emptyAction') }}</Button>
    </template>

    <template v-else>
      <!--
        Above the numbers, not below them. A caveat a reader meets after forming an impression of
        their own score has already failed at the thing it exists to do.
      -->
      <p
        class="border-border bg-surface text-body-700 text-body-sm rounded-lg border p-space-4"
        data-testid="score-disclaimer"
      >
        {{ t('profile.disclaimer') }}
      </p>

      <p v-if="data?.assessment" class="text-body-700 text-body-sm">
        {{
          t('profile.sourceLine', {
            instrument: data.assessment.instrumentName,
            version: data.assessment.versionNo,
            date: scoredAt,
          })
        }}
      </p>

      <section aria-labelledby="overall-heading" class="flex flex-col gap-space-2">
        <h2 id="overall-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.overallHeading') }}
        </h2>
        <p class="text-ink-900 text-display-sm font-semibold">
          {{ t('profile.overallValue', { score: report.overall.score }) }}
        </p>
        <p class="text-body-700 text-body-md">
          {{ t('profile.bandLabel') }}: <strong>{{ bandName(report.overall.band) }}</strong>
        </p>
      </section>

      <section aria-labelledby="dominant-heading" class="flex flex-col gap-space-2">
        <h2 id="dominant-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.dominantHeading') }}
        </h2>
        <p class="text-body-700 text-body-md">
          {{ t('profile.dominantPrimary') }}:
          <strong>{{ dimensionName(report.dominant.primary) }}</strong>
        </p>
        <p v-if="report.dominant.secondary" class="text-body-700 text-body-md">
          {{ t('profile.dominantSecondary') }}:
          <strong>{{ dimensionName(report.dominant.secondary) }}</strong>
        </p>
        <p v-if="report.dominant.hybrid" class="text-body-700 text-body-sm">
          {{ t('profile.hybrid') }}
        </p>
      </section>

      <section aria-labelledby="styles-heading" class="flex flex-col gap-space-3">
        <h2 id="styles-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.stylesHeading') }}
        </h2>
        <!-- `overflow-x-auto` so a long dimension name never makes the page itself scroll. -->
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="border-border border-b">
                <th scope="col" class="text-ink-900 text-label-md py-space-2 font-semibold">
                  {{ t('profile.dimensionColumn') }}
                </th>
                <th scope="col" class="text-ink-900 text-label-md py-space-2 font-semibold">
                  {{ t('profile.scoreColumn') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="style in report.styles" :key="style.code" class="border-border border-b">
                <th scope="row" class="text-body-700 text-body-md py-space-2 font-normal">
                  {{ dimensionName(style.code) }}
                </th>
                <td class="text-ink-900 text-body-md py-space-2">{{ style.score }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="domains-heading" class="flex flex-col gap-space-3">
        <h2 id="domains-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.domainsHeading') }}
        </h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="border-border border-b">
                <th scope="col" class="text-ink-900 text-label-md py-space-2 font-semibold">
                  {{ t('profile.dimensionColumn') }}
                </th>
                <th scope="col" class="text-ink-900 text-label-md py-space-2 font-semibold">
                  {{ t('profile.scoreColumn') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="domain in report.domains"
                :key="domain.code"
                class="border-border border-b"
              >
                <th scope="row" class="text-body-700 text-body-md py-space-2 font-normal">
                  {{ dimensionName(domain.code) }}
                </th>
                <td class="text-ink-900 text-body-md py-space-2">{{ domain.score }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="grid-heading" class="flex flex-col gap-space-2">
        <h2 id="grid-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.gridHeading') }}
        </h2>
        <template v-if="report.grid">
          <p class="text-body-700 text-body-md">
            {{ t('profile.gridSummary', { task: report.grid.task, people: report.grid.people }) }}
          </p>
          <p class="text-body-700 text-body-md">
            {{ t('profile.quadrantLabel') }}:
            <strong>{{ quadrantName(report.grid.quadrant) }}</strong>
          </p>
        </template>
        <p v-else class="text-body-700 text-body-md">{{ t('profile.gridNone') }}</p>
      </section>

      <section aria-labelledby="strengths-heading" class="flex flex-col gap-space-2">
        <h2 id="strengths-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.strengthsHeading') }}
        </h2>
        <ul class="text-body-700 text-body-md list-disc pl-space-5">
          <li v-for="code in report.strengths" :key="code">{{ dimensionName(code) }}</li>
        </ul>
      </section>

      <section aria-labelledby="priorities-heading" class="flex flex-col gap-space-2">
        <h2 id="priorities-heading" class="text-ink-900 text-heading-md font-semibold">
          {{ t('profile.prioritiesHeading') }}
        </h2>
        <ul class="text-body-700 text-body-md list-disc pl-space-5">
          <li v-for="code in report.developmentPriorities" :key="code">
            {{ dimensionName(code) }}
          </li>
        </ul>
        <!-- PRD's "developmental, bukan vonis" made literal, next to the list it applies to. -->
        <p class="text-body-700 text-body-sm">{{ t('profile.prioritiesNote') }}</p>
      </section>
    </template>
  </div>
</template>
