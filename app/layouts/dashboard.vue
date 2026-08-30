<script setup lang="ts">
/**
 * The Lab Admin shell. `sidebar-08` reproduced from primitives and reskinned to the FIA tokens —
 * `sidebar-08` is not an installable block in the configured `reka-nova` style (issue #18), so this
 * is its shape rather than its source.
 *
 * Explicit imports, not Nuxt auto-import: Nuxt registers these as `UiSidebar`,
 * `UiSidebarMenuButton` and so on, directory-prefixed names that match nothing in shadcn-vue's
 * documentation, so no upstream example pastes in unchanged.
 *
 * No colour literal appears here. `tokens.css` owns every value and `main.css` holds only the
 * shadcn aliases, so `bg-sidebar` and `text-muted-foreground` resolve to FIA tokens and flip under
 * `[data-theme="dark"]` without this file knowing. Dark mode therefore works through the existing
 * `useTheme()` composable rather than a second mechanism.
 */
import { ClipboardList, LayoutDashboard, ScrollText, Users } from '@lucide/vue'
import { computed } from 'vue'

import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar/utils'
import { resolvePageTitle, useDashboardSession } from '@/composables/useDashboardSession'

/**
 * The sidebar's collapsed state, read where the server can see it.
 *
 * `SidebarProvider`'s own default reads `document.cookie`, which does not exist during SSR, so it
 * always resolved to open and a visitor who had collapsed the sidebar was served it expanded and
 * watched it snap shut after hydration. `useCookie` reads the request header on the server and the
 * document on the client, so both renders agree. Passing it from here keeps the Nuxt dependency
 * out of the vendored shadcn component, whose default stays as the fallback for other callers.
 *
 * Compared as a string because `useCookie` parses values with `destr`: `setOpen` writes the text
 * `false`, and it comes back as the boolean, which is not equal to the string it was written as.
 */
const sidebarDefaultOpen = String(useCookie(SIDEBAR_COOKIE_NAME).value) !== 'false'

const { navigation, principal } = useDashboardSession()
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()

const ICONS: Record<string, unknown> = {
  overview: LayoutDashboard,
  users: Users,
  audit: ScrollText,
}

const GROUP_ORDER = ['operate', 'configure', 'insight'] as const

/** Resolved from the navigation, so no page can forget to set it. See `resolvePageTitle`. */
const pageTitle = computed(() =>
  resolvePageTitle(navigation.value, route.path, t('dashboard.title'))
)

const initials = computed(() => (principal.value?.email ?? '?').slice(0, 2).toUpperCase())

async function onSignOut() {
  const { signOut } = await import('@/utils/auth-client')
  await signOut()
  await navigateTo(localePath('/sign-in'))
}

const groups = computed(() =>
  GROUP_ORDER.map((group) => ({
    group,
    label: t(`dashboard.navGroup.${group}`),
    items: navigation.value.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0)
)
</script>

<template>
  <SidebarProvider :default-open="sidebarDefaultOpen">
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" as-child>
              <NuxtLink :to="localePath('/dashboard')">
                <div
                  class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
                >
                  <ClipboardList class="size-4" aria-hidden="true" />
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-medium">{{ t('nav.brand') }}</span>
                  <span class="text-muted-foreground truncate text-xs">{{
                    t('dashboard.labAdmin')
                  }}</span>
                </div>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup v-for="group in groups" :key="group.group">
          <SidebarGroupLabel>{{ group.label }}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in group.items" :key="item.id">
              <!--
                Unavailable items render visible and disabled rather than hidden, so the navigation
                has the shape of the finished product and grows by filling in instead of by
                redesign (issue #22).

                `aria-disabled` and the visible "Later" text are both required: a greyed item with
                no programmatic state does not exist for assistive technology, and colour alone
                fails WCAG 2.2 AA. This is an accessibility obligation, not styling.
              -->
              <SidebarMenuButton
                v-if="!item.available"
                as="div"
                :aria-disabled="true"
                :tooltip="t('dashboard.notInThisPhase', { item: item.label })"
                class="cursor-not-allowed opacity-60"
              >
                <component :is="ICONS[item.id] ?? ClipboardList" aria-hidden="true" />
                <span>{{ item.label }}</span>
                <span class="text-muted-foreground ml-auto text-xs">{{
                  t('dashboard.later')
                }}</span>
              </SidebarMenuButton>

              <SidebarMenuButton
                v-else
                as-child
                :tooltip="item.label"
                :is-active="route.path === item.to"
              >
                <NuxtLink :to="localePath(item.to!)">
                  <component :is="ICONS[item.id] ?? ClipboardList" aria-hidden="true" />
                  <span>{{ item.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <!-- Own Profile and Own Assessment live here, not in the rail: they are the admin's own
           records rather than administrative surfaces (issue #22). -->
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <SidebarMenuButton size="lg">
                  <Avatar class="size-8 rounded-lg">
                    <AvatarFallback class="rounded-lg">{{ initials }}</AvatarFallback>
                  </Avatar>
                  <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-medium">{{
                      principal?.email ?? t('dashboard.signedIn')
                    }}</span>
                    <span class="text-muted-foreground truncate text-xs">
                      {{ principal?.roles?.join(', ') || t('dashboard.noRoles') }}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" class="w-(--reka-dropdown-menu-trigger-width)">
                <DropdownMenuLabel>{{ principal?.email ?? '' }}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled>{{ t('dashboard.myProfile') }}</DropdownMenuItem>
                  <DropdownMenuItem disabled>{{ t('dashboard.myAssessment') }}</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem @select="onSignOut">{{
                    t('dashboard.signOut')
                  }}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>

    <SidebarInset>
      <header class="flex h-16 shrink-0 items-center gap-2 border-b border-border">
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1" />
          <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
          <!--
            Derived from the navigation rather than passed in by the page. A Nuxt page cannot fill
            a layout's named slot — `<template #title>` in a page body is not slot content, it is
            a second template root — so the layout resolves the heading itself from the active
            route. One source, and no page can forget to set it.
          -->
          <h1 class="text-sm font-medium">{{ pageTitle }}</h1>
        </div>
        <div class="ml-auto px-4">
          <LanguageSwitcher />
        </div>
      </header>

      <!--
        A div, not a second main landmark: `SidebarInset` already renders the page's `main`, and
        two of them left every dashboard page with duplicate landmarks — a screen-reader user
        cycling landmarks lands twice on what is one region. The id stays here rather than moving
        to the inset, because it is the skip link's target and it should skip past the header to
        the content, not to the region that contains the header.
      -->
      <div id="main-content" class="flex flex-1 flex-col gap-4 p-4">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
