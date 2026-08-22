<script setup lang="ts">
/**
 * Sign-in. Built here because `app/middleware/auth.ts` already redirects to `/sign-in` and the
 * page did not exist — so every protected route redirected to a 404 and the shell was unreachable.
 *
 * Email and password, matching the server: `disableSignUp: true`, so there is no registration
 * link. The first Lab Admin comes from `server/db/seed/create-lab-admin.ts`; everyone else is
 * granted an account. Password reset is deferred with the email service (issue #19).
 */
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn } from '@/utils/auth-client'

useHead({ title: 'Sign in · FIA Leadership Lab' })

const route = useRoute()
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

  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  await navigateTo(redirect)
}
</script>

<template>
  <main id="main-content" class="bg-background flex min-h-dvh items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <h1 class="text-xl font-semibold">FIA Leadership Lab</h1>
      <p class="text-muted-foreground mt-1 text-sm">Sign in to the Lab Admin dashboard.</p>

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
