/**
 * Turning the API's error envelope into a sentence for the person on screen.
 *
 * `docs/architecture/api-design.md` fixes the envelope's `code` as a stable SCREAMING_SNAKE
 * identifier and says the message is for a developer. That split is what makes the app
 * translatable at all: the server keeps sending one code, and each locale renders its own
 * sentence from `errors.<CODE>`.
 *
 * An unrecognised code falls back to the caller's own key rather than to the envelope's message,
 * because the envelope's message is written in one language and aimed at a log.
 */
export function useApiError() {
  const { t, te } = useI18n()

  function messageFor(error: unknown, fallbackKey: string): string {
    const code = (error as { data?: { error?: { code?: string } } } | null)?.data?.error?.code
    if (code && te(`errors.${code}`)) return t(`errors.${code}`)
    return t(fallbackKey)
  }

  return { messageFor }
}
