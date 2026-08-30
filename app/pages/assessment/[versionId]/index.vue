<script setup lang="ts">
/**
 * The answering screen (#60), where Completion Rate is won or lost.
 *
 * Layout settled by prototype — variants A (one item per screen) and C (blocks of three) were
 * built and discarded; see branch `prototype/answering-screen`. What survived: one long scrolling
 * page, every item at once in flat `position` order, free navigation through a jump map, and a
 * sticky bar carrying progress and submit.
 *
 * Accessibility here is not decoration; it is the research on #63 made concrete. A `<fieldset>`
 * per question with the stem as `<legend>` and **native radios** — not an ARIA `radiogroup`, not
 * shadcn's `RadioGroup`, both of which were considered and rejected there. The saved indicator is
 * one shared, debounced `role="status"`, never assertive and never one region per item.
 *
 * SC 2.4.3's focus-to-container-on-paging clause deliberately does **not** apply: it was written
 * for a paginated design and there is no paging here (#60).
 */
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssessmentSession } from '@/composables/useAssessmentSession'

definePageMeta({ layout: 'assessment', middleware: 'auth' })

/**
 * `scroll-padding-bottom` has to sit on the **scroll container**, which is `<html>` — not on the
 * form. It was on the form first, where it computed to 128px and did nothing at all: the browser
 * still scrolled a tabbed-to control flush to the viewport bottom, underneath the sticky bar.
 * Caught by measuring the focused element against the bar in a real browser; the source-level
 * test passed throughout, because it only checked that the string appeared somewhere.
 *
 * Injected through `useHead` rather than written into `main.css` so it is scoped to this page's
 * lifetime — every other page scrolls normally.
 */
useHead({
  title: 'Mengisi asesmen',
  style: [{ innerHTML: 'html { scroll-padding-bottom: 8rem; }' }],
})

interface SessionDetail {
  session: { id: string; status: string }
  items: {
    versionItemId: string
    position: number
    stem: string
    scalePoints: { value: number; label: string }[]
  }[]
  answers: Record<string, number>
}

const route = useRoute()
const versionId = computed(() => String(route.params.versionId))

/**
 * Nuxt types `$fetch` against the union of every known route, and resolving an interpolated URL
 * against that union makes tsc give up with "Excessive stack depth comparing types". Widening the
 * URL to `string` is not enough — the generic still explores the union — so the call signature is
 * stated once here instead.
 *
 * What this gives up is the route-name check, which these paths never had: they are built from a
 * param, not written as literals. The response shape is still checked, through the explicit `T`.
 */
const apiFetch = $fetch as unknown as <T>(
  url: string,
  options?: Record<string, unknown>
) => Promise<T>

/**
 * `POST .../sessions` rather than a GET: starting and resuming are the same call (#64), so this
 * works on a first visit and a return visit without the page having to know which it is.
 *
 * `useRequestFetch()`, not a bare `$fetch`. On a client-side navigation the two behave the same,
 * which is exactly what makes the difference easy to miss — but this call also runs during SSR on
 * a fresh load or a refresh, and a bare `$fetch` forwards no cookie there, so the request arrives
 * unauthenticated and the page renders its error state. That is the *resume* path #60 cares most
 * about. `app/middleware/auth.ts` already carries the same note for the same reason.
 */
const requestFetch = useRequestFetch() as unknown as typeof apiFetch

const { data, pending, error } = await useAsyncData<SessionDetail>(
  () => `assessment-session-${versionId.value}`,
  () =>
    requestFetch<SessionDetail>(`/api/v1/assessment/versions/${versionId.value}/sessions`, {
      method: 'POST',
    })
)

const detail = computed(() => data.value)
const sessionId = computed(() => detail.value?.session.id ?? '')

const session = useAssessmentSession({
  items: detail.value?.items ?? [],
  initialAnswers: detail.value?.answers ?? {},
  save: async (versionItemId, answerValue) => {
    await apiFetch(`/api/v1/assessment/sessions/${sessionId.value}/responses`, {
      method: 'PUT',
      body: { versionItemId, answerValue },
    })
  },
  submit: async () => {
    await apiFetch(`/api/v1/assessment/sessions/${sessionId.value}/submit`, { method: 'POST' })
  },
})

onBeforeUnmount(() => session.dispose())

/** A session already submitted has nothing to answer — send it to its confirmation instead. */
if (detail.value && detail.value.session.status !== 'in_progress') {
  await navigateTo(`/assessment/${versionId.value}/selesai`)
}

function scrollToItem(versionItemId: string, behavior: ScrollBehavior = 'smooth') {
  document.getElementById(`item-${versionItemId}`)?.scrollIntoView({ block: 'center', behavior })
}

onMounted(() => {
  // Resume lands the student where they stopped. No banner announcing it — the scroll position
  // says it, and 'auto' rather than 'smooth' because this is arrival, not a reaction to a click.
  const target = session.firstUnansweredId.value
  if (target) scrollToItem(target, 'auto')
})

async function onSubmit() {
  if (await session.submitAll()) {
    await navigateTo(`/assessment/${versionId.value}/selesai`)
  }
}
</script>

