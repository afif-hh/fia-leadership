<script setup lang="ts">
/**
 * The consent gate (#59, #72). A full page on its own route, rendered before the first item.
 *
 * Two unticked checkboxes: the privacy notice is mandatory and gates `start`; research
 * participation is an optional opt-in whose refusal must be survivable, or it is not consent.
 *
 * **Leaving is declining.** There is no decline button, deliberately — a student who does not
 * consent simply navigates away, and nothing is recorded. Adding a "Tolak" button would imply a
 * stored refusal, which #59 ruled out: a refusal is the absence of a row.
 */
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

definePageMeta({ layout: 'assessment', middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('assessment.consent.title') }))

interface PolicyDocument {
  policyId: string
  version: string
  /** The language the document resolved to — Indonesian when this version has no translation. */
  locale: string
  required: boolean
  html: string
  accepted: boolean
}

const route = useRoute()
const versionId = computed(() => String(route.params.versionId))

const { data, pending, error } = await useFetch<{ documents: PolicyDocument[] }>(
  '/api/v1/consents',
  { key: 'consent-documents', retry: false, query: { locale } }
)

const documents = computed(() => data.value?.documents ?? [])
const mandatory = computed(() => documents.value.find((d) => d.required))
const optional = computed(() => documents.value.find((d) => !d.required))

// Both start unticked regardless of what is already on record: consent is an affirmative act, and
// pre-ticking a box collects it by default rather than by decision (#59).
const acceptPrivacy = ref(false)
const acceptResearch = ref(false)

const submitting = ref(false)
const submitError = ref('')

async function accept() {
  if (!acceptPrivacy.value || submitting.value) return
  submitting.value = true
  submitError.value = ''

  try {
    // One transaction on the server: either both rows land or neither does.
    // The same `locale` the documents above were fetched with, so the row records the language
    // that was on screen rather than a preference the server infers separately.
    await $fetch('/api/v1/consents', {
      method: 'POST',
      query: { locale: locale.value },
      body: { privacyNotice: true, researchParticipation: acceptResearch.value },
    })
    await navigateTo(localePath(`/assessment/${versionId.value}`))
  } catch {
    // The envelope's message is written for a developer; the student gets a sentence they can act
    // on. It never contains policy text or a hash.
    submitError.value = t('assessment.consent.saveFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-space-6">
    <h1 class="text-ink-900 text-heading-lg font-semibold">
      {{ t('assessment.consent.heading') }}
    </h1>

    <p v-if="error" class="text-destructive text-body-sm" role="alert">
      {{ t('assessment.consent.loadFailed') }}
    </p>

    <div v-else-if="pending" class="flex flex-col gap-space-3">
      <Skeleton v-for="n in 2" :key="n" class="h-40 rounded-lg" />
    </div>

    <template v-else>
      <section
        v-if="mandatory"
        class="border-border bg-surface rounded-lg border p-space-6"
        aria-labelledby="privacy-heading"
      >
        <h2 id="privacy-heading" class="sr-only">{{ t('assessment.consent.privacyHeading') }}</h2>
        <!--
          v-html is deliberate and decided in #72. The source is a Markdown file in this repo,
          authored by the Academic Lead and reviewed through PR, rendered to HTML server-side by
          `marked`. It is never runtime user input, so it does not carry the trust profile the
          rule below defends against, and a sanitizer would be weight against a threat that does
          not apply here. If policy text ever becomes editable outside a PR, this must change.
        -->
        <!--
          `lang` is the document's own language, not the page's. A version with no translation
          falls back to Indonesian, and without this a screen reader would read that Indonesian
          prose in an English voice.
        -->
        <div class="policy-prose text-body-700 text-body-md" :lang="mandatory.locale">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-html="mandatory.html" />
        </div>
      </section>

      <section
        v-if="optional"
        class="border-border bg-surface rounded-lg border p-space-6"
        aria-labelledby="research-heading"
      >
        <h2 id="research-heading" class="sr-only">{{ t('assessment.consent.researchHeading') }}</h2>
        <!-- Same source and same reasoning as the notice above. -->
        <div class="policy-prose text-body-700 text-body-md" :lang="optional.locale">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-html="optional.html" />
        </div>
      </section>

      <!--
        Said outright when the text on screen is not in the reader's language. Consent to a
        document you cannot read is not consent, so a fallback must be visible rather than
        inferred from the prose looking unfamiliar.
      -->
      <p
        v-if="mandatory && mandatory.locale !== locale"
        class="border-border bg-surface text-body-700 text-body-sm rounded-lg border p-space-4"
        role="status"
      >
        {{ t('assessment.consent.untranslated') }}
      </p>

      <fieldset class="flex flex-col gap-space-4 border-0 p-0">
        <legend class="text-ink-900 text-body-md mb-space-2 font-semibold">
          {{ t('assessment.consent.confirmLegend') }}
        </legend>

        <label class="flex min-h-11 cursor-pointer items-start gap-space-3">
          <input
            v-model="acceptPrivacy"
            type="checkbox"
            class="accent-primary-600 mt-space-1 size-5 shrink-0"
          >
          <span class="text-body-700 text-body-md">
            {{ t('assessment.consent.acceptPrivacy') }}
          </span>
        </label>

        <label class="flex min-h-11 cursor-pointer items-start gap-space-3">
          <input
            v-model="acceptResearch"
            type="checkbox"
            class="accent-primary-600 mt-space-1 size-5 shrink-0"
          >
          <span class="text-body-700 text-body-md">
            {{ t('assessment.consent.acceptResearch') }}
          </span>
        </label>
      </fieldset>

      <p v-if="submitError" class="text-destructive text-body-sm" role="alert">
        {{ submitError }}
      </p>

      <div class="flex flex-col gap-space-2">
        <Button :disabled="!acceptPrivacy || submitting" @click="accept">
          {{ submitting ? t('assessment.consent.saving') : t('assessment.consent.agreeAndStart') }}
        </Button>
        <p class="text-muted-600 text-body-sm">
          {{ t('assessment.consent.leavingIsDeclining') }}
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The policy documents are authored as markdown, so their headings and lists arrive as bare tags
 * with no utility classes to carry the type scale. Scoped to this container rather than added to
 * the global reset, which everything else on the site depends on staying as it is.
 *
 * h3/h4 rather than h1/h2: `renderPolicyHtml` pushes each document's headings two levels down so
 * the page keeps a single <h1>. A document's own `#` therefore arrives here as <h3>. */
.policy-prose :deep(h3) {
  font-size: var(--text-heading-md);
  font-weight: var(--font-semibold);
  margin-bottom: var(--space-4);
}
.policy-prose :deep(h4) {
  font-size: var(--text-heading-sm);
  font-weight: var(--font-semibold);
  margin-top: var(--space-6);
  margin-bottom: var(--space-2);
}
.policy-prose :deep(p) {
  margin-bottom: var(--space-3);
}
.policy-prose :deep(ul) {
  list-style: disc;
  padding-left: var(--space-6);
  margin-bottom: var(--space-3);
}
.policy-prose :deep(strong) {
  font-weight: var(--font-semibold);
}
</style>
