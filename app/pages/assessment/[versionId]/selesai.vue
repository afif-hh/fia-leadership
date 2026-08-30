<script setup lang="ts">
/**
 * The screen after submit (#62). A plain confirmation, and deliberately nothing more.
 *
 * Four things are absent on purpose, each decided rather than forgotten:
 *
 * - **No score disclaimer.** kdpgk-v1.md requires it on every *output*; this page renders no
 *   number, so there is nothing for it to guard against. The profile page, which does render
 *   numbers, carries it.
 * - **No score.** The result lives one click away rather than here, because this page is the
 *   receipt for an act the student just performed and a score is a different thing to absorb.
 * - **No onward links beyond the profile.** Modules, simulations and development goals are not
 *   built; a link to nothing is worse than no link.
 * - **No re-read of the answers.** A raw Likert response set means little without a score, so
 *   reviewing it belongs to the result-page effort, which is out of this map's scope.
 */
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'assessment', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('assessment.done.title') }))
</script>

<template>
  <div class="flex flex-col items-start gap-space-6">
    <h1 class="text-ink-900 text-heading-lg font-semibold">{{ t('assessment.done.heading') }}</h1>

    <p class="text-body-700 text-body-md">
      {{ t('assessment.done.body') }}
    </p>

    <div class="flex flex-wrap gap-space-3">
      <!--
        The profile link is unconditional, and the page it leads to decides what to say. Scoring
        runs inline with the submit, so in the ordinary case a result is already waiting; when a
        version has no approved formula there is none, and only the profile page can tell which.
        Branching here would mean this page guessing at a state it does not hold.
      -->
      <Button as="a" :href="localePath('/profil')">{{ t('assessment.done.viewProfile') }}</Button>
      <Button as="a" variant="outline" :href="localePath('/assessment')">
        {{ t('assessment.done.backToList') }}
      </Button>
    </div>
  </div>
</template>
