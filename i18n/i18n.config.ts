/**
 * A missing English key renders the Indonesian string rather than the raw key. Shipping a
 * partially translated surface is acceptable; shipping `dashboard.audit.title` to a user is not.
 */
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'id',
  fallbackWarn: false,
  missingWarn: false,
}))
