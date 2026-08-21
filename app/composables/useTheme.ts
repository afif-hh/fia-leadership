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
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme.value)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
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
