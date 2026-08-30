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
useHead({ title: 'Persetujuan · Asesmen' })

interface PolicyDocument {
  policyId: string
  version: string
  required: boolean
  html: string
  accepted: boolean
}

const route = useRoute()
const versionId = computed(() => String(route.params.versionId))

const { data, pending, error } = await useFetch<{ documents: PolicyDocument[] }>(
  '/api/v1/consents',
  { key: 'consent-documents', retry: false }
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
    await $fetch('/api/v1/consents', {
      method: 'POST',
      body: { privacyNotice: true, researchParticipation: acceptResearch.value },
    })
    await navigateTo(`/assessment/${versionId.value}`)
  } catch {
    // The envelope's message is written for a developer; the student gets a sentence they can act
    // on. It never contains policy text or a hash.
    submitError.value = 'Persetujuan gagal disimpan. Coba lagi sebentar.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-space-6">
    <h1 class="text-ink-900 text-heading-lg font-semibold">Persetujuan</h1>

    <p v-if="error" class="text-destructive text-body-sm" role="alert">
      Tidak dapat memuat dokumen persetujuan. Asesmen tidak dapat dimulai sekarang.
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
        <h2 id="privacy-heading" class="sr-only">Pemberitahuan privasi</h2>
        <!--
          v-html is deliberate and decided in #72. The source is a Markdown file in this repo,
          authored by the Academic Lead and reviewed through PR, rendered to HTML server-side by
          `marked`. It is never runtime user input, so it does not carry the trust profile the
          rule below defends against, and a sanitizer would be weight against a threat that does
          not apply here. If policy text ever becomes editable outside a PR, this must change.
        -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="policy-prose text-body-700 text-body-md" v-html="mandatory.html" />
      </section>

      <section
        v-if="optional"
        class="border-border bg-surface rounded-lg border p-space-6"
        aria-labelledby="research-heading"
      >
        <h2 id="research-heading" class="sr-only">Partisipasi penelitian</h2>
        <!-- Same source and same reasoning as the notice above. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="policy-prose text-body-700 text-body-md" v-html="optional.html" />
      </section>

      <fieldset class="flex flex-col gap-space-4 border-0 p-0">
        <legend class="text-ink-900 text-body-md mb-space-2 font-semibold">
          Konfirmasi persetujuan
        </legend>

        <label class="flex min-h-11 cursor-pointer items-start gap-space-3">
          <input
            v-model="acceptPrivacy"
            type="checkbox"
            class="accent-primary-600 mt-space-1 size-5 shrink-0"
          >
          <span class="text-body-700 text-body-md">
            Saya telah membaca dan menyetujui pemberitahuan privasi asesmen ini.
          </span>
        </label>

        <label class="flex min-h-11 cursor-pointer items-start gap-space-3">
          <input
            v-model="acceptResearch"
            type="checkbox"
            class="accent-primary-600 mt-space-1 size-5 shrink-0"
          >
          <span class="text-body-700 text-body-md">
            (Opsional) Saya bersedia data saya dipakai untuk penelitian internal.
          </span>
        </label>
      </fieldset>

      <p v-if="submitError" class="text-destructive text-body-sm" role="alert">
        {{ submitError }}
      </p>

      <div class="flex flex-col gap-space-2">
        <Button :disabled="!acceptPrivacy || submitting" @click="accept">
          {{ submitting ? 'Menyimpan…' : 'Setuju dan mulai' }}
        </Button>
        <p class="text-muted-600 text-body-sm">
          Menyetujui pemberitahuan privasi diperlukan untuk memulai asesmen. Meninggalkan halaman
          ini berarti tidak menyetujui, dan tidak ada yang disimpan.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The policy documents are authored as markdown, so their headings and lists arrive as bare tags
 * with no utility classes to carry the type scale. Scoped to this container rather than added to
 * the global reset, which everything else on the site depends on staying as it is. */
.policy-prose :deep(h1) {
  font-size: var(--text-heading-md);
  font-weight: var(--font-semibold);
  margin-bottom: var(--space-4);
}
.policy-prose :deep(h2) {
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
