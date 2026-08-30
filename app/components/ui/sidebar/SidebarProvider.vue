<script setup lang="ts">
import type { HTMLAttributes, Ref } from 'vue'
import { defaultDocument, useEventListener, useMediaQuery, useVModel } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { computed, onMounted, ref } from 'vue'
import { cn } from '@/lib/utils'
import { provideSidebarContext, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_KEYBOARD_SHORTCUT, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from './utils'

const props = withDefaults(defineProps<{
  defaultOpen?: boolean
  open?: boolean
  class?: HTMLAttributes['class']
}>(), {
  defaultOpen: !defaultDocument?.cookie.includes(`${SIDEBAR_COOKIE_NAME}=false`),
  open: undefined,
})

const emits = defineEmits<{
  'update:open': [open: boolean]
}>()

/**
 * `isMobile` stays false until the component is mounted.
 *
 * `useMediaQuery` has no viewport to measure during SSR and returns false, so the server always
 * renders `Sidebar.vue`'s desktop branch. Reading the media query directly meant a narrow client
 * chose the `<Sheet>` branch at hydration instead, and Vue tore down and rebuilt the whole sidebar
 * subtree with "Hydration node mismatch" on every dashboard route below 768px. Gating on `mounted`
 * makes the client's first render match the server's; the swap to the sheet then happens as an
 * ordinary reactive update, which is what a media query is allowed to do.
 *
 * `defaultOpen` above has the same shape of problem and is fixed at the call site instead:
 * `defaultDocument` is undefined during SSR, so the default resolves to open whatever the cookie
 * says. `app/layouts/dashboard.vue` passes the value through `useCookie`, which the server can
 * read. This default remains the fallback for a caller that passes nothing.
 */
const viewportIsMobile = useMediaQuery('(max-width: 768px)')
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const isMobile = computed(() => mounted.value && viewportIsMobile.value)

const openMobile = ref(false)

const open = useVModel(props, 'open', emits, {
  defaultValue: props.defaultOpen ?? false,
  passive: (props.open === undefined) as false,
}) as Ref<boolean>

function setOpen(value: boolean) {
  open.value = value // emits('update:open', value)

  // This sets the cookie to keep the sidebar state.
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
}

function setOpenMobile(value: boolean) {
  openMobile.value = value
}

// Helper to toggle the sidebar.
function toggleSidebar() {
  return isMobile.value ? setOpenMobile(!openMobile.value) : setOpen(!open.value)
}

useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    toggleSidebar()
  }
})

// We add a state so that we can do data-state="expanded" or "collapsed".
// This makes it easier to style the sidebar with Tailwind classes.
const state = computed(() => open.value ? 'expanded' : 'collapsed')

provideSidebarContext({
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
})
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
      :class="cn('group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full', props.class)"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
