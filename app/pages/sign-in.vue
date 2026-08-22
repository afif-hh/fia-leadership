<script setup lang="ts">
/**
 * Sign-in. Built here because `app/middleware/auth.ts` already redirects to `/sign-in` and the
 * page did not exist — so every protected route redirected to a 404 and the shell was unreachable.
 *
 * Email and password, matching the server: `disableSignUp: true`, so there is no registration
 * link. The first Lab Admin comes from `server/db/seed/create-user.ts`; everyone else is
 * granted an account. Password reset is deferred with the email service (issue #19).
 */
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn } from '@/utils/auth-client'

useHead({ title: 'Sign in · FIA Leadership Lab' })

const route = useRoute()

/**
 * Only an internal, absolute path is accepted.
 *
 * `navigateTo` already refuses an external target — it computes
 * `hasProtocol(path, { acceptRelative: true })`, which catches `//evil.example` as well as
 * `https://evil.example`, and throws. But relying on that means a user who follows a crafted link
 * signs in successfully and then hits a thrown navigation error instead of landing anywhere, and it
 * leaves the code one `{ external: true }` away from a real open redirect. Validating our own input
 * is cheaper than depending on someone else's guard.
 */
function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/dashboard'
  if (!value.startsWith('/')) return '/dashboard'
  // `//host` is protocol-relative and leaves the origin; `/\host` is the backslash variant some
  // parsers normalise the same way.
  if (value.startsWith('//') || value.startsWith('/\\')) return '/dashboard'
  return value
}

/** Set by the middleware when a valid session belongs to a deactivated account (FR-023). */
const disabled = computed(() => route.query.reason === 'disabled')

const email = ref('')
const password = ref('')
const pending = ref(false)
const message = ref('')

async function onSubmit() {
  pending.value = true
  message.value = ''

  const { error } = await signIn.email({ email: email.value, password: password.value })

  pending.value = false
  if (error) {
    // Deliberately not "no such account" or "wrong password": either would confirm whether an
    // address is registered, and disableSignUp means that is not otherwise discoverable.
    message.value = 'Those credentials were not accepted.'
    return
  }

  await navigateTo(safeRedirect(route.query.redirect))
}
</script>

<template>
  <main id="main-content" class="bg-background flex min-h-dvh items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <h1 class="text-xl font-semibold">FIA Leadership Lab</h1>
      <p class="text-muted-foreground mt-1 text-sm">Sign in to the Lab Admin dashboard.</p>

      <!--
        Shown when the middleware found a valid session on a deactivated account. Saying so is
        deliberate: the person holding that session already knows who they are, and a bare sign-in
        form they can never get past is worse than a plain explanation. It reveals nothing to
        anyone who does not already hold the session.
      -->
      <p
        v-if="disabled"
        role="status"
        class="border-border bg-card text-muted-foreground mt-4 rounded-lg border p-3 text-sm"
      >
        This account has been deactivated. Contact the Lab Admin team if you think that is wrong.
      </p>

      <form class="mt-6 flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-2">
          <label for="email" class="text-sm font-medium">Email</label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            :aria-invalid="Boolean(message) || undefined"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :aria-invalid="Boolean(message) || undefined"
          />
        </div>

        <!-- role="alert" so assistive technology announces the failure without a focus move. -->
        <p v-if="message" role="alert" class="text-destructive text-sm">{{ message }}</p>

        <Button type="submit" :disabled="pending">
          {{ pending ? 'Signing in…' : 'Sign in' }}
        </Button>
      </form>
    </div>
  </main>
</template>
