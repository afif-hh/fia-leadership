import { ref, watch, onMounted } from 'vue'

type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'theme'

export function useTheme() {
  const theme = ref<Theme>('system')
  const resolvedTheme = ref<'light' | 'dark'>('light')
  const isSystemDark = ref(false)

  const getSystemPreference = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  const applyTheme = (t: 'light' | 'dark') => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', t)
    resolvedTheme.value = t
  }

  const updateResolvedTheme = () => {
    if (theme.value === 'system') {
      applyTheme(getSystemPreference())
    } else {
      applyTheme(theme.value)
    }
  }

  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, newTheme)
    }
    updateResolvedTheme()
  }

  const toggleTheme = () => {
    // Expressed as an exhaustive map rather than an array index: the cycle is
    // stated once and readably, and it needs no non-null assertion. Indexing an
    // array cannot be proven in-range under the strict config, even when the
    // modulo makes it so.
    const next: Record<Theme, Theme> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    }
    setTheme(next[theme.value])
  }

  onMounted(() => {
    // Load saved preference
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        theme.value = saved
      }
    }

    // Listen for system preference changes
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      isSystemDark.value = mediaQuery.matches

      mediaQuery.addEventListener('change', (e) => {
        isSystemDark.value = e.matches
        if (theme.value === 'system') {
          applyTheme(e.matches ? 'dark' : 'light')
        }
      })
    }

    updateResolvedTheme()
  })

  watch(theme, updateResolvedTheme)

  return {
    theme,
    resolvedTheme,
    isSystemDark,
    setTheme,
    toggleTheme,
  }
}