<template>
  <div>
    <p v-if="error" class="text-destructive text-body-sm" role="alert">
      Asesmen ini tidak dapat dibuka. Kembali ke
      <NuxtLink to="/assessment">daftar asesmen</NuxtLink>.
    </p>

    <div v-else-if="pending" class="flex flex-col gap-space-4">
      <Skeleton v-for="n in 3" :key="n" class="h-40 rounded-lg" />
    </div>

    <div v-else-if="detail" class="assessment-form flex flex-col gap-space-8">
      <!-- One shared region for every save. Polite and debounced: a burst of per-item
           announcements is worse than silence for a screen reader user (#63, SC 4.1.3). -->
      <p class="sr-only" role="status" aria-live="polite">{{ session.statusMessage.value }}</p>

      <header class="flex flex-col gap-space-3">
        <h1 class="text-ink-900 text-heading-lg font-semibold">Asesmen Gaya Kepemimpinan</h1>
        <p class="text-muted-600 text-body-sm">
          {{ session.answeredCount.value }} dari {{ session.total.value }} pertanyaan terjawab.
          Jawab dengan urutan bebas — kemajuan disimpan otomatis.
        </p>

        <!-- The jump map: free navigation, and a glance at what is left (#60). -->
        <nav aria-label="Lompat ke pertanyaan">
          <ul class="flex list-none flex-wrap gap-space-2 p-0">
            <li v-for="item in detail.items" :key="item.versionItemId">
              <button
                type="button"
                class="border-border-strong text-body-sm grid size-11 place-items-center rounded-full border font-semibold"
                :class="
                  item.versionItemId in session.answers
                    ? 'bg-primary-600 text-on-primary border-primary-600'
                    : 'text-body-700'
                "
                :aria-label="`Ke pertanyaan ${item.position + 1}, ${
                  item.versionItemId in session.answers ? 'sudah terjawab' : 'belum terjawab'
                }`"
                @click="scrollToItem(item.versionItemId)"
              >
                {{ item.position + 1 }}
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <fieldset
        v-for="item in detail.items"
        :id="`item-${item.versionItemId}`"
        :key="item.versionItemId"
        class="border-0 p-0"
      >
        <legend class="text-ink-900 text-body-lg mb-space-3 font-semibold">
          {{ item.position + 1 }}. {{ item.stem }}
        </legend>

        <div class="flex flex-col gap-space-2">
          <label
            v-for="point in item.scalePoints"
            :key="point.value"
            class="border-border has-[:checked]:border-primary-600 flex min-h-11 cursor-pointer items-center gap-space-3 rounded-lg border px-space-4 py-space-2"
          >
            <input
              type="radio"
              :name="`item-${item.versionItemId}`"
              :value="point.value"
              :checked="session.answers[item.versionItemId] === point.value"
              class="accent-primary-600 size-5 shrink-0"
              @change="session.setAnswer(item.versionItemId, point.value)"
            >
            <span class="text-body-700 text-body-md">{{ point.label }}</span>
          </label>
        </div>

        <p
          v-if="session.states[item.versionItemId]?.state === 'failed'"
          class="mt-space-2 flex items-center gap-space-3"
        >
          <span class="text-destructive text-body-sm">
            Gagal menyimpan. Periksa koneksimu, lalu coba lagi.
          </span>
          <Button variant="outline" size="sm" @click="session.retry(item.versionItemId)">
            Coba lagi
          </Button>
        </p>
        <p
          v-else-if="session.states[item.versionItemId]?.state === 'saved'"
          class="text-muted-600 text-caption mt-space-2"
        >
          Tersimpan
        </p>
      </fieldset>
    </div>

    <!-- Sticky, and the form above carries scroll-padding so it never covers the focused
         control (#63, SC 2.4.11). -->
    <div
      v-if="detail"
      class="border-border bg-surface fixed inset-x-0 bottom-0 flex items-center justify-between gap-space-4 border-t px-space-4 py-space-3"
    >
      <span class="text-muted-600 text-body-sm">
        {{ session.answeredCount.value }}/{{ session.total.value }}
      </span>

      <div class="flex items-center gap-space-3">
        <span v-if="session.failedItemIds.value.length" class="text-destructive text-body-sm">
          {{ session.failedItemIds.value.length }} jawaban belum tersimpan
        </span>
        <Button :disabled="!session.canSubmit.value || session.submitting.value" @click="onSubmit">
          {{ session.submitting.value ? 'Mengirim…' : 'Kirim Jawaban' }}
        </Button>
      </div>
    </div>

    <p v-if="session.submitError.value" class="text-destructive text-body-sm" role="alert">
      {{ session.submitError.value }}
    </p>
  </div>
</template>

<style scoped>
/* Room for the sticky bar at the end of the form, so the last question can be scrolled clear of
 * it. The other half of SC 2.4.11 — keeping a *focused* control clear — is `scroll-padding-bottom`
 * on `<html>`, set in `useHead` above, because that property only has an effect on the element
 * that actually scrolls. */
.assessment-form {
  padding-bottom: 8rem;
}
</style>
