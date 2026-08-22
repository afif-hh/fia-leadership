import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names, resolving Tailwind conflicts so the last value wins.
 *
 * Written by hand rather than by `shadcn-vue init`: that run installed its
 * dependencies and then aborted on a pnpm exit code before it reached this file,
 * leaving every `@/lib/utils` import in app/components/ui/ unresolved.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
