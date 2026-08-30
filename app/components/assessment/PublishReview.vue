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
import {
  publishGate,
  type PublishBlocker,
  type VersionDetail,
  type VersionDiff,
} from '@/lib/assessment-authoring'

const props = defineProps<{
  version: VersionDetail | null
  diff: VersionDiff | null
  /** Set while the publish request is in flight, so the button cannot be pressed twice. */
  busy?: boolean
}>()

const emit = defineEmits<{ publish: [] }>()

const { t } = useI18n()

const acknowledged = ref(false)

const gate = computed(() =>
  publishGate({ version: props.version, diff: props.diff, acknowledged: acknowledged.value })
)

/** Blockers other than the acknowledgement, which is the author's own step rather than a fault. */
const faults = computed(() => gate.value.blockers.filter((b) => b.code !== 'not-acknowledged'))

/**
 * A blocker carries facts, not prose (`publishGate`). The union is exhausted here so a new blocker
 * code cannot reach the screen without a message written for it.
 */
function blockerMessage(blocker: PublishBlocker): string {
  switch (blocker.code) {
    case 'frozen':
      return t(`authoring.publish.blocker.frozen.${blocker.status}`)
    case 'unmapped-items':
      return t('authoring.publish.blocker.unmappedItems', {
        count: blocker.itemCodes.length,
        codes: blocker.itemCodes.join(', '),
      })
    default:
      return t(`authoring.publish.blocker.${blocker.code}`)
  }
}

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
    <h2 id="publish-review-heading" class="text-base font-medium">
      {{ t('authoring.publish.heading') }}
    </h2>

    <p v-if="!version" class="text-muted-foreground text-sm">
      {{ t('authoring.publish.notLoaded') }}
    </p>

    <template v-else>
      <p v-if="diff?.blank" class="text-muted-foreground text-sm">
        {{ t('authoring.publish.noSource') }}
      </p>

      <!-- The drift, verbatim. This block is why the review screen exists (#49). -->
      <section
        v-if="stemChanged.length"
        aria-labelledby="stem-drift-heading"
        class="flex flex-col gap-2"
      >
        <h3 id="stem-drift-heading" class="text-sm font-medium">
          {{ t('authoring.publish.stemDriftHeading', { count: stemChanged.length }) }}
        </h3>
        <p class="text-muted-foreground text-xs">
          {{ t('authoring.publish.stemDriftLead') }}
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
            <p class="text-muted-foreground mt-1 text-xs">{{ t('authoring.publish.before') }}</p>
            <p class="text-sm">{{ change.before }}</p>
            <p class="text-muted-foreground mt-1 text-xs">{{ t('authoring.publish.after') }}</p>
            <p class="text-sm font-medium">{{ change.after }}</p>
          </li>
        </ul>
      </section>

      <section
        v-if="hasStructuralChange"
        aria-labelledby="structural-heading"
        class="flex flex-col gap-1"
      >
        <h3 id="structural-heading" class="text-sm font-medium">
          {{ t('authoring.publish.structuralHeading') }}
        </h3>
        <ul class="text-sm">
          <li v-for="row in diff?.added ?? []" :key="`a-${row.itemId}`">
            {{ t('authoring.publish.added') }}:
            <span class="font-mono text-xs">{{ row.code }}</span>
          </li>
          <li v-for="row in diff?.removed ?? []" :key="`r-${row.itemId}`">
            {{ t('authoring.publish.removed') }}:
            <span class="font-mono text-xs">{{ row.code }}</span>
          </li>
          <li v-for="row in diff?.moved ?? []" :key="`m-${row.itemId}`">
            {{ t('authoring.publish.moved') }}:
            <span class="font-mono text-xs">{{ row.code }}</span>
            {{ t('authoring.publish.movedRange', { from: row.from, to: row.to }) }}
          </li>
          <li v-for="row in diff?.reverseCodingChanged ?? []" :key="`v-${row.itemId}`">
            {{ t('authoring.change.reverseCoding') }}:
            <span class="font-mono text-xs">{{ row.code }}</span>
            {{ t(row.from ? 'common.yes' : 'common.no') }} →
            {{ t(row.to ? 'common.yes' : 'common.no') }}
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
          {{ t('authoring.publish.blockedHeading') }}
        </h3>
        <ul class="text-destructive mt-1 text-sm">
          <li v-for="blocker in faults" :key="blocker.code">{{ blockerMessage(blocker) }}</li>
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
        <i18n-t keypath="authoring.publish.acknowledge" tag="span" scope="global">
          <template #changes>
            <span class="font-medium">{{
              t('authoring.publish.changeCount', gate.changeCount)
            }}</span>
          </template>
        </i18n-t>
      </label>

      <div class="flex items-center gap-3">
        <Button
          :disabled="!gate.armed || busy"
          data-testid="publish-button"
          @click="emit('publish')"
        >
          {{ busy ? t('authoring.publish.publishing') : t('authoring.publish.publish') }}
        </Button>
        <!-- Why the button is disabled, in text next to it. A disabled control with no stated
             reason is the failure this replaces. -->
        <p v-if="!gate.armed" class="text-muted-foreground text-xs">
          {{
            t(faults.length ? 'authoring.publish.clearFaultsFirst' : 'authoring.publish.tickToArm')
          }}
        </p>
      </div>

      <p class="text-muted-foreground text-xs">
        {{ t('authoring.publish.immutableNotice') }}
      </p>
    </template>
  </section>
</template>
