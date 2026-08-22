<script setup lang="ts">
// Throwaway prototype for issue #18 — proves the shadcn-vue reskin resolves to
// FIA tokens in a real render, not just in the built stylesheet.
//
// Not the dashboard shell. The navigation tree is decided in #22 and the shell
// is built in #25; this file exists only to be looked at and deleted. The nav
// labels below are placeholders taken from the sidebar-08 demo, deliberately not
// the Lab Admin tree, so nothing here can be mistaken for the real thing.
import { ChevronRight, Command, LifeBuoy, Send, Settings2, SquareTerminal } from '@lucide/vue'

// Explicit imports, not Nuxt auto-import. Nuxt registers these as UiSidebar,
// UiSidebarProvider, UiSidebarMenuSubButton and so on — directory-prefixed names
// that match nothing in shadcn-vue's documentation, so no upstream example can be
// pasted in unchanged. Importing explicitly also keeps the dependency visible to
// the no-restricted-imports boundary that #34 made the only enforcer of
// per-domain isolation; an auto-imported component has no import to inspect.
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuAction, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'

const navMain = [
  { title: 'Placeholder A', icon: SquareTerminal, items: ['One', 'Two', 'Three'] },
  { title: 'Placeholder B', icon: Settings2, items: ['Four', 'Five'] },
]
const navSecondary = [
  { title: 'Support', icon: LifeBuoy },
  { title: 'Feedback', icon: Send },
]
</script>

<template>
  <SidebarProvider>
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Command class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">FIA Leadership Lab</span>
                <span class="text-muted-foreground truncate text-xs">Prototype</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Placeholder group</SidebarGroupLabel>
          <SidebarMenu>
            <Collapsible v-for="item in navMain" :key="item.title" as-child default-open>
              <SidebarMenuItem>
                <SidebarMenuButton :tooltip="item.title">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </SidebarMenuButton>
                <CollapsibleTrigger as-child>
                  <SidebarMenuAction class="data-[state=open]:rotate-90">
                    <ChevronRight />
                    <span class="sr-only">Toggle</span>
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="sub in item.items" :key="sub">
                      <SidebarMenuSubButton>
                        <span>{{ sub }}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup class="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="item in navSecondary" :key="item.title">
                <SidebarMenuButton size="sm">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>

    <SidebarInset>
      <header class="flex h-16 shrink-0 items-center gap-2">
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1" />
          <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Token reskin prototype</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div class="grid auto-rows-min gap-4 md:grid-cols-3">
          <div class="bg-muted/50 aspect-video rounded-xl" />
          <div class="bg-muted/50 aspect-video rounded-xl" />
          <div class="bg-muted/50 aspect-video rounded-xl" />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
